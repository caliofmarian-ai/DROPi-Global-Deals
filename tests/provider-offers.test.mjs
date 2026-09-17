import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMarketCode, validateProviderOfferBatch } from "../lib/provider-offers.mjs";

test("normalizes two-letter market codes", () => {
  assert.equal(normalizeMarketCode(" ie "), "IE");
  assert.equal(normalizeMarketCode("de"), "DE");
  assert.equal(normalizeMarketCode("Ireland"), null);
  assert.equal(normalizeMarketCode(null), null);
});

test("accepts a batch when provider response market matches the requested market", () => {
  const sourceOffer = { id: "offer-1", productPrice: 24.99, shippingToIreland: null };
  const batch = validateProviderOfferBatch({
    provider: "Klarna",
    requestedMarket: "ie",
    responseMarket: "IE",
    targetMarket: "IE",
    retrievedAt: "2026-09-17T05:45:00Z",
    offers: [sourceOffer],
  });

  assert.equal(batch.accepted, true);
  assert.equal(batch.status, "accepted");
  assert.equal(batch.receivedOfferCount, 1);
  assert.deepEqual(batch.offers[0], {
    id: "offer-1",
    productPrice: 24.99,
    shippingToIreland: null,
    provider: "Klarna",
    providerMarket: "IE",
    requestedMarket: "IE",
    targetMarket: "IE",
    providerRetrievedAt: "2026-09-17T05:45:00Z",
  });
  assert.deepEqual(sourceOffer, { id: "offer-1", productPrice: 24.99, shippingToIreland: null });
});

test("rejects the entire batch when provider response market differs from the requested market", () => {
  const batch = validateProviderOfferBatch({
    provider: "Klarna",
    requestedMarket: "IE",
    responseMarket: "US",
    targetMarket: "IE",
    offers: [{ id: "wrong-market", productPrice: 48.59 }],
  });

  assert.equal(batch.accepted, false);
  assert.equal(batch.status, "provider_market_mismatch");
  assert.equal(batch.receivedOfferCount, 1);
  assert.deepEqual(batch.offers, []);
});

test("fails closed when provider response market is missing", () => {
  const batch = validateProviderOfferBatch({
    provider: "merchant-feed",
    requestedMarket: "IE",
    targetMarket: "IE",
    offers: [{ id: "unknown-market" }],
  });

  assert.equal(batch.accepted, false);
  assert.equal(batch.status, "missing_response_market");
  assert.deepEqual(batch.offers, []);
});

test("keeps provider search market separate from final customer target market", () => {
  const batch = validateProviderOfferBatch({
    provider: "merchant-feed",
    requestedMarket: "DE",
    responseMarket: "de",
    targetMarket: "IE",
    offers: [{ id: "de-offer", dispatchCountry: "Germany" }],
  });

  assert.equal(batch.accepted, true);
  assert.equal(batch.offers[0].providerMarket, "DE");
  assert.equal(batch.offers[0].targetMarket, "IE");
});

test("does not invent missing price, shipping, tax or evidence fields", () => {
  const batch = validateProviderOfferBatch({
    provider: "affiliate-feed",
    requestedMarket: "FR",
    responseMarket: "FR",
    targetMarket: "IE",
    offers: [{ id: "sparse-offer" }],
  });

  const [offer] = batch.offers;
  assert.equal("productPrice" in offer, false);
  assert.equal("shippingToIreland" in offer, false);
  assert.equal("knownTaxes" in offer, false);
  assert.equal("evidenceUrl" in offer, false);
});
