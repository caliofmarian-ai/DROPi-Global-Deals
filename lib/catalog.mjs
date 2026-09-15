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

export function selectIrelandOffer(product, now = new Date()) {
  const offers = Array.isArray(product.irelandOffers) ? product.irelandOffers : [];
  const eligible = offers
    .map((offer) => ({ ...offer, numericPrice: numericOrNull(offer.price) }))
    .filter((offer) => offer.numericPrice !== null && offer.comparisonEligible !== false && offer.availability !== "out_of_stock")
    .sort((a, b) => a.numericPrice - b.numericPrice);

  if (eligible.length) {
    const best = eligible[0];
    const freshness = priceFreshness(best.checkedAt, now, best.freshForDays ?? product.freshForDays ?? 7);
    return {
      price: roundMoney(best.numericPrice),
      freshness,
      offer: {
        label: best.label || best.seller || "Irish retailer",
        seller: best.seller || best.label || "Irish retailer",
        url: best.url || null,
        checkedAt: best.checkedAt || null,
        availability: best.availability || "unknown",
      },
      eligibleCount: eligible.length,
    };
  }

  const legacyPrice = numericOrNull(product.irelandPrice);
  if (legacyPrice === null) return { price: null, freshness: { state: "unknown", ageDays: null }, offer: null, eligibleCount: 0 };
  return {
    price: roundMoney(legacyPrice),
    freshness: priceFreshness(product.irelandCheckedAt || product.checkedAt, now, product.freshForDays ?? 7),
    offer: product.evidence?.ireland ? {
      label: product.evidence.ireland.label || "Irish reference",
      seller: product.evidence.ireland.label || "Irish reference",
      url: product.evidence.ireland.url || null,
      checkedAt: product.irelandCheckedAt || product.checkedAt || null,
      availability: "unknown",
    } : null,
    eligibleCount: 0,
  };
}

export function evaluateProduct(product, now = new Date()) {
  const sourceFreshness = priceFreshness(product.sourceCheckedAt || product.checkedAt, now, product.freshForDays ?? 7);
  const ireland = selectIrelandOffer(product, now);
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
    eligibleIrelandOfferCount: ireland.eligibleCount,
    rawGap: null,
    rawGapPercent: null,
    landedCost: null,
    savings: null,
    savingsPercent: null,
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

  if (ireland.freshness.state !== "fresh") {
    blockers.push("irish_price_recheck");
  }
  if (shipping === null) {
    blockers.push("shipping_quote_missing");
  }

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
