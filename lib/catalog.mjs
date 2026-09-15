import { calculateLandedCost } from "./landed-cost.mjs";

const DAY_MS = 86_400_000;
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const numericOrNull = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function priceFreshness(checkedAt, now = new Date(), maxAgeDays = 7) {
  const checked = parseDate(checkedAt);
  if (!checked) return { state: "unknown", ageDays: null };
  const ageDays = Math.max(0, Math.floor((now.getTime() - checked.getTime()) / DAY_MS));
  return { state: ageDays <= maxAgeDays ? "fresh" : "stale", ageDays };
}

function normaliseIrelandOffer(offer, product, now) {
  const numericPrice = numericOrNull(offer.price);
  const freshness = priceFreshness(offer.checkedAt, now, offer.freshForDays ?? product.freshForDays ?? 7);
  return { ...offer, numericPrice, freshness };
}

export function selectIrelandOffer(product, now = new Date()) {
  const offers = Array.isArray(product.irelandOffers) ? product.irelandOffers : [];
  const eligible = offers
    .map((offer) => normaliseIrelandOffer(offer, product, now))
    .filter((offer) => offer.numericPrice !== null && offer.comparisonEligible !== false && offer.availability !== "out_of_stock")
    .sort((a, b) => a.numericPrice - b.numericPrice);

  if (eligible.length) {
    const best = eligible[0];
    const freshEligible = eligible.filter((offer) => offer.freshness.state === "fresh").sort((a, b) => a.numericPrice - b.numericPrice);
    const bestFresh = freshEligible[0] || null;
    return {
      price: roundMoney(best.numericPrice),
      freshness: best.freshness,
      offer: {
        label: best.label || best.seller || "Irish retailer",
        seller: best.seller || best.label || "Irish retailer",
        url: best.url || null,
        checkedAt: best.checkedAt || null,
        observedAt: best.observedAt || null,
        availability: best.availability || "unknown",
      },
      eligibleCount: eligible.length,
      freshPrice: bestFresh ? roundMoney(bestFresh.numericPrice) : null,
      freshOffer: bestFresh ? {
        label: bestFresh.label || bestFresh.seller || "Irish retailer",
        seller: bestFresh.seller || bestFresh.label || "Irish retailer",
        url: bestFresh.url || null,
        checkedAt: bestFresh.checkedAt || null,
        observedAt: bestFresh.observedAt || null,
        availability: bestFresh.availability || "unknown",
      } : null,
      freshEligibleCount: freshEligible.length,
    };
  }

  const legacyPrice = numericOrNull(product.irelandPrice);
  if (legacyPrice === null) return {
    price: null,
    freshness: { state: "unknown", ageDays: null },
    offer: null,
    eligibleCount: 0,
    freshPrice: null,
    freshOffer: null,
    freshEligibleCount: 0,
  };
  const freshness = priceFreshness(product.irelandCheckedAt || product.checkedAt, now, product.freshForDays ?? 7);
  const offer = product.evidence?.ireland ? {
    label: product.evidence.ireland.label || "Irish reference",
    seller: product.evidence.ireland.label || "Irish reference",
    url: product.evidence.ireland.url || null,
    checkedAt: product.irelandCheckedAt || product.checkedAt || null,
    availability: "unknown",
  } : null;
  return {
    price: roundMoney(legacyPrice),
    freshness,
    offer,
    eligibleCount: 0,
    freshPrice: freshness.state === "fresh" ? roundMoney(legacyPrice) : null,
    freshOffer: freshness.state === "fresh" ? offer : null,
    freshEligibleCount: freshness.state === "fresh" ? 1 : 0,
  };
}

function routeBase(offer, freshness) {
  return {
    id: offer.id || offer.seller || offer.label || "source-route",
    seller: offer.seller || offer.label || "Source seller",
    label: offer.label || offer.seller || "Source seller",
    url: offer.url || null,
    evidenceUrl: offer.evidenceUrl || null,
    dispatchCountry: offer.dispatchCountry || null,
    dispatchInEu: typeof offer.dispatchInEu === "boolean" ? offer.dispatchInEu : null,
    productPrice: numericOrNull(offer.productPrice ?? offer.price),
    shippingToIreland: numericOrNull(offer.shippingToIreland),
    adminFee: numericOrNull(offer.adminFee) ?? 0,
    freshness: freshness.state,
    priceAgeDays: freshness.ageDays,
    checkedAt: offer.checkedAt || null,
    observedAt: offer.observedAt || null,
    landedCost: null,
    savingsVsFreshIreland: null,
    breakEvenShipping: null,
    shippingOverBreakEven: null,
    publishableRoute: false,
    status: "research",
    reason: "More route evidence is required.",
  };
}

