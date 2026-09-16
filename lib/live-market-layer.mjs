import { getAllMonitorStates, getMonitorSummary, getProductHistory, monitorDbEnabled } from "./market-monitor-db.mjs";

const asDate = (value) => value ? new Date(value) : null;
const dateOnly = (value) => {
  const date = asDate(value);
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
};
const numberOrNull = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

function stateFresh(row, now = new Date()) {
  const source = row?.payload?.source || {};
  const lastSuccess = asDate(row?.last_success_at);
  if (!lastSuccess || Number.isNaN(lastSuccess.getTime())) return false;
  const refreshMinutes = Number(source.refreshMinutes || 180);
  const maxAgeMinutes = Number(source.maxStaleMinutes || Math.max(refreshMinutes * 2, refreshMinutes + 60));
  return now.getTime() - lastSuccess.getTime() <= maxAgeMinutes * 60_000;
}

function patchForProduct(map, productId) {
  if (!map.has(productId)) map.set(productId, { productId, irelandOffers: [], sourceOffers: [] });
  return map.get(productId);
}

export function monitorRowsToObservationLayer(rows = [], now = new Date()) {
  const byId = new Map(rows.map((row) => [row.source_id, row]));
  const patches = new Map();

  for (const row of rows) {
    if (!row?.product_id || row.product_id === "__shipping__") continue;
    if (!row.last_success_at || !stateFresh(row, now)) continue;
    if (row.identity_status !== "verified") continue;

    const source = row.payload?.source || {};
    const price = numberOrNull(row.price);
    if (price === null) continue;
    const checkedAt = dateOnly(row.last_success_at);
    const observedAt = asDate(row.last_success_at)?.toISOString() || null;
    const patch = patchForProduct(patches, row.product_id);

    if (row.offer_kind === "ireland_offer") {
      patch.irelandOffers.push({
        id: source.id || row.source_id,
        seller: source.seller || row.seller || "Irish retailer",
        label: source.label || row.label || source.seller || row.seller || "Irish retailer",
        price,
        availability: row.availability || "unknown",
        comparisonEligible: source.comparisonEligible !== false,
        checkedAt,
        observedAt,
        url: source.url || row.source_url,
        liveMonitor: true,
      });
      continue;
    }

    if (row.offer_kind === "source_offer") {
      let shippingToIreland = null;
      let shippingCheckedAt = null;
      if (source.shippingSourceId) {
        const shippingState = byId.get(source.shippingSourceId);
        if (shippingState && shippingState.monitor_status === "ok" && stateFresh(shippingState, now)) {
          shippingToIreland = numberOrNull(shippingState.shipping_to_ireland);
          shippingCheckedAt = dateOnly(shippingState.last_success_at);
        }
      } else if (source.shippingToIreland !== undefined && source.shippingToIreland !== null) {
        shippingToIreland = numberOrNull(source.shippingToIreland);
      }

      patch.sourceOffers.push({
        id: source.id || row.source_id,
        seller: source.seller || row.seller || "Source seller",
        label: source.label || row.label || source.seller || row.seller || "Source seller",
        productPrice: price,
        shippingToIreland,
        shippingCheckedAt,
        shipsToIreland: source.shipsToIreland ?? row.ships_to_ireland ?? null,
        dispatchCountry: source.dispatchCountry || null,
        dispatchInEu: typeof source.dispatchInEu === "boolean" ? source.dispatchInEu : null,
        availability: row.availability || "unknown",
        comparisonEligible: source.comparisonEligible !== false,
        qualityStatus: source.qualityStatus || "research",
        checkedAt,
        observedAt,
        url: source.url || row.source_url,
        evidenceUrl: source.shippingSourceId ? (byId.get(source.shippingSourceId)?.source_url || null) : null,
        liveMonitor: true,
      });
    }
  }

  return {
    generatedAt: now.toISOString(),
    source: "neon-live-market-monitor",
    products: [...patches.values()],
    discoveredProducts: [],
  };
}

export async function loadLiveMarketObservations(now = new Date()) {
  if (!monitorDbEnabled()) return null;
  return monitorRowsToObservationLayer(await getAllMonitorStates(), now);
}

export async function liveMonitorStatus() {
  return getMonitorSummary();
}

export async function liveProductHistory(productId, limit = 100) {
  if (!monitorDbEnabled()) return [];
  return getProductHistory(productId, limit);
}
