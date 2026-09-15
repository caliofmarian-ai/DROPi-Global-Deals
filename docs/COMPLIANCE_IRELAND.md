# Ireland compliance baseline

_Last reviewed: 2026-09-15. This is an engineering/commercial checklist, not a substitute for professional legal or tax advice._

## Cross-border price calculation

### Goods shipped from another EU country

Irish Revenue states that Customs Duty is not payable on goods bought from another EU country (ordinary non-excise goods). VAT rules still apply. DROPi therefore does **not** add an import-customs line to EU-to-Ireland consumer comparisons.

Source: https://www.revenue.ie/en/customs/individuals/buying-online-personal/from-eu.aspx

### Goods shipped from outside the EU

From 1 July 2026, Revenue states that a €3 customs duty charge applies per distinct item/line type to most e-commerce consignments valued at €150 or less arriving in Ireland from outside the EU. Where IOSS is not used, import VAT may also be collected, and courier/postal administration fees may apply.

For consignments over €150, the applicable customs rate depends on TARIC classification. The engine therefore refuses to produce a completed calculation for such a consignment unless a customs rate is supplied.

Sources:
- https://www.revenue.ie/en/customs/individuals/buying-online-personal/outside-eu.aspx
- https://www.revenue.ie/en/customs/individuals/relief-low-value-consignments/index.aspx
- https://www.revenue.ie/en/vat/vat-ecommerce/import-oss/index.aspx

## Food

For the MVP, prefer products already lawfully distributed from within the EU. FSAI states that commercial food imports from outside the EU can trigger food-business/importer registration, EORI, classification, documentation, TRACES NT and/or official border controls depending on the product.

No food should be promoted as a DROPi direct-sale/dropship product until the route-to-market, labelling, allergen, traceability and importer responsibilities are verified.

Source: https://www.fsai.ie/enforcement-and-legislation/legislation/food-legislation/imports/what-to-consider-when-bringing-food-into-ireland

## Consumer rights

If DROPi becomes the trader rather than only an affiliate/referral service, consumer-law obligations must be implemented in checkout, terms, returns and support. CCPC states that most online purchases have a 14-day cooling-off period, subject to exceptions.

Source: https://www.ccpc.ie/consumer-advice/consumer-rights/buying-goods/buying-online

## Products excluded from the initial direct-commerce scope

- alcohol and tobacco
- medicines and regulated/high-risk supplements
- weapons and controlled items
- foods requiring cold-chain handling unless a compliant supplier owns that flow
- high-risk food imports from outside the EU until importer controls are implemented
- products without traceable manufacturer/supplier identity
- products with unverifiable safety/conformity claims

## Required future work before checkout

- Irish business/trader identity and terms
- privacy/cookie implementation
- affiliate disclosure
- returns/refunds workflow
- product safety/GPSR evidence where applicable
- VAT/accounting model
- supplier contracts and stock/price-feed terms
- food-business controls for any applicable food-selling model
