import test from "node:test";
import assert from "node:assert/strict";
import { enrichCatalog } from "../lib/catalog.mjs";
import { mergeMarketObservations } from "../lib/market-observations.mjs";

test("fresh local observation can invalidate a previously cheaper import route", () => {
  const base = {
    generatedAt: "2026-09-16",
    products: [{
      id: "chain",
      name: "Exact chain",
      category: "Cycling",
      originCountry: "Unknown",
      freshForDays: 7,
      qualityStatus: "verified",
      qualityBasis: "Exact SKU",
      irelandOffers: [{ id:"old-local", seller:"Local", price:43.99, availability:"in_stock", comparisonEligible:true, checkedAt:"2026-09-16" }],
      sourceOffers: [{ id:"eu-route", seller:"EU", productPrice:26.99, shippingToIreland:9.99, shipsToIreland:true, dispatchCountry:"Germany", dispatchInEu:true, comparisonEligible:true, qualityStatus:"verified", checkedAt:"2026-09-16" }]
    }]
  };
  const observations = { products: [{ productId:"chain", irelandOffers:[{ id:"halfords", seller:"Halfords Ireland", price:25.17, availability:"available", comparisonEligible:true, checkedAt:"2026-09-16" }] }] };
  const merged = mergeMarketObservations(base, observations);
  const result = enrichCatalog(merged, new Date("2026-09-16T12:00:00Z")).products[0];
  assert.equal(result.derived.bestFreshIrelandPrice, 25.17);
  assert.equal(result.derived.publishableDeal, false);
  assert.equal(result.derived.status, "no_verified_import_win");
  assert.equal(result.derived.sourceRoutes[0].status, "rejected_local_cheaper");
});

test("new observation replaces the same observation id instead of duplicating it", () => {
  const base = { products:[{ id:"p", irelandOffers:[{ id:"shop-a", seller:"Shop A", price:30, checkedAt:"2026-09-10" }] }] };
  const observations = { products:[{ productId:"p", irelandOffers:[{ id:"shop-a", seller:"Shop A", price:25, checkedAt:"2026-09-16" }] }] };
  const merged = mergeMarketObservations(base, observations);
  assert.equal(merged.products[0].irelandOffers.length, 1);
  assert.equal(merged.products[0].irelandOffers[0].price, 25);
  assert.equal(merged.products[0].irelandOffers[0].checkedAt, "2026-09-16");
});
