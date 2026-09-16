import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractSourceSnapshot } from "../lib/market-monitor-parser.mjs";
import {
  appendRun,
  applyMonitorResult,
  emptyMarketState,
  emptyPriceHistory,
  emptyRunLog,
  readJsonFile,
  writeJsonFile,
} from "../lib/market-monitor-state.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const USER_AGENT = "DROPiGlobalMonitor/1.0 (+https://dropi-global-deals-production.up.railway.app/)";
const STATE_PATH = process.env.MONITOR_STATE_PATH || join(root, "data/live-state/market-state.json");
const HISTORY_PATH = process.env.MONITOR_HISTORY_PATH || join(root, "data/live-state/price-history.json");
const RUNS_PATH = process.env.MONITOR_RUNS_PATH || join(root, "data/live-state/monitor-runs.json");
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

function sourceDue(source, sourceState, now = new Date()) {
  if (process.env.MONITOR_FORCE === "1") return true;
  if (!sourceState) return true;
  const normal = Number(source.refreshMinutes || 180);
  const failures = Number(sourceState.consecutiveFailures || 0);
  const retry = Math.min(normal, Math.max(30, 30 * (2 ** Math.min(failures, 3))));
  const interval = sourceState.monitorStatus === "ok" ? normal : retry;
  return minutesSince(sourceState.lastCheckedAt, now) >= interval;
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
  const matches = rules
    .filter((rule) => rule.value && path.startsWith(rule.value))
    .sort((a, b) => b.value.length - a.value.length);
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
      // If robots.txt is temporarily unreachable, normal retrieval rules still apply.
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

async function persist(state, history, runLog) {
  await Promise.all([
    writeJsonFile(STATE_PATH, state),
    writeJsonFile(HISTORY_PATH, history),
    writeJsonFile(RUNS_PATH, runLog),
  ]);
}

async function main() {
  const [registry, state, history, runLog] = await Promise.all([
    readRegistry(),
    readJsonFile(STATE_PATH, emptyMarketState()),
    readJsonFile(HISTORY_PATH, emptyPriceHistory()),
    readJsonFile(RUNS_PATH, emptyRunLog()),
  ]);
  const sources = (registry.sources || []).filter((source) => source.enabled !== false);
  const now = new Date();
  const due = sources.filter((source) => sourceDue(source, state.sources?.[source.id], now));
  due.sort((a, b) => (a.offerKind === "shipping_tariff" ? -1 : 0) - (b.offerKind === "shipping_tariff" ? -1 : 0));

  const startedAt = new Date().toISOString();
  const summary = {
    status: "completed",
    startedAt,
    finishedAt: null,
    sourcesDue: due.length,
    checked: 0,
    changed: 0,
    failed: 0,
    results: [],
  };

  try {
    for (const source of due) {
      const result = await checkSource(source);
      const recorded = applyMonitorResult(state, history, source, result.snapshot, {
        checkedAt: result.checkedAt,
        httpStatus: result.httpStatus,
        contentHash: result.contentHash,
        responseUrl: result.responseUrl,
      });
      summary.checked += 1;
      if (recorded.changed) summary.changed += 1;
      if (!result.snapshot.ok) summary.failed += 1;
      summary.results.push({
        sourceId: source.id,
        status: result.snapshot.monitorStatus,
        changed: recorded.changed,
        price: result.snapshot.price ?? null,
        shippingToIreland: result.snapshot.shippingToIreland ?? null,
        error: result.snapshot.error || null,
      });
    }
    if (summary.checked > 0 && summary.failed === summary.checked) summary.status = "degraded";
  } catch (error) {
    summary.status = "failed";
    summary.fatalError = error?.message || String(error);
  } finally {
    summary.finishedAt = new Date().toISOString();
    appendRun(runLog, summary);
    await persist(state, history, runLog);
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.status === "failed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
