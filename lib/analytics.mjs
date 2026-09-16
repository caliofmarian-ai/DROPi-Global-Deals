const ALLOWED_EVENTS = new Set([
  "analytics_consent_granted",
  "catalog_loaded",
  "catalog_filter_changed",
  "basket_calculated",
  "source_link_clicked",
]);

const PROPERTY_ALLOWLIST = new Set([
  "category",
  "origin",
  "status",
  "product_id",
  "seller",
  "source_kind",
  "source_currency",
  "quantity",
  "dispatch_in_eu",
  "saving_direction",
  "publishable_deal_count",
  "candidate_count",
]);

const cleanString = (value, max = 120) => String(value ?? "").trim().slice(0, max);

export function analyticsConfig(env = process.env) {
  return {
    enabled: Boolean(env.POSTHOG_PROJECT_KEY && env.POSTHOG_HOST),
    consentRequired: true,
    provider: "posthog",
    capturesPersonalData: false,
    sessionRecording: false,
  };
}

export function sanitiseAnalyticsEvent(input = {}) {
  const event = cleanString(input.event, 80);
  if (!ALLOWED_EVENTS.has(event)) return { ok: false, reason: "Event is not allowed" };
  if (input.consent !== true) return { ok: false, reason: "Analytics consent is required" };
  const distinctId = cleanString(input.distinctId, 100);
  if (!distinctId) return { ok: false, reason: "Anonymous distinct id is required" };

  const properties = {};
  for (const [key, value] of Object.entries(input.properties || {})) {
    if (!PROPERTY_ALLOWLIST.has(key)) continue;
    if (typeof value === "boolean") properties[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) properties[key] = value;
    else properties[key] = cleanString(value);
  }
  return { ok: true, event, distinctId, properties };
}

export async function forwardAnalyticsEvent(input, env = process.env, fetchImpl = fetch) {
  const config = analyticsConfig(env);
  if (!config.enabled) return { accepted: false, reason: "Analytics is not configured" };
  const clean = sanitiseAnalyticsEvent(input);
  if (!clean.ok) return { accepted: false, reason: clean.reason };

  const host = String(env.POSTHOG_HOST).replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetchImpl(`${host}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: env.POSTHOG_PROJECT_KEY,
        event: clean.event,
        properties: {
          distinct_id: clean.distinctId,
          $lib: "dropi-global-first-party",
          $process_person_profile: false,
          ...clean.properties,
        },
      }),
      signal: controller.signal,
    });
    return { accepted: response.ok, status: response.status };
  } catch {
    return { accepted: false, reason: "Analytics provider unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