export function evaluateSourceOffer(product, offer, ireland, now = new Date()) {
  const freshness = priceFreshness(offer.checkedAt, now, offer.freshForDays ?? product.freshForDays ?? 7);
  const route = routeBase(offer, freshness);
  const price = route.productPrice;
  const shipping = route.shippingToIreland;
  const dispatchInEu = route.dispatchInEu;

  if (offer.comparisonEligible === false) {
    route.status = "excluded_not_comparable";
    route.reason = "This seller offer is not a defensible SKU or quality match.";
    return route;
  }
  if (offer.availability === "out_of_stock") {
    route.status = "excluded_out_of_stock";
    route.reason = "The route is excluded because the offer is out of stock.";
    return route;
  }
  if (offer.shipsToIreland === false) {
    route.status = "no_ireland_delivery";
    route.reason = "The seller does not ship this route to Ireland.";
    return route;
  }
  if (price === null) {
    route.status = "needs_source_price";
    route.reason = "The seller price is missing or invalid.";
    return route;
  }
  if (freshness.state !== "fresh") {
    route.status = freshness.state === "stale" ? "stale_source" : "unknown_source_freshness";
    route.reason = freshness.state === "stale"
      ? `The source price evidence is ${freshness.ageDays} days old.`
      : "The source price has no trustworthy evidence timestamp.";
    return route;
  }
  if (shipping === null) {
    route.status = "needs_shipping_quote";
    route.reason = "Ireland delivery is not verified for this seller route.";
    return route;
  }
  if (dispatchInEu === null) {
    route.status = "needs_dispatch_evidence";
    route.reason = "The parcel dispatch location is not verified.";
    return route;
  }

  if (dispatchInEu && ireland.freshPrice !== null) {
    route.breakEvenShipping = roundMoney(Math.max(0, ireland.freshPrice - price - route.adminFee - Number(offer.insurance || 0)));
    route.shippingOverBreakEven = roundMoney(shipping - route.breakEvenShipping);
  }

  const landed = calculateLandedCost({
    localIrelandPrice: ireland.freshPrice,
    sourcePrice: price,
    shipping,
    adminFee: route.adminFee,
    insurance: offer.insurance ?? 0,
    intrinsicValue: offer.intrinsicValue ?? price,
    dispatchInEu,
    distinctLineItems: offer.distinctLineItems ?? 1,
    vatRate: offer.vatRate ?? 0.23,
    iossVatCollected: offer.iossVatCollected ?? false,
    customsRate: offer.customsRate ?? null,
  });

  if (landed.status !== "complete") {
    route.status = "needs_tax_evidence";
    route.reason = landed.reason;
    return route;
  }
  route.landedCost = landed.landedCost;

  if (ireland.freshPrice === null) {
    route.status = "needs_local_recheck";
    route.reason = "The route cost is complete, but there is no fresh comparable Irish price.";
    return route;
  }

  route.savingsVsFreshIreland = landed.savings;
  if (!landed.deal) {
    route.status = "rejected_local_cheaper";
    route.reason = "This complete import route costs at least as much as the best fresh Irish reference price.";
    return route;
  }

  if (ireland.price !== null && ireland.price < ireland.freshPrice && ireland.freshness.state !== "fresh") {
    route.status = "needs_local_recheck";
    route.reason = "A cheaper older Irish offer is known and must be rechecked before publishing a positive import verdict.";
    return route;
  }

  const qualityStatus = offer.qualityStatus ?? product.qualityStatus ?? "research";
  if (qualityStatus !== "verified") {
    route.status = "needs_quality_evidence";
    route.reason = "The route is cheaper, but exact SKU or quality equivalence is not verified.";
    return route;
  }

  route.status = "verified_route";
  route.publishableRoute = true;
  route.reason = "Fresh seller price, Ireland delivery, dispatch and quality evidence support this route.";
  return route;
}

export function evaluateSourceOffers(product, ireland, now = new Date()) {
  const offers = Array.isArray(product.sourceOffers) ? product.sourceOffers : [];
  return offers.map((offer) => evaluateSourceOffer(product, offer, ireland, now));
}

