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

export function evaluateProduct(product, now = new Date()) {
  const freshness = priceFreshness(product.checkedAt, now, product.freshForDays ?? 7);
  const local = numericOrNull(product.irelandPrice);
  const source = numericOrNull(product.sourcePrice);
  const shipping = numericOrNull(product.shippingToIreland);
  const adminFee = numericOrNull(product.adminFee) ?? 0;
  const qualityStatus = product.qualityStatus ?? "research";
  const dispatchInEu = typeof product.dispatchInEu === "boolean" ? product.dispatchInEu : product.sourceInEu;

  const derived = {
    rawGap: null,
    rawGapPercent: null,
    landedCost: null,
    savings: null,
    savingsPercent: null,
    publishableDeal: false,
    freshness: freshness.state,
    priceAgeDays: freshness.ageDays,
    status: "research_queue",
    statusReason: "More pricing evidence is required.",
  };

  if (local !== null && source !== null) {
    derived.rawGap = roundMoney(local - source);
    derived.rawGapPercent = local > 0 ? roundMoney(((local - source) / local) * 100) : 0;
  }

  if (freshness.state === "stale" && local !== null && source !== null) {
    derived.status = "stale";
    derived.statusReason = `Price evidence is ${freshness.ageDays} days old and must be checked again.`;
    return { ...product, derived };
  }

  if (local === null || source === null) {
    derived.statusReason = product.researchReason || "Ireland and source prices are not both verified in EUR yet.";
    return { ...product, derived };
  }

  if (derived.rawGap <= 0) {
    derived.status = "cheaper_in_ireland";
    derived.statusReason = "The foreign product price does not beat the Irish reference price before delivery.";
    return { ...product, derived };
  }

  if (shipping === null) {
    derived.status = "needs_shipping_quote";
    derived.statusReason = "A product-price gap exists, but Ireland delivery is not verified.";
    return { ...product, derived };
  }

  if (typeof dispatchInEu !== "boolean") {
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
    derived.status = "needs_tax_evidence";
    derived.statusReason = landed.reason;
    return { ...product, derived };
  }

  derived.landedCost = landed.landedCost;
  derived.savings = landed.savings;
  derived.savingsPercent = landed.savingsPercent;

  if (!landed.deal) {
    derived.status = "cheaper_in_ireland";
    derived.statusReason = "Once delivery and import costs are included, buying in Ireland is cheaper or equal.";
    return { ...product, derived };
  }

  if (qualityStatus !== "verified") {
    derived.status = "needs_quality_evidence";
    derived.statusReason = "The landed cost is lower, but quality equivalence is not verified strongly enough to publish a deal.";
    return { ...product, derived };
  }

  derived.status = "verified_deal";
  derived.publishableDeal = true;
  derived.statusReason = "Fresh price evidence, verified quality, dispatch location and full landed cost support this deal.";
  return { ...product, derived };
}

export function enrichCatalog(catalog, now = new Date()) {
  return {
    ...catalog,
    evaluatedAt: now.toISOString(),
    products: (catalog.products || []).map((product) => evaluateProduct(product, now)),
  };
}
