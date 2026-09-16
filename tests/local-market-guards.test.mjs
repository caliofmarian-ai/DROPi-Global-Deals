import test from "node:test";
import assert from "node:assert/strict";
import { enrichCatalog } from "../lib/catalog.mjs";
import { applyLocalMarketGuards } from "../lib/local-market-guards.mjs";

test("ambiguous cheaper Irish guard blocks an otherwise verified import win", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  const enriched = enrichCatalog({ products:[{
    id:"cassette",
    qualityStatus:"verified",
    irelandOffers:[
      {seller:"Exact local",price:98.99,comparisonEligible:true,availability:"in_stock",checkedAt:"2026-09-16"},
      {seller:"Ambiguous local",price:58.20,comparisonEligible:false,guardPositiveVerdict:true,observedAt:"2026-09-16"}
    ],
    sourceOffers:[{
      seller:"Germany",productPrice:49.99,shippingToIreland:9.95,shipsToIreland:true,dispatchCountry:"Germany",dispatchInEu:true,comparisonEligible:true,qualityStatus:"verified",checkedAt:"2026-09-16"
    }]
  }] }, now);
  assert.equal(enriched.products[0].derived.status, "verified_deal");
  assert.equal(enriched.products[0].derived.landedCost, 59.94);
  const guarded = applyLocalMarketGuards(enriched).products[0];
  assert.equal(guarded.derived.status, "needs_local_recheck");
  assert.equal(guarded.derived.publishableDeal, false);
  assert.equal(guarded.derived.localMarketGuard.price, 58.2);
  assert.equal(guarded.derived.sourceRoutes[0].status, "needs_local_recheck");
});

test("guard above candidate landed cost is visible but does not suppress a verified deal", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  const enriched = enrichCatalog({ products:[{
    id:"p",qualityStatus:"verified",
    irelandOffers:[
      {seller:"Exact",price:90,comparisonEligible:true,checkedAt:"2026-09-16"},
      {seller:"Ambiguous",price:70,comparisonEligible:false,guardPositiveVerdict:true}
    ],
    sourceOffers:[{seller:"EU",productPrice:40,shippingToIreland:10,shipsToIreland:true,dispatchInEu:true,comparisonEligible:true,qualityStatus:"verified",checkedAt:"2026-09-16"}]
  }] }, now);
  const guarded = applyLocalMarketGuards(enriched).products[0];
  assert.equal(guarded.derived.status, "verified_deal");
  assert.equal(guarded.derived.publishableDeal, true);
  assert.equal(guarded.derived.localMarketGuard.price, 70);
});

test("fresh exact local price beats route without needing an ambiguity guard", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  const enriched = enrichCatalog({ products:[{
    id:"tyre",qualityStatus:"verified",
    irelandOffers:[{seller:"Dublin",price:29.99,comparisonEligible:true,checkedAt:"2026-09-16"}],
    sourceOffers:[{seller:"Germany",productPrice:44.99,shippingToIreland:9.99,shipsToIreland:true,dispatchInEu:true,comparisonEligible:true,qualityStatus:"verified",checkedAt:"2026-09-16"}]
  }] }, now);
  const guarded = applyLocalMarketGuards(enriched).products[0];
  assert.equal(guarded.derived.status, "no_verified_import_win");
  assert.equal(guarded.derived.publishableDeal, false);
  assert.equal(guarded.derived.sourceRoutes[0].status, "rejected_local_cheaper");
});
