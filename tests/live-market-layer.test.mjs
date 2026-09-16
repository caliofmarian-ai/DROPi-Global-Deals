import test from "node:test";
import assert from "node:assert/strict";
import { monitorStateToObservationLayer } from "../lib/live-market-layer.mjs";

const now = new Date("2026-09-16T18:00:00Z");

function sourceState(overrides = {}) {
  return {
    sourceId: "source",
    productId: "product-1",
    offerKind: "source_offer",
    seller: "Seller",
    label: "Seller product",
    sourceUrl: "https://example.com/product",
    lastCheckedAt: "2026-09-16T17:30:00Z",
    lastSuccessAt: "2026-09-16T17:30:00Z",
    monitorStatus: "ok",
    price: 30,
    currency: "EUR",
    availability: "in_stock",
    shippingToIreland: null,
    shipsToIreland: true,
    identityStatus: "verified",
    sourceConfig: {
      id:"source",
      productId:"product-1",
      offerKind:"source_offer",
      seller:"Seller",
      label:"Seller product",
      url:"https://example.com/product",
      refreshMinutes:60,
      dispatchCountry:"Germany",
      dispatchInEu:true,
      shipsToIreland:true,
      qualityStatus:"verified",
      comparisonEligible:true,
      shippingSourceId:"ship",
    },
    ...overrides,
  };
}

test("fresh source price uses a fresh monitored shipping tariff", () => {
  const state = { version:1, sources:{
    source: sourceState(),
    ship: sourceState({
      sourceId:"ship",
      productId:"__shipping__",
      offerKind:"shipping_tariff",
      sourceUrl:"https://example.com/shipping",
      price:null,
      shippingToIreland:9.99,
      availability:"n/a",
      sourceConfig:{id:"ship",productId:"__shipping__",offerKind:"shipping_tariff",refreshMinutes:180,url:"https://example.com/shipping"},
    }),
  }};
  const layer = monitorStateToObservationLayer(state, now);
  assert.equal(layer.products.length, 1);
  assert.equal(layer.products[0].sourceOffers[0].productPrice, 30);
  assert.equal(layer.products[0].sourceOffers[0].shippingToIreland, 9.99);
  assert.equal(layer.products[0].sourceOffers[0].liveMonitor, true);
});

test("stale shipping tariff is removed even when product price is fresh", () => {
  const state = { version:1, sources:{
    source: sourceState(),
    ship: sourceState({
      sourceId:"ship",
      productId:"__shipping__",
      offerKind:"shipping_tariff",
      sourceUrl:"https://example.com/shipping",
      lastSuccessAt:"2026-09-15T00:00:00Z",
      price:null,
      shippingToIreland:9.99,
      availability:"n/a",
      sourceConfig:{id:"ship",productId:"__shipping__",offerKind:"shipping_tariff",refreshMinutes:180,url:"https://example.com/shipping"},
    }),
  }};
  const layer = monitorStateToObservationLayer(state, now);
  assert.equal(layer.products[0].sourceOffers[0].shippingToIreland, null);
});

test("unverified identity never reaches the catalog layer", () => {
  const state = { version:1, sources:{ source:sourceState({ identityStatus:"mismatch" }) } };
  const layer = monitorStateToObservationLayer(state, now);
  assert.equal(layer.products.length, 0);
});

test("transient fetch failure can keep a still-fresh last successful offer", () => {
  const state = { version:1, sources:{ source:sourceState({ monitorStatus:"http_503", lastCheckedAt:"2026-09-16T17:55:00Z", lastSuccessAt:"2026-09-16T17:30:00Z" }) } };
  const layer = monitorStateToObservationLayer(state, now);
  assert.equal(layer.products.length, 1);
  assert.equal(layer.products[0].sourceOffers[0].productPrice, 30);
});
