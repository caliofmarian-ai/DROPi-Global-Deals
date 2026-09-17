import { normalizeMarketCode, validateProviderOfferBatch } from "./provider-offers.mjs";

function text(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function explicitBoolean(value) {
  return typeof value === "boolean" ? value : null;
}

function upperCurrency(value) {
  const normalized = text(value)?.toUpperCase() ?? null;
  return normalized && /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function normalizeIdentifiers(offer = {}) {
  return {
    gtin: text(offer.gtin),
    ean: text(offer.ean),
    sku: text(offer.sku),
    model: text(offer.model),
    mpn: text(offer.mpn),
  };
}

function canonicalOffer(mapped, context, index) {
  const targetMarket = normalizeMarketCode(context.targetMarket);
  const shippingCost = finiteNumber(mapped.shippingCost ?? mapped.shippingToTarget ?? mapped.shippingToIreland);
  const shipsToTarget = explicitBoolean(mapped.shipsToTarget ?? mapped.shipsToIreland);
  const id = text(mapped.id) ?? `${context.provider.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}`;

  return {
    id,
    seller: text(mapped.seller ?? mapped.merchant ?? mapped.merchantName),
    label: text(mapped.label ?? mapped.name ?? mapped.productName),
    productName: text(mapped.productName ?? mapped.name ?? mapped.label),
    identifiers: normalizeIdentifiers(mapped),
    productPrice: finiteNumber(mapped.productPrice ?? mapped.price),
    currency: upperCurrency(mapped.currency),
    shippingCost,
    shippingToIreland: targetMarket === "IE" ? shippingCost : null,
    shipsToTarget,
    shipsToIreland: targetMarket === "IE" ? shipsToTarget : null,
    dispatchCountry: text(mapped.dispatchCountry),
    dispatchInEu: explicitBoolean(mapped.dispatchInEu),
    availability: text(mapped.availability) ?? "unknown",
    comparisonEligible: mapped.comparisonEligible === true,
    qualityStatus: text(mapped.qualityStatus) ?? "research",
    checkedAt: text(mapped.checkedAt ?? context.retrievedAt),
    observedAt: text(mapped.observedAt ?? context.retrievedAt),
    url: text(mapped.url ?? mapped.productUrl),
    evidenceUrl: text(mapped.evidenceUrl),
    provider: context.provider,
    providerAdapter: context.adapterName,
    providerOfferId: text(mapped.providerOfferId ?? mapped.id),
    providerMarket: context.responseMarket,
    requestedMarket: context.requestedMarket,
    targetMarket,
    providerRetrievedAt: context.retrievedAt,
    monetizationChannel: text(mapped.monetizationChannel) ?? "research_only",
    evidenceStatus: text(mapped.evidenceStatus) ?? "provider_research",
    providerPayload: mapped.providerPayload && typeof mapped.providerPayload === "object"
      ? mapped.providerPayload
      : null,
  };
}

export function adaptProviderOfferBatch(batch = {}, adapter) {
  const validation = validateProviderOfferBatch(batch);
  if (!validation.accepted) {
    return {
      ...validation,
      adapted: false,
      adapter: text(adapter?.name),
      normalizedOffers: [],
    };
  }

  if (!adapter || typeof adapter.mapOffer !== "function") {
    return {
      ...validation,
      accepted: false,
      adapted: false,
      status: "missing_adapter",
      reason: "A provider adapter with a mapOffer function is required.",
      adapter: text(adapter?.name),
      normalizedOffers: [],
    };
  }

  const adapterName = text(adapter.name) ?? "unnamed_adapter";
  const context = {
    provider: validation.provider,
    requestedMarket: validation.requestedMarket,
    responseMarket: validation.responseMarket,
    targetMarket: validation.targetMarket,
    retrievedAt: validation.retrievedAt,
    adapterName,
  };

  const normalizedOffers = validation.offers.map((offer, index) => {
    const mapped = adapter.mapOffer(offer, context, index);
    const safeMapped = mapped && typeof mapped === "object" ? mapped : {};
    return canonicalOffer(safeMapped, context, index);
  });

  return {
    ...validation,
    adapted: true,
    adapter: adapterName,
    normalizedOffers,
    status: "adapted",
    reason: `Accepted ${normalizedOffers.length} offer(s) through ${adapterName}.`,
  };
}

export function createResearchSnapshotAdapter({ name = "research_snapshot" } = {}) {
  return {
    name,
    mapOffer(offer) {
      const source = offer && typeof offer === "object" ? offer : {};
      return {
        ...source,
        comparisonEligible: false,
        qualityStatus: "research",
        monetizationChannel: "research_only",
        evidenceStatus: "provider_research",
        providerPayload: source,
      };
    },
  };
}

export function adaptResearchSnapshotBatch(batch = {}) {
  return adaptProviderOfferBatch(batch, createResearchSnapshotAdapter());
}
