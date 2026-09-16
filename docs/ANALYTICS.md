# Analytics contract

DROPi Global analytics is optional, first-party proxied, and disabled unless production has both `POSTHOG_PROJECT_KEY` and `POSTHOG_HOST` configured.

## Privacy defaults

- No analytics request is sent before the visitor explicitly chooses **Allow analytics**.
- If analytics is not configured, no consent banner is shown and no analytics request is attempted.
- Session recording is not part of this integration.
- The browser never receives the PostHog project key or provider host.
- Events are proxied through `/api/analytics` and checked against a server-side allowlist.
- The proxy ignores unapproved properties such as email, phone, address, query-string URLs, free-form text, or arbitrary browser payloads.
- The PostHog payload sets `$process_person_profile: false` and uses a random anonymous browser identifier stored locally after analytics is enabled.

## Allowed events

- `analytics_consent_granted`
- `catalog_loaded`
- `catalog_filter_changed`
- `basket_calculated`
- `source_link_clicked`

Allowed properties are deliberately narrow: category/origin/status filters, product id, seller/source kind, source currency, quantity, EU-dispatch boolean, saving direction, and aggregate catalog counts.

## Production activation

Do not hardcode credentials or regional endpoints. Configure Railway only after confirming the PostHog Cloud region:

- `POSTHOG_PROJECT_KEY`
- `POSTHOG_HOST`

The host is intentionally required instead of silently defaulting to a US or EU endpoint. This prevents events from being sent to the wrong regional project.
