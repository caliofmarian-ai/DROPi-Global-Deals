# DROPi Global Evidence & Freshness Policy

DROPi Global must prefer a smaller set of defensible comparisons over a large catalog of misleading price gaps.

## Timestamps

- `observedAt`: when the DROPi research process found or reviewed the evidence.
- `checkedAt` / `sourceCheckedAt`: the date attributable to the actual price evidence itself.
- If a merchant or comparison source does not expose a trustworthy price timestamp, the price timestamp stays `null`. The system must not turn today's research date into a fake fresh-price date.
- Dated snapshots expire according to the catalog freshness window (currently seven days for publishable price evidence).

## Aggregators

Price-comparison portals are useful for discovery, but their domestic shipping totals must not be treated as delivery-to-Ireland evidence. The merchant must support Ireland and the Ireland shipping price must be separately verified.

If an aggregator warns that prices are snapshots or may have changed, DROPi records the source's own update date and treats old data as stale.

## Irish-market floor

For each candidate, DROPi may store multiple eligible Irish offers. The comparison engine uses the lowest known comparable Irish product price as a conservative market floor. An old cheaper Irish offer is not ignored merely because a newer Irish offer is more expensive; instead it blocks a positive import verdict until the cheaper local price is rechecked.

Out-of-stock offers and offers that are not the same SKU or a defensible quality match are excluded from the comparison floor.

## Shipping and landed cost

A foreign product price is never a saving by itself. A publishable deal requires:

1. comparable quality or exact SKU;
2. trustworthy Irish comparison price;
3. trustworthy source price;
4. dispatch country;
5. Ireland delivery price;
6. VAT, customs and carrier/admin fees where applicable;
7. a positive saving after all required landed costs.

## Origin vs dispatch

`originCountry` describes where the product originates. `dispatchCountry` describes where the parcel starts its journey to Ireland. Border and import treatment follows dispatch reality, not cultural origin. A Filipino product dispatched from a compliant Dutch warehouse is therefore different from a parcel sent directly from the Philippines.
