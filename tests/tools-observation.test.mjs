import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { enrichCatalog } from "../lib/catalog.mjs";
import { mergeMarketObservations } from "../lib/market-observations.mjs";

const observation = JSON.parse(await readFile(new URL("../data/observations/2026-09-16-tools.json", import.meta.url), "utf8"));
const now = new Date("2026-09-16T12:00:00Z");

test("KNIPEX 86 03 250 remains a shipping-verification candidate, not a published deal", () => {
  const catalog = enrichCatalog(mergeMarketObservations({ products: [] }, observation), now);
  const product = catalog.products.find((item) => item.id === "knipex-8603250");
  assert.ok(product);
  assert.equal(product.derived.bestFreshIrelandPrice, 75.49);
  assert.equal(product.derived.rawGap, 25.62);
  assert.equal(product.derived.status, "needs_shipping_quote");
  assert.equal(product.derived.publishableDeal, false);
  assert.equal(product.derived.sourceRoutes[0].status, "needs_shipping_quote");
});
