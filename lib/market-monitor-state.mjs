import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export function emptyMarketState() {
  return { version: 1, generatedAt: null, sources: {} };
}

export function emptyPriceHistory() {
  return { version: 1, generatedAt: null, products: {} };
}

export function emptyRunLog() {
  return { version: 1, generatedAt: null, runs: [] };
}

export async function readJsonFile(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJsonFile(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function numericOrNull(value) {
  return value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
}

export function meaningfulStateChange(previous, snapshot) {
  if (!previous) return true;
  if (snapshot.ok) {
    return previous.monitorStatus !== "ok"
      || numericOrNull(previous.price) !== numericOrNull(snapshot.price)
      || numericOrNull(previous.shippingToIreland) !== numericOrNull(snapshot.shippingToIreland)
      || String(previous.availability || "") !== String(snapshot.availability || "")
      || String(previous.identityStatus || "") !== String(snapshot.identityStatus || "");
  }
  return previous.monitorStatus !== snapshot.monitorStatus;
}

export function applyMonitorResult(state, history, source, snapshot, meta = {}) {
  const checkedAt = meta.checkedAt || new Date().toISOString();
  const previous = state.sources[source.id] || null;
  const changed = meaningfulStateChange(previous, snapshot);
  const next = {
    sourceId: source.id,
    productId: source.productId,
    offerKind: source.offerKind,
    seller: source.seller || null,
    label: source.label || null,
    sourceUrl: source.url,
    sourceConfig: source,
    lastCheckedAt: checkedAt,
    lastSuccessAt: previous?.lastSuccessAt || null,
    lastChangedAt: previous?.lastChangedAt || null,
    monitorStatus: snapshot.monitorStatus || (snapshot.ok ? "ok" : "failed"),
    price: previous?.price ?? null,
    currency: previous?.currency || source.currency || null,
    availability: previous?.availability || null,
    shippingToIreland: previous?.shippingToIreland ?? null,
    shipsToIreland: source.shipsToIreland ?? previous?.shipsToIreland ?? null,
    identityStatus: previous?.identityStatus || "unknown",
    httpStatus: meta.httpStatus ?? null,
    contentHash: meta.contentHash || previous?.contentHash || null,
    consecutiveFailures: Number(previous?.consecutiveFailures || 0),
    errorText: null,
    responseUrl: meta.responseUrl || source.url,
  };

  if (snapshot.ok) {
    next.lastSuccessAt = checkedAt;
    if (changed || !next.lastChangedAt) next.lastChangedAt = checkedAt;
    next.monitorStatus = "ok";
    next.price = numericOrNull(snapshot.price);
    next.currency = snapshot.currency || source.currency || next.currency;
    next.availability = snapshot.availability || "unknown";
    next.shippingToIreland = numericOrNull(snapshot.shippingToIreland);
    next.identityStatus = snapshot.identityStatus || "verified";
    next.consecutiveFailures = 0;
    next.errorText = null;
    next.extracted = snapshot.identifiers || null;
    next.rawPrice = numericOrNull(snapshot.rawPrice);
  } else {
    next.consecutiveFailures += 1;
    next.errorText = snapshot.error || meta.error || "Monitor check failed";
    if (snapshot.monitorStatus === "identity_mismatch") next.identityStatus = snapshot.identityStatus || "mismatch";
  }

  state.sources[source.id] = next;
  state.generatedAt = checkedAt;

  if (changed) {
    const productId = source.productId || "__unknown__";
    if (!Array.isArray(history.products[productId])) history.products[productId] = [];
    history.products[productId].unshift({
      sourceId: source.id,
      offerKind: source.offerKind,
      checkedAt,
      eventType: previous ? "changed" : "first_observation",
      monitorStatus: next.monitorStatus,
      price: next.price,
      currency: next.currency,
      availability: next.availability,
      shippingToIreland: next.shippingToIreland,
      contentHash: next.contentHash,
    });
    history.products[productId] = history.products[productId].slice(0, 500);
    history.generatedAt = checkedAt;
  }

  return { changed, current: next, previous };
}

export function appendRun(runLog, run) {
  runLog.generatedAt = run.finishedAt || new Date().toISOString();
  runLog.runs = [run, ...(runLog.runs || [])].slice(0, 100);
  return runLog;
}
