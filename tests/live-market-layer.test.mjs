import test from "node:test";
import assert from "node:assert/strict";
import { monitorRowsToObservationLayer } from "../lib/live-market-layer.mjs";

const now = new Date("2026-09-16T18:00:00Z");

function row(overrides = {}) {
  return {
    source_id: "source",
    product_id: "product-1",
    offer_kind: "source_offer",
    seller: "Seller",
    label: "Seller product",
    source_url: "https://example.com/product",
    last_success_at: "2026-09-16T17:30:00Z",
    monitor_status: "ok",
    price: "30.00",
    currency: "EUR",
    availability: "in_stock",
    shipping_to_ireland: null,
    ships_to_ireland: true,
    identity_status: "verified",
    payload: { source: { id:"source", productId:"product-1", offerKind:"source_offer", seller:"Seller", label:"Seller product", url:"https://example.com/product", refreshMinutes:60, dispatchCountry:"Germany", dispatchInEu:true, shipsToIreland:true, qualityStatus:"verified", comparisonEligible:true, shippingSourceId:"ship" } },
    ...overrides,
  };
}

test("fresh source price uses a fresh monitored shipping tariff", () => {
  const rows = [
    row(),
    row({
      source_id:"ship",
      product_id:"__shipping__",
      offer_kind:"shipping_tariff",
      source_url:"https://example.com/shipping",
      price:null,
      shipping_to_ireland:"9.99",
      availability:"n/a",
      payload:{source:{id:"ship",productId:"__shipping__",offerKind:"shipping_tariff",refreshMinutes:180,url:"https://example.com/shipping"}},
    }),
  ];
  const layer = monitorRowsToObservationLayer(rows, now);
  assert.equal(layer.products.length, 1);
  assert.equal(layer.products[0].sourceOffers[0].productPrice, 30);
  assert.equal(layer.products[0].sourceOffers[0].shippingToIreland, 9.99);
  assert.equal(layer.products[0].sourceOffers[0].liveMonitor, true);
});

test("stale shipping tariff is removed even when product price is fresh", () => {
  const rows = [
    row(),
    row({
      source_id:"ship",
      product_id:"__shipping__",
      offer_kind:"shipping_tariff",
      source_url:"https://example.com/shipping",
      last_success_at:"2026-09-15T00:00:00Z",
      price:null,
      shipping_to_ireland:"9.99",
      availability:"n/a",
      payload:{source:{id:"ship",productId:"__shipping__",offerKind:"shipping_tariff",refreshMinutes:180,url:"https://example.com/shipping"}},
    }),
  ];
  const layer = monitorRowsToObservationLayer(rows, now);
  assert.equal(layer.products[0].sourceOffers[0].shippingToIreland, null);
});

test("unverified identity never reaches the catalog layer", () => {
  const layer = monitorRowsToObservationLayer([row({ identity_status:"mismatch" })], now);
  assert.equal(layer.products.length, 0);
});
