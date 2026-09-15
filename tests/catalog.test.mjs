import test from "node:test";
import assert from "node:assert/strict";
import { evaluateProduct, priceFreshness } from "../lib/catalog.mjs";

const now = new Date("2026-09-15T12:00:00Z");

test("freshness expires dated price evidence", () => {
  assert.deepEqual(priceFreshness("2026-09-15", now, 7), { state: "fresh", ageDays: 0 });
  assert.deepEqual(priceFreshness("2026-09-01", now, 7), { state: "stale", ageDays: 14 });
});

test("raw price gap with missing Ireland shipping is not a deal", () => {
  const result = evaluateProduct({
    irelandPrice: 43.99,
    sourcePrice: 25.19,
    shippingToIreland: null,
    dispatchInEu: true,
    qualityStatus: "verified",
    checkedAt: "2026-09-15"
  }, now);
  assert.equal(result.derived.status, "needs_shipping_quote");
  assert.equal(result.derived.publishableDeal, false);
  assert.equal(result.derived.rawGap, 18.8);
});

test("stale evidence is demoted before any deal decision", () => {
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
    irelandPrice: 50,
    sourcePrice: 30,
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
    irelandPrice: 50,
    sourcePrice: 30,
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
    irelandPrice: 40,
    sourcePrice: 30,
    shippingToIreland: 15,
    dispatchInEu: true,
    qualityStatus: "verified",
    checkedAt: "2026-09-15"
  }, now);
  assert.equal(result.derived.status, "cheaper_in_ireland");
  assert.equal(result.derived.savings, -5);
  assert.equal(result.derived.publishableDeal, false);
});
