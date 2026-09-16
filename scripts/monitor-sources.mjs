import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractSourceSnapshot } from "../lib/market-monitor-parser.mjs";
import {
  closeMonitorDb,
  finishMonitorRun,
  getSourceState,
  recordMonitorResult,
  startMonitorRun,
} from "../lib/market-monitor-db.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const USER_AGENT = "DROPiGlobalMonitor/1.0 (+https://dropi-global-deals-production.up.railway.app/)";
const robotsCache = new Map();
const hostLastFetch = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readRegistry() {
  return JSON.parse(await readFile(join(root, "data/source-registry.json"), "utf8"));
}

function minutesSince(value, now = new Date()) {
  if (!value) return Infinity;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? Infinity : (now.getTime() - date.getTime()) / 60_000;
}

function sourceDue(source, state, now = new Date()) {
  if (process.env.MONITOR_FORCE === "1") return true;
  if (!state) return true;
  const normal = Number(source.refreshMinutes || 180);
  const failures = Number(state.consecutive_failures || 0);
  const retry = Math.min(normal, Math.max(30, 30 * (2 ** Math.min(failures, 3))));
  const interval = state.monitor_status === "ok" ? normal : retry;
  return minutesSince(state.last_checked_at, now) >= interval;
}

function parseRobots(text, path) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.split("#")[0].trim()).filter(Boolean);
  let applies = false;
  const rules = [];
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index < 0) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    if (key === "user-agent") {
      const ua = value.toLowerCase();
      applies = ua === "*" || USER_AGENT.toLowerCase().startsWith(ua);
      continue;
    }
    if (applies && (key === "allow" || key === "disallow")) rules.push({ type: key, value });
  }
  const matches = rules.filter((rule) => rule.value && path.startsWith(rule.value)).sort((a, b) => b.value.length - a.value.length);
  return !matches.length || matches[0].type === "allow";
}

async function robotsAllows(url) {
  const parsed = new URL(url);
  const key = parsed.origin;
  if (!robotsCache.has(key)) {
    const robotsUrl = `${key}/robots.txt`;
    let result = { allowedByDefault: true, text: "" };
    try {
      const response = await fetch(robotsUrl, {
        headers: { "user-agent": USER_AGENT, accept: "text/plain,*/*;q=0.5" },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 401 || response.status === 403) result = { allowedByDefault: false, text: "" };
      else if (response.ok) result = { allowedByDefault: true, text: await response.text() };
    } catch {
      // A missing/unreachable robots file is not treated as permission to bypass an explicit block.
    }
    robotsCache.set(key, result);
  }
  const result = robotsCache.get(key);
  if (!result.allowedByDefault) return false;
  return parseRobots(result.text, parsed.pathname || "/");
}

async function throttle(url) {
  const host = new URL(url).host;
  const last = hostLastFetch.get(host) || 0;
  const wait = 1_500 - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  hostLastFetch.set(host, Date.now());
}

async function checkSource(source) {
  const checkedAt = new Date().toISOString();
  if (!(await robotsAllows(source.url))) {
    return {
      source,
      checkedAt,
      snapshot: { ok: false, monitorStatus: "robots_blocked", identityStatus: "unknown", error: "robots.txt blocks automated checks for this path." },
      httpStatus: null,
      contentHash: null,
      responseUrl: source.url,
    };
  }

  await throttle(source.url);
  try {
    const response = await fetch(source.url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "accept-language": "en-IE,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return {
        source,
        checkedAt,
        snapshot: { ok: false, monitorStatus: `http_${response.status}`, identityStatus: "unknown", error: `HTTP ${response.status}` },
        httpStatus: response.status,
        contentHash: null,
        responseUrl: response.url || source.url,
      };
    }
    const html = await response.text();
    const contentHash = createHash("sha256").update(html).digest("hex");
    return {
      source,
      checkedAt,
      snapshot: extractSourceSnapshot(html, source),
      httpStatus: response.status,
      contentHash,
      responseUrl: response.url || source.url,
    };
  } catch (error) {
    return {
      source,
      checkedAt,
      snapshot: { ok: false, monitorStatus: "fetch_error", identityStatus: "unknown", error: error?.message || "Fetch failed" },
      httpStatus: null,
      contentHash: null,
      responseUrl: source.url,
    };
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for the market monitor worker");
  const registry = await readRegistry();
  const sources = (registry.sources || []).filter((source) => source.enabled !== false);
  const now = new Date();
  const due = [];
  for (const source of sources) {
    const state = await getSourceState(source.id);
    if (sourceDue(source, state, now)) due.push(source);
  }
  due.sort((a, b) => (a.offerKind === "shipping_tariff" ? -1 : 0) - (b.offerKind === "shipping_tariff" ? -1 : 0));

  const runId = await startMonitorRun(due.length);
  const summary = { checked: 0, changed: 0, failed: 0, details: { due: due.map((source) => source.id), results: [] } };
  try {
    for (const source of due) {
      const result = await checkSource(source);
      const recorded = await recordMonitorResult(source, result.snapshot, {
        checkedAt: result.checkedAt,
        httpStatus: result.httpStatus,
        contentHash: result.contentHash,
        responseUrl: result.responseUrl,
      });
      summary.checked += 1;
      if (recorded.changed) summary.changed += 1;
      if (!result.snapshot.ok) summary.failed += 1;
      summary.details.results.push({
        sourceId: source.id,
        status: result.snapshot.monitorStatus,
        changed: recorded.changed,
        price: result.snapshot.price ?? null,
        shippingToIreland: result.snapshot.shippingToIreland ?? null,
      });
    }
    summary.status = summary.failed === summary.checked && summary.checked > 0 ? "failed" : "completed";
    await finishMonitorRun(runId, summary);
    console.log(JSON.stringify({ runId, ...summary }, null, 2));
  } catch (error) {
    summary.status = "failed";
    summary.details.fatalError = error?.message || String(error);
    await finishMonitorRun(runId, summary).catch(() => {});
    throw error;
  } finally {
    await closeMonitorDb().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