function evaluateProductWithRoutes(product, ireland, now) {
  const routes = evaluateSourceOffers(product, ireland, now);
  const usable = routes.filter((route) => !route.status.startsWith("excluded_"));
  const completed = usable.filter((route) => route.landedCost !== null).sort((a, b) => a.landedCost - b.landedCost);
  const verified = usable.filter((route) => route.status === "verified_route").sort((a, b) => a.landedCost - b.landedCost);
  const lowestProductPrice = usable.map((route) => route.productPrice).filter((value) => value !== null).sort((a, b) => a - b)[0] ?? null;
  const rawGap = ireland.price !== null && lowestProductPrice !== null ? roundMoney(ireland.price - lowestProductPrice) : null;

  const derived = {
    comparisonIrelandPrice: ireland.price,
    comparisonIrelandOffer: ireland.offer,
    comparisonIrelandFreshness: ireland.freshness.state,
    comparisonIrelandPriceAgeDays: ireland.freshness.ageDays,
    bestFreshIrelandPrice: ireland.freshPrice,
    bestFreshIrelandOffer: ireland.freshOffer,
    eligibleIrelandOfferCount: ireland.eligibleCount,
    freshIrelandOfferCount: ireland.freshEligibleCount,
    rawGap,
    rawGapPercent: ireland.price > 0 && rawGap !== null ? roundMoney((rawGap / ireland.price) * 100) : null,
    sourceRoutes: routes,
    bestCompleteSourceRoute: completed[0] || null,
    landedCost: verified[0]?.landedCost ?? null,
    savings: verified[0]?.savingsVsFreshIreland ?? null,
    savingsPercent: verified[0] && ireland.freshPrice > 0 ? roundMoney((verified[0].savingsVsFreshIreland / ireland.freshPrice) * 100) : null,
    publishableDeal: verified.length > 0,
    freshness: verified[0]?.freshness ?? (usable[0]?.freshness || "unknown"),
    priceAgeDays: verified[0]?.priceAgeDays ?? (usable[0]?.priceAgeDays ?? null),
    blockers: [],
    status: "research_queue",
    statusReason: "No complete import route is verified yet.",
  };

  if (verified.length) {
    derived.status = "verified_deal";
    derived.statusReason = "At least one fully evidenced import route beats the fresh Irish market reference.";
    return { ...product, derived };
  }

  const routePriority = [
    "needs_local_recheck",
    "needs_shipping_quote",
    "needs_quality_evidence",
    "needs_dispatch_evidence",
    "needs_tax_evidence",
    "unknown_source_freshness",
    "stale_source",
    "needs_source_price",
  ];
  for (const status of routePriority) {
    const match = usable.find((route) => route.status === status);
    if (match) {
      derived.status = status === "stale_source" || status === "unknown_source_freshness" ? "stale" : status;
      derived.statusReason = match.reason;
      derived.blockers = [status];
      return { ...product, derived };
    }
  }

  const competitiveChecks = usable.filter((route) => route.status === "rejected_local_cheaper" || route.status === "no_ireland_delivery");
  if (usable.length && competitiveChecks.length === usable.length) {
    derived.status = "no_verified_import_win";
    derived.statusReason = "None of the currently complete and eligible source routes beats the fresh Irish reference price.";
    return { ...product, derived };
  }

  return { ...product, derived };
}

