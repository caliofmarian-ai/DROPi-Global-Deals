import test from "node:test";
import assert from "node:assert/strict";
import { routeCommercialProduct, validateCommercialDestination } from "../lib/commerce-routing.mjs";

const route = (id, landedCost, seller = id) => ({
  id,
  seller,
  landedCost,
  status: "verified_route",
  publishableRoute: true,
});

const product = (routes, publishableDeal = true) => ({
  id: "p1",
  derived: { publishableDeal, sourceRoutes: routes },
});

const affiliate = (sourceOfferId, url = "https://example.test/buy") => ({
  id: `aff-${sourceOfferId}`,
  channel: "affiliate",
  sourceOfferId,
  url,
  enabled: true,
  approvalStatus: "approved",
  disclosure: {
    required: true,
    text: "Affiliate link — DROPi may earn a commission.",
  },
});

test("verified deal remains useful when no commercial destination exists", () => {
  const result = routeCommercialProduct(product([route("cheap", 20)]), { destinations: [] });
  assert.equal(result.status, "verified_no_monetization");
  assert.equal(result.selectedRoute.id, "cheap");
  assert.equal(result.transaction, null);
});

test("non-publishable product cannot be monetized", () => {
  const result = routeCommercialProduct(
    product([route("cheap", 20)], false),
    { destinations: [affiliate("cheap")] },
  );
  assert.equal(result.status, "not_publishable");
  assert.equal(result.selectedRoute, null);
});

test("more expensive monetizable route never replaces cheapest verified route", () => {
  const result = routeCommercialProduct(
    product([route("cheap", 20), route("paid", 25)]),
    { destinations: [{ ...affiliate("paid"), commissionRate: 0.99 }] },
  );
  assert.equal(result.status, "best_route_not_monetizable");
  assert.equal(result.selectedRoute.id, "cheap");
  assert.equal(result.transaction, null);
  assert.equal(result.monetizableAlternatives.length, 1);
  assert.equal(result.monetizableAlternatives[0].route.id, "paid");
  assert.equal(result.commissionInfluencesRanking, false);
});

test("approved affiliate can attach to the already-selected best route", () => {
  const result = routeCommercialProduct(
    product([route("cheap", 20)]),
    { destinations: [affiliate("cheap")] },
  );
  assert.equal(result.status, "monetized_verified_route");
  assert.equal(result.selectedRoute.id, "cheap");
  assert.equal(result.transaction.channel, "affiliate");
});

test("disabled, unapproved and research-only destinations fail closed", () => {
  const destinations = [
    { ...affiliate("cheap"), id: "disabled", enabled: false },
    { ...affiliate("cheap"), id: "pending", approvalStatus: "pending" },
    { ...affiliate("cheap"), id: "research", channel: "research_only" },
  ];
  const result = routeCommercialProduct(product([route("cheap", 20)]), { destinations });
  assert.equal(result.status, "verified_no_monetization");
  assert.equal(result.blockedDestinations.length, 3);
  assert.deepEqual(
    result.blockedDestinations.map(item => item.status),
    ["disabled", "not_approved", "invalid_channel"],
  );
});

test("Shopify UNASSIGNED store fails closed", () => {
  const destination = {
    id: "shop",
    channel: "shopify",
    sourceOfferId: "cheap",
    url: "https://shop.test/p",
    enabled: true,
    approvalStatus: "approved",
    disclosure: { required: true, text: "Sold by DROPi Home." },
    storeAssignment: {
      status: "UNASSIGNED",
      vertical: "DROPi-Home-Affiliate",
      storeKey: "store-a",
    },
  };
  const result = routeCommercialProduct(
    product([route("cheap", 20)]),
    { destinations: [destination] },
    { targetVertical: "DROPi-Home-Affiliate" },
  );
  assert.equal(result.status, "verified_no_monetization");
  assert.equal(result.blockedDestinations[0].status, "shopify_store_unassigned");
});

test("Shopify requires exact assigned vertical", () => {
  const destination = {
    id: "shop",
    channel: "shopify",
    sourceOfferId: "cheap",
    url: "https://shop.test/p",
    enabled: true,
    approvalStatus: "approved",
    disclosure: { required: true, text: "Sold by DROPi Home." },
    storeAssignment: {
      status: "assigned",
      vertical: "DROPi-Home-Affiliate",
      storeKey: "store-a",
    },
  };

  const mismatch = routeCommercialProduct(
    product([route("cheap", 20)]),
    { destinations: [destination] },
    { targetVertical: "DROPi-Producatori-Romani" },
  );
  assert.equal(mismatch.blockedDestinations[0].status, "shopify_vertical_mismatch");

  const ok = routeCommercialProduct(
    product([route("cheap", 20)]),
    { destinations: [destination] },
    { targetVertical: "DROPi-Home-Affiliate" },
  );
  assert.equal(ok.status, "monetized_verified_route");
  assert.equal(ok.transaction.channel, "shopify");
});

test("commercial destinations require disclosure metadata", () => {
  const checked = validateCommercialDestination({ ...affiliate("cheap"), disclosure: null });
  assert.equal(checked.eligible, false);
  assert.equal(checked.status, "missing_disclosure");
});
