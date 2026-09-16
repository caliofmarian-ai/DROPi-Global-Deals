const DEFAULT_BASE_URL = "https://raw.githubusercontent.com/caliofmarian-ai/DROPi-Global-Deals/market-monitor-state/data/live-state";
const CACHE_MS = 60_000;
const cache = new Map();

const asDate = (value) => value ? new Date(value) : null;
const dateOnly = (value) => {
  const date = asDate(value);
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : null;
};
const numberOrNull = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

function stateBaseUrl() {
  return String(process.env.MARKET_MONITOR_STATE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

async function fetchStateFile(name, fallback) {
  const key = `${stateBaseUrl()}/${name}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < CACHE_MS) return cached.value;
  try {
    const response = await fetch(key, {
      headers: { accept: "application/json", "user-agent": "DROPiGlobalRuntime/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404) {
      cache.set(key, { fetchedAt: now, value: fallback });
      return fallback;
    }
    if (!response.ok) throw new Error(`State fetch ${response.status} for ${name}`);
    const value = await response.json();
    cache.set(key, { fetchedAt: now, value });
    return value;
  } catch (error) {
    if (cached) return cached.value;
    throw error;
  }
}

function sourceFresh(row, now = new Date()) {
  const source = row?.sourceConfig || {};
  const lastSuccess = asDate(row?.lastSuccessAt);
  if (!lastSuccess || Number.isNaN(lastSuccess.getTime())) return false;
  const refreshMinutes = Number(source.refreshMinutes || 180);
  const maxAgeMinutes = Number(source.maxStaleMinutes || Math.max(refreshMinutes * 2, refreshMinutes + 60));
  return now.getTime() - lastSuccess.getTime() <= maxAgeMinutes * 60_000;
}

function patchForProduct(map, productId) {
  if (!map.has(productId)) map.set(productId, { productId, irelandOffers: [], sourceOffers: [] });
  return map.get(productId);
}

export function monitorStateToObservationLayer(state = {}, now = new Date()) {
  const rows = Object.values(state.sources || {});
  const byId = new Map(rows.map((row) => [row.sourceId, row]));
  const patches = new Map();

  for (const row of rows) {
    if (!row?.productId || row.productId === "__shipping__") continue;
    if (!row.lastSuccessAt || !sourceFresh(row, now)) continue;
    if (row.identityStatus !== "verified") continue;

    const source = row.sourceConfig || {};
    const price = numberOrNull(row.price);
    if (price === null) continue;
    const checkedAt = dateOnly(row.lastSuccessAt);
    const observedAt = asDate(row.lastSuccessAt)?.toISOString() || null;
    const patch = patchForProduct(patches, row.productId);

    if (row.offerKind === "ireland_offer") {
      patch.irelandOffers.push({
        id: source.id || row.sourceId,
        seller: source.seller || row.seller || "Irish retailer",
        label: source.label || row.label || source.seller || row.seller || "Irish retailer",
        price,
        availability: row.availability || "unknown",
        comparisonEligible: source.comparisonEligible !== false,
        checkedAt,
        observedAt,
        url: source.url || row.sourceUrl,
        liveMonitor: true,
      });
      continue;
    }

    if (row.offerKind === "source_offer") {
      let shippingToIreland = null;
      let shippingCheckedAt = null;
      let evidenceUrl = null;
      if (source.shippingSourceId) {
        const shippingState = byId.get(source.shippingSourceId);
        if (shippingState && shippingState.identityStatus === "verified" && sourceFresh(shippingState, now)) {
          shippingToIreland = numberOrNull(shippingState.shippingToIreland);
          shippingCheckedAt = dateOnly(shippingState.lastSuccessAt);
          evidenceUrl = shippingState.sourceUrl || shippingState.sourceConfig?.url || null;
        }
      } else if (source.shippingToIreland !== undefined && source.shippingToIreland !== null) {
        shippingToIreland = numberOrNull(source.shippingToIreland);
      }

      patch.sourceOffers.push({
        id: source.id || row.sourceId,
        seller: source.seller || row.seller || "Source seller",
        label: source.label || row.label || source.seller || row.seller || "Source seller",
        productPrice: price,
        shippingToIreland,
        shippingCheckedAt,
        shipsToIreland: source.shipsToIreland ?? row.shipsToIreland ?? null,
        dispatchCountry: source.dispatchCountry || null,
        dispatchInEu: typeof source.dispatchInEu === "boolean" ? source.dispatchInEu : null,
        availability: row.availability || "unknown",
        comparisonEligible: source.comparisonEligible !== false,
        qualityStatus: source.qualityStatus || "research",
        checkedAt,
        observedAt,
        url: source.url || row.sourceUrl,
        evidenceUrl,
        liveMonitor: true,
      });
    }
  }

  return {
    generatedAt: state.generatedAt || now.toISOString(),
    source: "github-market-monitor-state",
    products: [...patches.values()],
    discoveredProducts: [],
  };
}

export async function loadLiveMarketObservations(now = new Date()) {
  const state = await fetchStateFile("market-state.json", { version:1, generatedAt:null, sources:{} });
  return monitorStateToObservationLayer(state, now);
}

export async function liveMonitorStatus(now = new Date()) {
  const [state, runLog] = await Promise.all([
    fetchStateFile("market-state.json", { version:1, generatedAt:null, sources:{} }),
    fetchStateFile("monitor-runs.json", { version:1, generatedAt:null, runs:[] }),
  ]);
  const rows = Object.values(state.sources || {});
  let healthy = 0;
  let stale = 0;
  let identityMismatch = 0;
  for (const row of rows) {
    if (row.identityStatus === "mismatch") identityMismatch += 1;
    else if (row.identityStatus === "verified" && sourceFresh(row, now)) healthy += 1;
    else stale += 1;
  }
  const lastChecked = rows.map((row) => asDate(row.lastCheckedAt)).filter((date) => date && !Number.isNaN(date.getTime())).sort((a,b)=>b-a)[0] || null;
  const lastSuccess = rows.map((row) => asDate(row.lastSuccessAt)).filter((date) => date && !Number.isNaN(date.getTime())).sort((a,b)=>b-a)[0] || null;
  return {
    enabled: true,
    backend: "github-state-branch",
    source_count: rows.length,
    healthy_count: healthy,
    stale_or_unverified_count: stale,
    identity_mismatch_count: identityMismatch,
    last_checked_at: lastChecked?.toISOString() || null,
    last_success_at: lastSuccess?.toISOString() || null,
    lastRun: Array.isArray(runLog.runs) ? (runLog.runs[0] || null) : null,
  };
}

export async function liveProductHistory(productId, limit = 100) {
  const history = await fetchStateFile("price-history.json", { version:1, generatedAt:null, products:{} });
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  return (history.products?.[productId] || []).slice(0, safeLimit);
}
