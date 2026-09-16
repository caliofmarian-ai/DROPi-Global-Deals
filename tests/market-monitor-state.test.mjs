import test from "node:test";
import assert from "node:assert/strict";
import { applyMonitorResult, emptyMarketState, emptyPriceHistory } from "../lib/market-monitor-state.mjs";

const source = {
  id:"shop-product",
  productId:"product-1",
  offerKind:"source_offer",
  seller:"Shop",
  label:"Shop product",
  url:"https://example.com/product",
  refreshMinutes:60,
  currency:"EUR",
  shipsToIreland:true,
};

test("transient failure preserves last successful price and verified identity", () => {
  const state = emptyMarketState();
  const history = emptyPriceHistory();
  applyMonitorResult(state, history, source, {
    ok:true, monitorStatus:"ok", identityStatus:"verified", price:42, currency:"EUR", availability:"in_stock",
  }, { checkedAt:"2026-09-16T10:00:00Z", httpStatus:200, contentHash:"one" });
  applyMonitorResult(state, history, source, {
    ok:false, monitorStatus:"http_503", identityStatus:"unknown", error:"HTTP 503",
  }, { checkedAt:"2026-09-16T10:30:00Z", httpStatus:503 });
  const current = state.sources[source.id];
  assert.equal(current.price, 42);
  assert.equal(current.identityStatus, "verified");
  assert.equal(current.lastSuccessAt, "2026-09-16T10:00:00Z");
  assert.equal(current.monitorStatus, "http_503");
  assert.equal(current.consecutiveFailures, 1);
});

test("identity mismatch explicitly invalidates monitored identity", () => {
  const state = emptyMarketState();
  const history = emptyPriceHistory();
  applyMonitorResult(state, history, source, {
    ok:true, monitorStatus:"ok", identityStatus:"verified", price:42, currency:"EUR", availability:"in_stock",
  }, { checkedAt:"2026-09-16T10:00:00Z" });
  applyMonitorResult(state, history, source, {
    ok:false, monitorStatus:"identity_mismatch", identityStatus:"mismatch", error:"Wrong product",
  }, { checkedAt:"2026-09-16T11:00:00Z" });
  assert.equal(state.sources[source.id].identityStatus, "mismatch");
});

test("history records only meaningful state changes", () => {
  const state = emptyMarketState();
  const history = emptyPriceHistory();
  applyMonitorResult(state, history, source, {
    ok:true, monitorStatus:"ok", identityStatus:"verified", price:42, currency:"EUR", availability:"in_stock",
  }, { checkedAt:"2026-09-16T10:00:00Z" });
  applyMonitorResult(state, history, source, {
    ok:true, monitorStatus:"ok", identityStatus:"verified", price:42, currency:"EUR", availability:"in_stock",
  }, { checkedAt:"2026-09-16T11:00:00Z" });
  applyMonitorResult(state, history, source, {
    ok:true, monitorStatus:"ok", identityStatus:"verified", price:39, currency:"EUR", availability:"in_stock",
  }, { checkedAt:"2026-09-16T12:00:00Z" });
  assert.equal(history.products["product-1"].length, 2);
  assert.equal(history.products["product-1"][0].price, 39);
});
