# DROPi Global Deals

**Better value, properly compared.**

DROPi Global is an Ireland-first comparison and affiliate-commerce project. Its job is not to claim that imported goods are always cheaper; its job is to calculate whether a specific product is genuinely better value after delivery, customs, VAT and fees.

## Product rule

A product becomes a **verified deal** only when we can support all of the following:

1. The Irish comparison price is current and like-for-like.
2. The source product is the same SKU/EAN/model, or the quality comparison is explicitly measurable.
3. Delivery to Ireland is known.
4. Applicable customs, VAT and administration fees are included.
5. Country of origin and country/warehouse of dispatch are recorded separately.
6. Food quality claims are evidence-based (ingredients, certification, origin, processing, harvest data, etc.).
7. The source is legally suitable for sale/delivery to the Irish customer.

If any material input is missing, the UI shows a research or verification state instead of a fake saving.

## MVP

- Fast dependency-free Node server
- Ireland landed-cost calculation API
- 2026 low-value non-EU customs logic
- IOSS-aware VAT handling
- EU-first sourcing model
- Product research queue and evidence links
- Origin / category / evidence-status filters
- Browser landed-cost calculator
- Automated Node tests
- Railway-ready start command and health endpoint

## Run

```bash
npm test
npm run check
npm start
```

Open `http://localhost:3000` and health-check `http://localhost:3000/health`.

## Compliance baseline

Current implementation is informed by official Irish sources and must be reviewed whenever rules change:

- Revenue — buying from outside the EU: https://www.revenue.ie/en/customs/individuals/buying-online-personal/outside-eu.aspx
- Revenue — buying from an EU country: https://www.revenue.ie/en/customs/individuals/buying-online-personal/from-eu.aspx
- Revenue — IOSS: https://www.revenue.ie/en/vat/vat-ecommerce/import-oss/index.aspx
- FSAI — importing food: https://www.fsai.ie/enforcement-and-legislation/legislation/food-legislation/imports/what-to-consider-when-bringing-food-into-ireland
- CCPC — online shopping rights: https://www.ccpc.ie/consumer-advice/consumer-rights/buying-goods/buying-online

See `docs/COMPLIANCE_IRELAND.md` and `docs/PRODUCT_STANDARD.md`.

## Commercial sequence

1. Comparison/search engine
2. Affiliate links for verified suppliers
3. Automated price freshness and product matching
4. Supplier feeds/APIs
5. Dropshipping only where margin, returns, safety and legal responsibility are understood
6. Shopify/checkout integration only for products that pass those gates

This repository is the source of truth for DROPi Global Deals.