export function evaluateProduct(product, now = new Date()) {
  const ireland = selectIrelandOffer(product, now);
  if (Array.isArray(product.sourceOffers) && product.sourceOffers.length) {
    return evaluateProductWithRoutes(product, ireland, now);
  }

  const sourceFreshness = priceFreshness(product.sourceCheckedAt || product.checkedAt, now, product.freshForDays ?? 7);
  const local = ireland.price;
  const source = numericOrNull(product.sourcePrice);
  const shipping = numericOrNull(product.shippingToIreland);
  const adminFee = numericOrNull(product.adminFee) ?? 0;
  const qualityStatus = product.qualityStatus ?? "research";
  const dispatchInEu = typeof product.dispatchInEu === "boolean" ? product.dispatchInEu : product.sourceInEu;
  const blockers = [];

  const derived = {
    comparisonIrelandPrice: local,
    comparisonIrelandOffer: ireland.offer,
    comparisonIrelandFreshness: ireland.freshness.state,
    comparisonIrelandPriceAgeDays: ireland.freshness.ageDays,
    bestFreshIrelandPrice: ireland.freshPrice,
    bestFreshIrelandOffer: ireland.freshOffer,
    eligibleIrelandOfferCount: ireland.eligibleCount,
    freshIrelandOfferCount: ireland.freshEligibleCount,
    rawGap: null,
    rawGapPercent: null,
    landedCost: null,
    savings: null,
    savingsPercent: null,
    sourceRoutes: [],
    publishableDeal: false,
    freshness: sourceFreshness.state,
    priceAgeDays: sourceFreshness.ageDays,
    blockers,
    status: "research_queue",
    statusReason: "More pricing evidence is required.",
  };

  if (local !== null && source !== null) {
    derived.rawGap = roundMoney(local - source);
    derived.rawGapPercent = local > 0 ? roundMoney(((local - source) / local) * 100) : 0;
  }

  if (sourceFreshness.state === "stale" && source !== null) {
    blockers.push("source_price_stale");
    derived.status = "stale";
    derived.statusReason = `Source price evidence is ${sourceFreshness.ageDays} days old and must be checked again.`;
    return { ...product, derived };
  }

  if (local === null || source === null) {
    if (local === null) blockers.push("irish_price_missing");
    if (source === null) blockers.push("source_price_missing");
    derived.statusReason = product.researchReason || "Ireland and source prices are not both verified in EUR yet.";
    return { ...product, derived };
  }

  if (derived.rawGap <= 0) {
    derived.status = "cheaper_in_ireland";
    derived.statusReason = "The foreign product price does not beat the best eligible Irish reference price before delivery.";
    return { ...product, derived };
  }

  if (ireland.freshness.state !== "fresh") blockers.push("irish_price_recheck");
  if (shipping === null) blockers.push("shipping_quote_missing");

  if (ireland.freshness.state !== "fresh") {
    derived.status = "needs_local_recheck";
    derived.statusReason = "A cheaper Irish offer has been seen, but that local price must be rechecked before an imported saving can be published.";
    return { ...product, derived };
  }
  if (shipping === null) {
    derived.status = "needs_shipping_quote";
    derived.statusReason = "A product-price gap exists against the best fresh Irish reference, but Ireland delivery is not verified.";
    return { ...product, derived };
  }
  if (typeof dispatchInEu !== "boolean") {
    blockers.push("dispatch_evidence_missing");
    derived.status = "needs_dispatch_evidence";
    derived.statusReason = "The dispatch location must be verified before taxes and customs can be calculated.";
    return { ...product, derived };
  }

  const landed = calculateLandedCost({
    localIrelandPrice: local,
    sourcePrice: source,
    shipping,
    adminFee,
    insurance: product.insurance ?? 0,
    intrinsicValue: product.intrinsicValue ?? source,
    dispatchInEu,
    distinctLineItems: product.distinctLineItems ?? 1,
    vatRate: product.vatRate ?? 0.23,
    iossVatCollected: product.iossVatCollected ?? false,
    customsRate: product.customsRate ?? null,
  });
  if (landed.status !== "complete") {
    blockers.push("tax_evidence_missing");
    derived.status = "needs_tax_evidence";
    derived.statusReason = landed.reason;
    return { ...product, derived };
  }
  derived.landedCost = landed.landedCost;
  derived.savings = landed.savings;
  derived.savingsPercent = landed.savingsPercent;
  if (!landed.deal) {
    derived.status = "cheaper_in_ireland";
    derived.statusReason = "Once delivery and import costs are included, the best eligible Irish reference is cheaper or equal.";
    return { ...product, derived };
  }
  if (qualityStatus !== "verified") {
    blockers.push("quality_evidence_missing");
    derived.status = "needs_quality_evidence";
    derived.statusReason = "The landed cost is lower, but quality equivalence is not verified strongly enough to publish a deal.";
    return { ...product, derived };
  }
  derived.status = "verified_deal";
  derived.publishableDeal = true;
  derived.statusReason = "Fresh source and Irish price evidence, verified quality, dispatch location and full landed cost support this deal.";
  return { ...product, derived };
}

export function enrichCatalog(catalog, now = new Date()) {
  return {
    ...catalog,
    evaluatedAt: now.toISOString(),
    products: (catalog.products || []).map((product) => evaluateProduct(product, now)),
  };
}
