import test from "node:test";
import assert from "node:assert/strict";
import { commerceViewForProduct } from "../lib/commerce-view.mjs";

const verified = {
  id: "p1",
  name: "Product One",
  category: "Tools",
  derived: {
    status: "verified_deal",
    publishableDeal: true,
    sourceRoutes: [
      {
        id: "r1",
        seller: "Seller",
        landedCost: 20,
        status: "verified_route",
        publishableRoute: true,
      },
    ],
  },
};

test("requires a bounded productId", () => {
  assert.equal(commerceViewForProduct({ products: [] }, {}, {}).httpStatus, 400);
  assert.equal(
    commerceViewForProduct({ products: [] }, {}, { productId: "x".repeat(161) }).httpStatus,
    400,
  );
});

test("returns 404 for unknown evaluated product", () => {
  const result = commerceViewForProduct(
    { products: [verified] },
    { destinations: [] },
    { productId: "missing" },
  );
  assert.equal(result.status, "not_found");
  assert.equal(result.httpStatus, 404);
});

test("returns selected comparison route even when registry has no monetization", () => {
  const result = commerceViewForProduct(
    { products: [verified] },
    { version: 1, generatedAt: "2026-09-17", destinations: [] },
    { productId: "p1" },
  );
  assert.equal(result.status, "ok");
  assert.equal(result.commerce.status, "verified_no_monetization");
  assert.equal(result.commerce.selectedRoute.id, "r1");
  assert.equal(result.commerce.transaction, null);
  assert.equal(result.registry.destinationCount, 0);
});

test("passes targetVertical into Shopify assignment guard", () => {
  const registry = {
    destinations: [
      {
        id: "shop",
        channel: "shopify",
        sourceOfferId: "r1",
        url: "https://shop.test/p1",
        enabled: true,
        approvalStatus: "approved",
        disclosure: { required: true, text: "Sold by DROPi Home." },
        storeAssignment: {
          status: "assigned",
          vertical: "DROPi-Home-Affiliate",
          storeKey: "store-a",
        },
      },
    ],
  };

  const blocked = commerceViewForProduct(
    { products: [verified] },
    registry,
    { productId: "p1", targetVertical: "DROPi-Producatori-Romani" },
  );
  assert.equal(blocked.commerce.transaction, null);
  assert.equal(blocked.commerce.blockedDestinations[0].status, "shopify_vertical_mismatch");

  const allowed = commerceViewForProduct(
    { products: [verified] },
    registry,
    { productId: "p1", targetVertical: "DROPi-Home-Affiliate" },
  );
  assert.equal(allowed.commerce.transaction.channel, "shopify");
});

test("rejects overlong targetVertical", () => {
  const result = commerceViewForProduct(
    { products: [verified] },
    {},
    { productId: "p1", targetVertical: "v".repeat(161) },
  );
  assert.equal(result.status, "invalid_request");
  assert.equal(result.httpStatus, 400);
});
