import test from "node:test";
import assert from "node:assert/strict";
import { evaluateProduct, evaluateSourceOffer, priceFreshness, selectIrelandOffer } from "../lib/catalog.mjs";

const now = new Date("2026-09-15T12:00:00Z");

test("freshness expires dated price evidence", () => {
  assert.deepEqual(priceFreshness("2026-09-15", now, 7), { state: "fresh", ageDays: 0 });
  assert.deepEqual(priceFreshness("2026-09-01", now, 7), { state: "stale", ageDays: 14 });
});

test("Irish market keeps lowest known offer while also exposing lowest fresh offer", () => {
  const result = selectIrelandOffer({ freshForDays: 7, irelandOffers: [
    { seller: "Old cheap", price: 35, checkedAt: "2026-08-01", availability: "in_stock" },
    { seller: "Fresh", price: 40, checkedAt: "2026-09-15", availability: "in_stock" }
  ]}, now);
  assert.equal(result.price, 35);
  assert.equal(result.offer.seller, "Old cheap");
  assert.equal(result.freshPrice, 40);
  assert.equal(result.freshOffer.seller, "Fresh");
});

test("Irish market excludes out-of-stock and non-comparable offers", () => {
  const result = selectIrelandOffer({ irelandOffers: [
    { seller: "Sold out", price: 20, checkedAt: "2026-09-15", availability: "out_of_stock" },
    { seller: "Wrong variant", price: 21, checkedAt: "2026-09-15", comparisonEligible: false },
    { seller: "Valid", price: 30, checkedAt: "2026-09-15", availability: "in_stock" }
  ]}, now);
  assert.equal(result.price, 30);
  assert.equal(result.offer.seller, "Valid");
});

test("complete EU source route calculates break-even shipping and rejects a local loss", () => {
  const ireland = selectIrelandOffer({ irelandOffers: [{ seller:"Joyces", price:43.99, checkedAt:"2026-09-10", availability:"in_stock" }] }, now);
  const route = evaluateSourceOffer({ qualityStatus:"verified" }, {
    seller:"Aromatico", productPrice:26.90, shippingToIreland:19.90, shipsToIreland:true,
    dispatchCountry:"Germany", dispatchInEu:true, comparisonEligible:true, qualityStatus:"verified", checkedAt:"2026-09-11"
  }, ireland, now);
  assert.equal(route.landedCost, 46.8);
  assert.equal(route.breakEvenShipping, 17.09);
  assert.equal(route.shippingOverBreakEven, 2.81);
  assert.equal(route.status, "rejected_local_cheaper");
});

test("seller that does not ship to Ireland is retained as rejected route evidence", () => {
  const ireland = selectIrelandOffer({ irelandOffers: [{ seller:"IE", price:50, checkedAt:"2026-09-15" }] }, now);
  const route = evaluateSourceOffer({ qualityStatus:"verified" }, { seller:"DE only", productPrice:20, shipsToIreland:false, checkedAt:"2026-09-15" }, ireland, now);
  assert.equal(route.status, "no_ireland_delivery");
  assert.equal(route.publishableRoute, false);
});

test("unknown shipping cannot become a route saving", () => {
  const ireland = selectIrelandOffer({ irelandOffers: [{ seller:"IE", price:50, checkedAt:"2026-09-15" }] }, now);
  const route = evaluateSourceOffer({ qualityStatus:"verified" }, { seller:"Seller", productPrice:25, shippingToIreland:null, shipsToIreland:true, dispatchInEu:true, checkedAt:"2026-09-15" }, ireland, now);
  assert.equal(route.status, "needs_shipping_quote");
});

test("positive source route is blocked by a cheaper stale Irish floor", () => {
  const result = evaluateProduct({
    qualityStatus:"verified",
    irelandOffers:[
      { seller:"Old cheap", price:35, checkedAt:"2026-08-01", availability:"in_stock" },
      { seller:"Fresh", price:50, checkedAt:"2026-09-15", availability:"in_stock" }
    ],
    sourceOffers:[{ seller:"Source", productPrice:30, shippingToIreland:5, shipsToIreland:true, dispatchInEu:true, checkedAt:"2026-09-15", qualityStatus:"verified" }]
  }, now);
  assert.equal(result.derived.status, "needs_local_recheck");
  assert.equal(result.derived.publishableDeal, false);
});

test("fully fresh complete route can become verified deal", () => {
  const result = evaluateProduct({
    qualityStatus:"verified",
    irelandOffers:[{ seller:"IE", price:50, checkedAt:"2026-09-15", availability:"in_stock" }],
    sourceOffers:[{ seller:"Source", productPrice:30, shippingToIreland:5, shipsToIreland:true, dispatchInEu:true, checkedAt:"2026-09-15", qualityStatus:"verified" }]
  }, now);
  assert.equal(result.derived.status, "verified_deal");
  assert.equal(result.derived.landedCost, 35);
  assert.equal(result.derived.savings, 15);
});

test("all complete source routes losing to fresh Ireland yields no import win yet", () => {
  const result = evaluateProduct({
    qualityStatus:"verified",
    irelandOffers:[{ seller:"IE", price:40, checkedAt:"2026-09-15", availability:"in_stock" }],
    sourceOffers:[{ seller:"Source", productPrice:30, shippingToIreland:15, shipsToIreland:true, dispatchInEu:true, checkedAt:"2026-09-15", qualityStatus:"verified" }]
  }, now);
  assert.equal(result.derived.status, "no_verified_import_win");
  assert.equal(result.derived.publishableDeal, false);
});

test("legacy product with missing shipping remains blocked", () => {
  const result = evaluateProduct({ irelandOffers:[{seller:"Ireland",price:43.99,checkedAt:"2026-09-15",availability:"in_stock"}], sourcePrice:25.19, sourceCheckedAt:"2026-09-15", shippingToIreland:null, dispatchInEu:true, qualityStatus:"verified", checkedAt:"2026-09-15" }, now);
  assert.equal(result.derived.status, "needs_shipping_quote");
  assert.equal(result.derived.publishableDeal, false);
});
