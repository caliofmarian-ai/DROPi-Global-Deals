import test from "node:test";
import assert from "node:assert/strict";
import { analyticsConfig, forwardAnalyticsEvent, sanitiseAnalyticsEvent } from "../lib/analytics.mjs";

test("analytics stays disabled until both project key and regional host are configured", () => {
  assert.equal(analyticsConfig({}).enabled, false);
  assert.equal(analyticsConfig({ POSTHOG_PROJECT_KEY:"phc_test" }).enabled, false);
  assert.equal(analyticsConfig({ POSTHOG_HOST:"https://example.invalid" }).enabled, false);
  assert.equal(analyticsConfig({ POSTHOG_PROJECT_KEY:"phc_test", POSTHOG_HOST:"https://example.invalid" }).enabled, true);
});

test("analytics requires explicit consent and an allowed event", () => {
  assert.equal(sanitiseAnalyticsEvent({ event:"catalog_loaded", distinctId:"anon", consent:false }).ok, false);
  assert.equal(sanitiseAnalyticsEvent({ event:"password_captured", distinctId:"anon", consent:true }).ok, false);
  assert.equal(sanitiseAnalyticsEvent({ event:"catalog_loaded", distinctId:"anon", consent:true }).ok, true);
});

test("analytics strips unapproved properties", () => {
  const clean = sanitiseAnalyticsEvent({
    event:"source_link_clicked",
    distinctId:"anonymous-1",
    consent:true,
    properties:{ product_id:"p1", seller:"Seller", email:"private@example.com", full_url:"https://example.com/?secret=x" }
  });
  assert.deepEqual(clean.properties,{ product_id:"p1", seller:"Seller" });
});

test("provider payload suppresses person profiles and never exposes configuration in the response", async () => {
  let request;
  const fakeFetch = async (url, options) => {
    request = { url, options };
    return { ok:true, status:200 };
  };
  const result = await forwardAnalyticsEvent({
    event:"basket_calculated",
    distinctId:"anon-2",
    consent:true,
    properties:{ quantity:3, source_currency:"RON", saving_direction:"import" }
  },{
    POSTHOG_PROJECT_KEY:"phc_server_only",
    POSTHOG_HOST:"https://analytics.example"
  },fakeFetch);
  assert.deepEqual(result,{ accepted:true, status:200 });
  assert.equal(request.url,"https://analytics.example/i/v0/e/");
  const payload=JSON.parse(request.options.body);
  assert.equal(payload.api_key,"phc_server_only");
  assert.equal(payload.properties.distinct_id,"anon-2");
  assert.equal(payload.properties.$process_person_profile,false);
});
