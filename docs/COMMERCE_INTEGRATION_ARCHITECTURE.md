# Commerce Integration Architecture

Status: PROPOSED  
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

## 6. Klarna integration boundary

### 6.1 Immediate use

Klarna Shopping Search can be used as an assisted research source for:

- product discovery;
- offer discovery;
- price comparison research;
- detecting potential cheaper-abroad candidates;
- identifying merchants and product-model matches for later verification.

Research output is not automatically a verified DROPi deal. It must still pass the repository's product, landed-cost, evidence and compliance rules.

### 6.2 Production application use

Production integration must be treated separately from the conversational/plugin research capability.

Before production use, DROPi must verify and document:

- approved access and commercial terms;
- allowed markets and data fields;
- rate limits and freshness expectations;
- attribution/link requirements;
- data retention and display rights;
- whether URLs or monetization attribution belong to Klarna, DROPi, the merchant, or another affiliate network;
- credential storage and rotation requirements.

No code may assume that conversational/plugin access grants unrestricted production API rights.

## 7. Offer normalization

Every incoming offer should be normalized to a common internal shape before comparison:

```text
product_id
canonical_product_key
sku/ean/gtin/model
merchant_id
source
source_market
currency
item_price
shipping_cost
known_taxes
known_duties
known_admin_fees
landed_cost
availability
estimated_delivery
origin_country
dispatch_country
international_offer
product_url
monetization_channel
evidence_status
freshness_timestamp
```

Missing material fields must remain explicit rather than silently defaulting to zero.

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

Recommended structure:

- `DROPi Global Deals` — comparison/search/AI shopping experience;
- `DROPi Home` — independent storefront design;
- `DROPi Producatori Romani` — independent Romanian storefront design;
- `DROPi Delivery Affiliate` — independent vertical design;
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

## 11. Phased implementation

### Phase A — current

- Keep comparison and landed-cost logic in `DROPi-Global-Deals`.
- Use assisted shopping sources for research and candidate discovery.
- Preserve evidence status and freshness.
- Do not populate an unassigned Shopify store.

### Phase B — source adapters

- Add a provider-neutral offer-source interface.
- Add approved affiliate/merchant feeds.
- Add production Klarna adapter only after approved access and terms are documented.
- Deduplicate products by strong identifiers where possible.

### Phase C — commercial routing

- Maintain a registry of approved monetization destinations.
- Route verified deals to affiliate destinations or a dedicated vertical storefront.
- Track attribution without distorting comparison results.

### Phase D — dedicated Shopify storefronts

For each vertical that is approved for direct selling:

- create or assign a dedicated Shopify store;
- record its canonical assignment;
- create only that vertical's products and collections;
- keep legal pages, policies, analytics and operations isolated;
- connect the storefront to DROPi Global Deals through a controlled catalog/offer boundary rather than by merging stores.

### Phase E — global expansion

- add market-specific tax, customs and consumer-law logic;
- add additional product/merchant sources for markets not covered by a single provider;
- preserve the same verification and store-isolation rules globally.

## 12. Definition of done for Issue #4

This architecture is ready for adoption when:

- the document is merged and linked from the README;
- no existing vertical is treated as sharing a Shopify catalog by default;
- the active connected Shopify store remains unassigned unless the owner explicitly assigns it;
- future Shopify automation verifies store context before every write workflow;
- Klarna conversational research and production API integration are documented as separate capabilities;
- implementation work can be broken into source-adapter and routing issues without changing these boundaries.
