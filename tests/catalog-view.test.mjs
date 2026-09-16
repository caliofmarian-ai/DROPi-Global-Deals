import test from "node:test";
import assert from "node:assert/strict";
import { candidateFeed, dealFeed, selectCandidates, selectDeals, summarizeCatalog } from "../lib/catalog-view.mjs";

const catalog = {
  generatedAt: "2026-09-16",
  observationGeneratedAt: "2026-09-16",
  products: [
    { id:"deal", derived:{ status:"verified_deal", publishableDeal:true } },
    { id:"recheck", derived:{ status:"needs_local_recheck", publishableDeal:false } },
    { id:"research", derived:{ status:"research_queue", publishableDeal:false } },
  ],
};

test("deal feed exposes only publishable products", () => {
  assert.deepEqual(selectDeals(catalog).map((p) => p.id), ["deal"]);
  const feed = dealFeed(catalog);
  assert.equal(feed.publishableDealCount, 1);
  assert.deepEqual(feed.deals.map((p) => p.id), ["deal"]);
});

test("candidate feed keeps blocked and research products", () => {
  assert.deepEqual(selectCandidates(catalog).map((p) => p.id), ["recheck", "research"]);
  const feed = candidateFeed(catalog);
  assert.equal(feed.candidateCount, 2);
});

test("catalog status summary counts every derived status", () => {
  assert.deepEqual(summarizeCatalog(catalog), {
    generatedAt: "2026-09-16",
    observationGeneratedAt: "2026-09-16",
    productCount: 3,
    publishableDealCount: 1,
    candidateCount: 2,
    statusCounts: { verified_deal:1, needs_local_recheck:1, research_queue:1 },
  });
});
