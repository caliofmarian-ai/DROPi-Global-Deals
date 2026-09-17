import test from "node:test";
import assert from "node:assert/strict";
import {
  adaptProviderOfferBatch,
  adaptResearchSnapshotBatch,
  createResearchSnapshotAdapter,
} from "../lib/provider-adapters.mjs";

test("rejects before adapter mapping when provider market contract fails", () => {
  let calls = 0;
  const result = adaptProviderOfferBatch({
    provider: "klarna",
    requestedMarket: "IE",
    responseMarket: "US",
    targetMarket: "IE",
    offers: [{ id: "x", price: 10 }],
  }, {
    name: "probe",
    mapOffer() { calls += 1; return {}; },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.status, "provider_market_mismatch");
  assert.equal(result.normalizedOffers.length, 0);
  assert.equal(calls, 0);
});

test("research snapshot emits sourceOffers-compatible sparse fields without inventing values", () => {
  const result = adaptResearchSnapshotBatch({
    provider: "klarna",
    requestedMarket: "DE",
    responseMarket: "de",
    targetMarket: "IE",
    retrievedAt: "2026-09-17T06:00:00Z",
    offers: [{
      id: "k-123",
      name: "KNIPEX Cobra 87 02 250",
      seller: "Example Merchant",
      price: "29.90",
      currency: "eur",
      url: "https://example.test/product",
      gtin: "4003773040316",
    }],
  });

  assert.equal(result.accepted, true);
  assert.equal(result.adapted, true);
  assert.equal(result.normalizedOffers.length, 1);
  const offer = result.normalizedOffers[0];
  assert.equal(offer.productPrice, 29.9);
  assert.equal(offer.currency, "EUR");
  assert.equal(offer.shippingToIreland, null);
  assert.equal(offer.shipsToIreland, null);
  assert.equal(offer.identifiers.gtin, "4003773040316");
  assert.equal(offer.providerMarket, "DE");
  assert.equal(offer.targetMarket, "IE");
  assert.equal(offer.comparisonEligible, false);
  assert.equal(offer.qualityStatus, "research");
  assert.equal(offer.monetizationChannel, "research_only");
  assert.equal(offer.evidenceStatus, "provider_research");
});

test("research provider cannot self-promote an offer to verified comparison status", () => {
  const result = adaptResearchSnapshotBatch({
    provider: "external-search",
    requestedMarket: "IE",
    responseMarket: "IE",
    targetMarket: "IE",
    offers: [{
      id: "unsafe",
      price: 5,
      shippingCost: 0,
      shipsToTarget: true,
      comparisonEligible: true,
      qualityStatus: "verified",
      monetizationChannel: "affiliate",
    }],
  });

  const offer = result.normalizedOffers[0];
  assert.equal(offer.comparisonEligible, false);
  assert.equal(offer.qualityStatus, "research");
  assert.equal(offer.monetizationChannel, "research_only");
});

test("custom approved adapter can explicitly map shipping and comparison eligibility", () => {
  const result = adaptProviderOfferBatch({
    provider: "merchant-feed",
    requestedMarket: "IE",
    responseMarket: "IE",
    targetMarket: "IE",
    retrievedAt: "2026-09-17",
    offers: [{ ref: "A1", amount: 20, delivery: 4.5 }],
  }, {
    name: "approved_merchant_feed_v1",
    mapOffer(raw) {
      return {
        id: raw.ref,
        productName: "Exact SKU",
        productPrice: raw.amount,
        shippingCost: raw.delivery,
        shipsToTarget: true,
        comparisonEligible: true,
        qualityStatus: "verified",
        currency: "EUR",
      };
    },
  });

  const offer = result.normalizedOffers[0];
  assert.equal(offer.shippingToIreland, 4.5);
  assert.equal(offer.shipsToIreland, true);
  assert.equal(offer.comparisonEligible, true);
  assert.equal(offer.qualityStatus, "verified");
  assert.equal(offer.providerAdapter, "approved_merchant_feed_v1");
});

test("non-IE target keeps generic shipping but does not mislabel it as Ireland shipping", () => {
  const result = adaptProviderOfferBatch({
    provider: "merchant-feed",
    requestedMarket: "FR",
    responseMarket: "FR",
    targetMarket: "FR",
    offers: [{ id: "fr-1", shippingCost: 6, shipsToTarget: true }],
  }, createResearchSnapshotAdapter());

  const offer = result.normalizedOffers[0];
  assert.equal(offer.shippingCost, 6);
  assert.equal(offer.shippingToIreland, null);
  assert.equal(offer.shipsToIreland, null);
  assert.equal(offer.targetMarket, "FR");
});
