import pg from "pg";

const { Pool } = pg;
let pool;

export function monitorDbEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

function db() {
  if (!monitorDbEnabled()) throw new Error("DATABASE_URL is not configured");
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      application_name: "dropi-global-market-monitor",
    });
  }
  return pool;
}

export async function getSourceState(sourceId) {
  const result = await db().query("SELECT * FROM market_monitor_state WHERE source_id = $1", [sourceId]);
  return result.rows[0] || null;
}

export async function getAllMonitorStates() {
  const result = await db().query("SELECT * FROM market_monitor_state ORDER BY source_id");
  return result.rows;
}

export async function startMonitorRun(sourcesDue = 0) {
  const result = await db().query(
    "INSERT INTO market_monitor_runs (sources_due) VALUES ($1) RETURNING id",
    [sourcesDue],
  );
  return result.rows[0].id;
}

export async function finishMonitorRun(runId, summary = {}) {
  await db().query(
    `UPDATE market_monitor_runs
       SET finished_at = now(), status = $2, sources_checked = $3, sources_changed = $4,
           sources_failed = $5, details = $6::jsonb
     WHERE id = $1`,
    [
      runId,
      summary.status || "completed",
      summary.checked || 0,
      summary.changed || 0,
      summary.failed || 0,
      JSON.stringify(summary.details || {}),
    ],
  );
}

function meaningfulChange(previous, source, snapshot) {
  if (!previous) return true;
  if (snapshot.ok) {
    const previousPrice = previous.price === null ? null : Number(previous.price);
    const previousShipping = previous.shipping_to_ireland === null ? null : Number(previous.shipping_to_ireland);
    return previous.monitor_status !== "ok"
      || previousPrice !== (snapshot.price ?? null)
      || previousShipping !== (snapshot.shippingToIreland ?? null)
      || String(previous.availability || "") !== String(snapshot.availability || "")
      || String(previous.identity_status || "") !== String(snapshot.identityStatus || "");
  }
  return previous.monitor_status !== snapshot.monitorStatus;
}

