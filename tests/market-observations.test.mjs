import test from "node:test";
import assert from "node:assert/strict";
import { enrichCatalog } from "../lib/catalog.mjs";
import { mergeMarketObservations } from "../lib/market-observations.mjs";

const now = new Date("2026-09-16T12:00:00Z");

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
  const result = enrichCatalog(merged, now).products[0];
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

test("observation layer can introduce a newly discovered product without hardcoding base catalog", () => {
  const merged = mergeMarketObservations({ products: [] }, {
    generatedAt: "2026-09-16",
    discoveredProducts: [{
      id: "continental-gp5000-25-622-black",
      name: "Continental GP5000 25-622 black",
      qualityStatus: "verified",
      freshForDays: 7,
      irelandOffers: [{
        id: "ie",
        seller: "2Wheels Dublin",
        price: 79.99,
        availability: "listed",
        comparisonEligible: true,
        checkedAt: "2026-09-11"
      }],
      sourceOffers: [{
        id: "bike24",
        seller: "BIKE24",
        productPrice: 44.99,
        shippingToIreland: 9.99,
        shipsToIreland: true,
        dispatchCountry: "Germany",
        dispatchInEu: true,
        comparisonEligible: true,
        qualityStatus: "verified",
        checkedAt: "2026-09-15"
      }]
    }]
  });

  assert.equal(merged.products.length, 1);
  assert.equal(merged.discoveredProductCount, 1);

  const evaluated = enrichCatalog(merged, now).products[0];
  assert.equal(evaluated.derived.status, "verified_deal");
  assert.equal(evaluated.derived.publishableDeal, true);
  assert.equal(evaluated.derived.landedCost, 54.98);
  assert.equal(evaluated.derived.savings, 25.01);
  assert.equal(evaluated.derived.savingsPercent, 31.27);
});

test("discovered product with same id enriches instead of duplicating a base product", () => {
  const merged = mergeMarketObservations({ products: [{
    id: "same",
    name: "Base",
    irelandOffers: [{ id: "ie-1", seller: "IE", price: 50 }]
  }] }, {
    discoveredProducts: [{
      id: "same",
      name: "Discovered update",
      sourceOffers: [{ id: "src-1", seller: "Source", productPrice: 30 }]
    }]
  });

  assert.equal(merged.products.length, 1);
  assert.equal(merged.products[0].name, "Discovered update");
  assert.equal(merged.products[0].irelandOffers.length, 1);
  assert.equal(merged.products[0].sourceOffers.length, 1);
});

test("ordinary observation patch still overrides matching offer by id", () => {
  const merged = mergeMarketObservations({ products: [{
    id: "p1",
    irelandOffers: [{ id: "shop", seller: "Shop", price: 50 }]
  }] }, {
    products: [{
      productId: "p1",
      irelandOffers: [{ id: "shop", seller: "Shop", price: 45 }]
    }]
  });

  assert.equal(merged.products[0].irelandOffers.length, 1);
  assert.equal(merged.products[0].irelandOffers[0].price, 45);
});
