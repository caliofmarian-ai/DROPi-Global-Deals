# DROPi product and deal standard

## Status model

- `research_queue` — category/product idea only; not a deal.
- `needs_shipping_quote` — a product-price gap exists, but Ireland delivery or another landed-cost field is missing.
- `verified_deal` — like-for-like comparison, fresh evidence and complete landed cost show a positive saving.
- `cheaper_in_ireland` — complete comparison shows the Irish option is cheaper.
- `expired` — evidence is too old or a source stopped matching.
- `blocked` — legal, safety, supplier or provenance gate failed.

## Evidence required for an identical-product comparison

Prefer, in order:

1. exact EAN/GTIN
2. exact manufacturer part number
3. exact model + pack size + specification
4. manual evidence review where identifiers are unavailable

Do not compare a premium variant with a budget variant and call the price difference a saving.

## Food quality

“Better quality” must be decomposed into facts. Depending on category, useful evidence includes:

- ingredient list and percentage of primary ingredient
- absence/presence of additives or sweeteners
- protected designation (PDO/PGI/TSG)
- certified organic status
- named producer and production region
- harvest/crop year
- extraction/processing method
- raw/unheated claims with supplier evidence
- pack date / best-before
- traceability and EU-compliant labelling

Subjective taste claims must stay subjective.

## Savings formula

`landed cost = product price + Ireland shipping + insurance + customs + import VAT + courier/admin fees`

`cash saving = Irish like-for-like price - landed cost`

`percentage saving = cash saving / Irish price × 100`

A product is not a verified deal if a material term such as Ireland delivery is unknown.

## Country fields

Always store separately:

- `originCountry`
- `shipsFrom`

A Filipino product shipped from an EU warehouse is not the same customs proposition as the same product shipped directly from the Philippines.

## Freshness

Future supplier adapters should store:

- observed price
- observed shipping price/threshold
- currency and conversion source
- observation timestamp
- source URL
- stock state
- seller identity

A scheduled verifier should downgrade a deal when evidence exceeds its freshness window or changes materially.