export async function recordMonitorResult(source, snapshot, meta = {}) {
  const database = db();
  const previous = await getSourceState(source.id);
  const checkedAt = meta.checkedAt || new Date().toISOString();
  const changed = meaningfulChange(previous, source, snapshot);
  const payload = {
    source,
    extracted: snapshot.identifiers || null,
    rawPrice: snapshot.rawPrice ?? null,
    responseUrl: meta.responseUrl || source.url,
  };

  if (snapshot.ok) {
    await database.query(
      `INSERT INTO market_monitor_state
        (source_id, product_id, offer_kind, seller, label, source_url, last_checked_at, last_success_at,
         last_changed_at, monitor_status, price, currency, availability, shipping_to_ireland,
         ships_to_ireland, identity_status, http_status, content_hash, consecutive_failures, error_text, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$7,'ok',$8,$9,$10,$11,$12,$13,$14,$15,0,NULL,$16::jsonb)
       ON CONFLICT (source_id) DO UPDATE SET
         product_id = EXCLUDED.product_id,
         offer_kind = EXCLUDED.offer_kind,
         seller = EXCLUDED.seller,
         label = EXCLUDED.label,
         source_url = EXCLUDED.source_url,
         last_checked_at = EXCLUDED.last_checked_at,
         last_success_at = EXCLUDED.last_success_at,
         last_changed_at = CASE WHEN $17 THEN EXCLUDED.last_changed_at ELSE market_monitor_state.last_changed_at END,
         monitor_status = 'ok',
         price = EXCLUDED.price,
         currency = EXCLUDED.currency,
         availability = EXCLUDED.availability,
         shipping_to_ireland = EXCLUDED.shipping_to_ireland,
         ships_to_ireland = EXCLUDED.ships_to_ireland,
         identity_status = EXCLUDED.identity_status,
         http_status = EXCLUDED.http_status,
         content_hash = EXCLUDED.content_hash,
         consecutive_failures = 0,
         error_text = NULL,
         payload = EXCLUDED.payload`,
      [
        source.id,
        source.productId,
        source.offerKind,
        source.seller || null,
        source.label || null,
        source.url,
        checkedAt,
        snapshot.price ?? null,
        snapshot.currency || source.currency || null,
        snapshot.availability || "unknown",
        snapshot.shippingToIreland ?? null,
        source.shipsToIreland ?? null,
        snapshot.identityStatus || "unknown",
        meta.httpStatus || null,
        meta.contentHash || null,
        JSON.stringify(payload),
        changed,
      ],
    );
  } else {
    await database.query(
      `INSERT INTO market_monitor_state
        (source_id, product_id, offer_kind, seller, label, source_url, last_checked_at, monitor_status,
         ships_to_ireland, identity_status, http_status, consecutive_failures, error_text, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12,$13::jsonb)
       ON CONFLICT (source_id) DO UPDATE SET
         product_id = EXCLUDED.product_id,
         offer_kind = EXCLUDED.offer_kind,
         seller = EXCLUDED.seller,
         label = EXCLUDED.label,
         source_url = EXCLUDED.source_url,
         last_checked_at = EXCLUDED.last_checked_at,
         monitor_status = EXCLUDED.monitor_status,
         identity_status = EXCLUDED.identity_status,
         http_status = EXCLUDED.http_status,
         consecutive_failures = market_monitor_state.consecutive_failures + 1,
         error_text = EXCLUDED.error_text,
         payload = EXCLUDED.payload`,
      [
        source.id,
        source.productId,
        source.offerKind,
        source.seller || null,
        source.label || null,
        source.url,
        checkedAt,
        snapshot.monitorStatus || "failed",
        source.shipsToIreland ?? null,
        snapshot.identityStatus || "unknown",
        meta.httpStatus || null,
        snapshot.error || meta.error || "Monitor check failed",
        JSON.stringify(payload),
      ],
    );
  }

  if (changed) {
    await database.query(
      `INSERT INTO market_price_history
        (source_id, product_id, offer_kind, checked_at, event_type, price, currency, availability,
         shipping_to_ireland, monitor_status, content_hash, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
      [
        source.id,
        source.productId,
        source.offerKind,
        checkedAt,
        previous ? "changed" : "first_observation",
        snapshot.price ?? (previous?.price === null || previous?.price === undefined ? null : Number(previous.price)),
        snapshot.currency || previous?.currency || source.currency || null,
        snapshot.availability || previous?.availability || null,
        snapshot.shippingToIreland ?? (previous?.shipping_to_ireland === null || previous?.shipping_to_ireland === undefined ? null : Number(previous.shipping_to_ireland)),
        snapshot.monitorStatus || (snapshot.ok ? "ok" : "failed"),
        meta.contentHash || previous?.content_hash || null,
        JSON.stringify(payload),
      ],
    );
  }

  return { changed, previous };
}

export async function getMonitorSummary() {
  if (!monitorDbEnabled()) return { enabled: false };
  const [state, run] = await Promise.all([
    db().query(`SELECT
      count(*)::int AS source_count,
      count(*) FILTER (WHERE monitor_status = 'ok')::int AS healthy_count,
      count(*) FILTER (WHERE monitor_status <> 'ok')::int AS unhealthy_count,
      max(last_checked_at) AS last_checked_at,
      max(last_success_at) AS last_success_at
      FROM market_monitor_state`),
    db().query("SELECT * FROM market_monitor_runs ORDER BY id DESC LIMIT 1"),
  ]);
  return {
    enabled: true,
    ...(state.rows[0] || {}),
    lastRun: run.rows[0] || null,
  };
}

export async function getProductHistory(productId, limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const result = await db().query(
    `SELECT source_id, offer_kind, checked_at, event_type, price, currency, availability,
            shipping_to_ireland, monitor_status
       FROM market_price_history
      WHERE product_id = $1
      ORDER BY checked_at DESC
      LIMIT $2`,
    [productId, safeLimit],
  );
  return result.rows;
}

export async function closeMonitorDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
