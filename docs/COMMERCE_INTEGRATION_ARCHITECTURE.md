# Commerce Integration Architecture

Status: CURRENT  
Owner: DROPi Global Deals  
Tracking: #4

## 1. Purpose

DROPi Global Deals is the commerce-intelligence and comparison layer for the DROPi ecosystem. It discovers products and offers, verifies whether a deal is genuinely better value for the target customer, calculates landed cost, applies evidence and compliance gates, and routes an eligible transaction to the appropriate monetization channel.

It is **not** a catch-all Shopify shop and must not become a shared product catalog for unrelated DROPi verticals.

## 2. Core architecture

```text
Customer intent
    |
    v
DROPi Global Deals search / AI shopping layer
    |
    +--> product identity + matching (SKU / EAN / GTIN / model)
    |
    +--> offer sources
    |      +--> Klarna-assisted research / approved production integration
    |      +--> affiliate networks and merchant feeds
    |      +--> direct supplier feeds / APIs
    |      +--> eligible DROPi-owned Shopify storefronts
    |
    +--> provider market guard
    |      +--> requested market
    |      +--> provider response market
    |      +--> target customer market
    |
    +--> provider adapter layer
    |      +--> canonical identifiers
    |      +--> price / currency
    |      +--> shipping evidence
    |      +--> evidence and monetization status
    |
    +--> Ireland-first landed-cost engine
    |      +--> item price
    |      +--> delivery
    |      +--> VAT
    |      +--> customs / duties
    |      +--> administration fees
    |      +--> other mandatory known charges
    |
    +--> evidence + legal/compliance gate
    |
    +--> monetization router
           +--> affiliate destination
           +--> dedicated DROPi Shopify storefront
           +--> future marketplace merchant
           +--> future direct supplier relationship
```

No offer is promoted as a verified saving when a material landed-cost or evidence input is missing.

## 3. Store isolation is mandatory

Each independent commercial vertical that sells through Shopify must use its **own dedicated Shopify store/project**.

The following must never be mixed between independent verticals:

- products and variants;
- collections and navigation;
- branding, themes and storefront copy;
- pages, policies and legal notices;
- discounts and promotions;
- analytics and attribution configuration;
- customers and customer segments;
- inventory and locations;
- fulfillment settings;
- automations;
- supplier credentials or feeds;
- project-specific images and marketing assets.

A shared DROPi name or shared technology does not override this rule.

## 4. Current vertical boundaries

| Repository / vertical | Primary role | Shopify policy |
| --- | --- | --- |
| `DROPi-Global-Deals` | comparison, landed-cost, offer intelligence, routing | no generic shared store; checkout only through an explicitly assigned eligible storefront |
| `DROPi-Home-Affiliate` | home-oriented affiliate commerce | dedicated storefront if/when direct Shopify selling is activated |
| `DROPi-Producatori-Romani` | Romanian-producer commerce | dedicated Romanian-language storefront if/when Shopify selling is activated |
| `DROPi-Delivery-Affiliate` | delivery-domain affiliate vertical | dedicated storefront if/when Shopify selling is activated |

Future commercial verticals inherit the same one-vertical/one-store isolation rule unless a later canonical architecture decision explicitly proves that they are the same legal and commercial storefront.

## 5. Shopify operational safety protocol

Before **any Shopify write action**:

1. Identify the target DROPi vertical.
2. Identify the Shopify store assigned to that vertical.
3. Verify the currently active store context.
4. If the active store is not the assigned store, stop and explicitly switch store context before continuing.
5. If no store has been assigned to the vertical, do not write products, collections, pages, discounts or customer data anywhere else as a substitute.
6. Record the vertical-to-store assignment in canonical project documentation before scaled automation begins.

Read-only inspection of a connected store does not assign that store to a vertical.

The currently connected Shopify store must therefore be treated as **UNASSIGNED** until the owner explicitly assigns it to a project or a new dedicated store is created for a vertical.

## 6. External provider boundary

### 6.1 Research sources

Shopping/search tools such as Klarna Shopping Search may be used as assisted research sources for:

- product discovery;
- offer discovery;
- price comparison research;
- detecting potential cheaper-abroad candidates;
- identifying merchants and product-model matches for later verification.

Research output is not automatically a verified DROPi deal. The research-snapshot adapter forces externally researched records to remain non-publishable by default:

- `comparisonEligible = false`;
- `qualityStatus = research`;
- `monetizationChannel = research_only`;
- `evidenceStatus = provider_research`.

A separate approved adapter plus independent evidence is required before a record can become comparison-eligible.

### 6.2 Market integrity

Every provider batch tracks separately:

- `requestedMarket` — the market DROPi asked the provider to search;
- `responseMarket` — the market the provider actually returned;
- `targetMarket` — the final customer/destination market.

If `requestedMarket` and `responseMarket` do not match, the batch is rejected before catalog comparison. A source-market search such as Germany for an Ireland customer is allowed only when the requested and returned provider markets both identify Germany; the final Ireland target remains separate.

