import test from "node:test";
import assert from "node:assert/strict";
import { evaluateProduct, priceFreshness, selectIrelandOffer } from "../lib/catalog.mjs";

const now = new Date("2026-09-15T12:00:00Z");

test("freshness expires dated price evidence", () => {
  assert.deepEqual(priceFreshness("2026-09-15", now, 7), { state: "fresh", ageDays: 0 });
  assert.deepEqual(priceFreshness("2026-09-01", now, 7), { state: "stale", ageDays: 14 });
});

test("Irish market selector uses the lowest eligible offer even when it needs a recheck", () => {
  const result = selectIrelandOffer({ freshForDays: 7, irelandOffers: [
    { seller: "A", price: 40, checkedAt: "2026-09-15", availability: "in_stock" },
    { seller: "B", price: 35, checkedAt: "2026-08-01", availability: "in_stock" }
  ]}, now);
  assert.equal(result.price, 35);
  assert.equal(result.offer.seller, "B");
  assert.equal(result.freshness.state, "stale");
});

test("Irish market selector excludes out-of-stock and non-comparable offers", () => {
  const result = selectIrelandOffer({ irelandOffers: [
    { seller: "Too cheap but sold out", price: 20, checkedAt: "2026-09-15", availability: "out_of_stock" },
    { seller: "Wrong variant", price: 21, checkedAt: "2026-09-15", comparisonEligible: false },
    { seller: "Valid", price: 30, checkedAt: "2026-09-15", availability: "in_stock" }
  ]}, now);
  assert.equal(result.price, 30);
  assert.equal(result.offer.seller, "Valid");
});

test("raw price gap with missing Ireland shipping is not a deal", () => {
  const result = evaluateProduct({
    irelandOffers: [{ seller: "Ireland", price: 43.99, checkedAt: "2026-09-15", availability: "in_stock" }],
    sourcePrice: 25.19,
    sourceCheckedAt: "2026-09-15",
    shippingToIreland: null,
    dispatchInEu: true,
    qualityStatus: "verified",
    checkedAt: "2026-09-15"
  }, now);
  assert.equal(result.derived.status, "needs_shipping_quote");
  assert.equal(result.derived.publishableDeal, false);
  assert.equal(result.derived.rawGap, 18.8);
  assert.deepEqual(result.derived.blockers, ["shipping_quote_missing"]);
});

test("a stale cheaper Irish price blocks a positive import verdict", () => {
  const result = evaluateProduct({
    irelandOffers: [
      { seller: "Old cheap local", price: 35, checkedAt: "2026-08-01", availability: "in_stock" },
      { seller: "Fresh local", price: 42, checkedAt: "2026-09-15", availability: "in_stock" }
    ],
    sourcePrice: 25,
    sourceCheckedAt: "2026-09-15",
    shippingToIreland: 5,
    dispatchInEu: true,
    qualityStatus: "verified",
    checkedAt: "2026-09-15"
  }, now);
  assert.equal(result.derived.comparisonIrelandPrice, 35);
  assert.equal(result.derived.status, "needs_local_recheck");
  assert.equal(result.derived.publishableDeal, false);
  assert.deepEqual(result.derived.blockers, ["irish_price_recheck"]);
});

test("stale source evidence is demoted before any deal decision", () => {
  const result = evaluateProduct({
    irelandPrice: 50,
    sourcePrice: 30,
    shippingToIreland: 5,
    dispatchInEu: true,
    qualityStatus: "verified",
    checkedAt: "2026-08-01",
    freshForDays: 7
  }, now);
  assert.equal(result.derived.status, "stale");
  assert.equal(result.derived.publishableDeal, false);
});

test("EU-dispatched verified product can become a verified deal", () => {
  const result = evaluateProduct({
    originCountry: "Philippines",
    dispatchCountry: "Netherlands",
    irelandOffers: [{ seller: "Irish retailer", price: 50, checkedAt: "2026-09-15", availability: "in_stock" }],
    sourcePrice: 30,
    sourceCheckedAt: "2026-09-15",
    shippingToIreland: 5,
    dispatchInEu: true,
    qualityStatus: "verified",
    checkedAt: "2026-09-15"
  }, now);
  assert.equal(result.derived.status, "verified_deal");
  assert.equal(result.derived.landedCost, 35);
  assert.equal(result.derived.savings, 15);
  assert.equal(result.derived.publishableDeal, true);
});

test("landed saving without quality equivalence stays unpublished", () => {
  const result = evaluateProduct({
    irelandOffers: [{ seller: "Irish retailer", price: 50, checkedAt: "2026-09-15", availability: "in_stock" }],
    sourcePrice: 30,
    sourceCheckedAt: "2026-09-15",
    shippingToIreland: 5,
    dispatchInEu: true,
    qualityStatus: "candidate",
    checkedAt: "2026-09-15"
  }, now);
  assert.equal(result.derived.status, "needs_quality_evidence");
  assert.equal(result.derived.publishableDeal, false);
});

test("Ireland remains the winner when landed cost erases the raw gap", () => {
  const result = evaluateProduct({
    irelandOffers: [{ seller: "Irish retailer", price: 40, checkedAt: "2026-09-15", availability: "in_stock" }],
    sourcePrice: 30,
    sourceCheckedAt: "2026-09-15",
    shippingToIreland: 15,
    dispatchInEu: true,
    qualityStatus: "verified",
    checkedAt: "2026-09-15"
  }, now);
  assert.equal(result.derived.status, "cheaper_in_ireland");
  assert.equal(result.derived.savings, -5);
  assert.equal(result.derived.publishableDeal, false);
});