### 6.3 Production integrations

Production integration with any provider must be treated separately from conversational/plugin research capability.

Before production use, DROPi must verify and document:

- approved access and commercial terms;
- allowed markets and data fields;
- rate limits and freshness expectations;
- attribution/link requirements;
- data retention and display rights;
- whether URLs or monetization attribution belong to the provider, DROPi, the merchant, or another affiliate network;
- credential storage and rotation requirements.

No code may assume that conversational/plugin access grants unrestricted production API rights.

## 7. Offer normalization

External provider records are normalized before they reach the existing comparison engine. The provider adapter contract preserves or derives, where supplied:

```text
product_id
canonical_product_key
sku / ean / gtin / model / mpn
merchant_id
provider
provider_adapter
provider_offer_id
requested_market
provider_market
target_market
currency
item_price
shipping_cost
known_taxes
known_duties
known_admin_fees
availability
origin_country
dispatch_country
product_url
monetization_channel
evidence_status
freshness_timestamp
```

Missing material fields must remain explicit rather than silently defaulting to zero.

The adapter layer does not replace the existing landed-cost, freshness, product-identity or evidence rules. It only provides a controlled boundary between external sources and those rules.

## 8. Monetization router

The cheapest observed sticker price is not automatically the preferred path.

Routing must consider:

1. verified landed cost;
2. product identity confidence;
3. legal/compliance eligibility;
4. availability and delivery feasibility;
5. returns/warranty implications where material;
6. monetization eligibility;
7. disclosure requirements;
8. freshness of the source data.

Supported monetization channels may include:

- affiliate commission;
- sale through a dedicated DROPi Shopify storefront;
- future marketplace commission;
- future promoted merchant placement, clearly disclosed;
- future logistics or fulfillment revenue where legally and operationally supported.

The system must not falsely label an offer as objectively best merely because it yields a higher DROPi commission.

## 9. Figma isolation

Figma is the product-design workspace, not the canonical code store.

Current structure:

- `DROPi Global Deals` — dedicated comparison/search/AI-shopping design file;
- `DROPi Home` — independent storefront design when needed;
- `DROPi Producatori Romani` — independent Romanian storefront design when needed;
- `DROPi Delivery Affiliate` — independent vertical design when needed;
- shared DROPi design tokens/components only when they are genuinely cross-project primitives.

Project-specific screens and components must not overwrite another vertical's storefront design.

GitHub remains canonical for implementation and architecture documentation.

## 10. Canva isolation

Canva is the marketing-creative workspace.

Each vertical should have its own project/folder or brand workspace for:

- ad creatives;
- social media assets;
- product cards;
- comparison graphics;
- campaign banners;
- presentations;
- reusable templates.

Cross-vertical reuse is allowed only for explicitly shared DROPi brand primitives. Product claims, price claims and legal/commercial wording remain vertical-specific.

## 11. Implementation state

### Phase A — comparison foundation — IMPLEMENTED

- comparison and landed-cost logic remains in `DROPi-Global-Deals`;
- evidence status and freshness are preserved;
- an unassigned Shopify store is not populated.

### Phase B — source adapters — PARTIALLY IMPLEMENTED

Implemented:

- provider-neutral market guard;
- requested/response/target market separation;
- provider-neutral adapter contract;
- safe research-snapshot adapter;
- strong identifier normalization when available;
- automated tests and syntax checks.

Still required:

- approved live affiliate/merchant feeds;
- production Klarna adapter only after access and terms are verified;
- stronger cross-provider product deduplication and identity reconciliation.

### Phase C — commercial routing — NEXT

- maintain a registry of approved monetization destinations;
- route verified deals to affiliate destinations or a dedicated vertical storefront;
- track attribution without distorting comparison results;
- prevent unverified/research-only offers from entering monetized routes.

### Phase D — dedicated Shopify storefronts

For each vertical approved for direct selling:

- create or assign a dedicated Shopify store;
- record its canonical assignment;
- create only that vertical's products and collections;
- keep legal pages, policies, analytics and operations isolated;
- connect the storefront to DROPi Global Deals through a controlled catalog/offer boundary rather than by merging stores.

### Phase E — global expansion

- add market-specific tax, customs and consumer-law logic;
- add additional product/merchant sources for markets not covered by a single provider;
- preserve the same verification and store-isolation rules globally.

## 12. Current invariants

The following are canonical project invariants:

- one independent commercial vertical does not write into another vertical's Shopify store;
- the active connected Shopify store remains UNASSIGNED unless the owner explicitly assigns it;
- every Shopify write workflow verifies store context first;
- assisted shopping research and production provider integrations remain separate capabilities;
- provider market mismatch fails closed;
- research-source data cannot self-promote into a verified deal;
- missing shipping, tax, evidence or other material cost fields are not converted to zero;
- GitHub remains the source of truth for code and architecture.
