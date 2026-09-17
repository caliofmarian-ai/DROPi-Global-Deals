const MARKET_CODE = /^[A-Z]{2}$/;

function normalizedString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeMarketCode(value) {
  const normalized = normalizedString(value)?.toUpperCase() ?? null;
  return normalized && MARKET_CODE.test(normalized) ? normalized : null;
}

export function validateProviderOfferBatch({
  provider,
  requestedMarket,
  responseMarket,
  targetMarket,
  retrievedAt = null,
  offers = [],
} = {}) {
  const normalizedProvider = normalizedString(provider);
  const requested = normalizeMarketCode(requestedMarket);
  const response = normalizeMarketCode(responseMarket);
  const target = normalizeMarketCode(targetMarket);
  const inputOffers = Array.isArray(offers) ? offers : [];

  const result = {
    provider: normalizedProvider,
    requestedMarket: requested,
    responseMarket: response,
    targetMarket: target,
    retrievedAt: normalizedString(retrievedAt),
    accepted: false,
    status: "rejected",
    reason: null,
    offers: [],
    receivedOfferCount: inputOffers.length,
  };

  if (!normalizedProvider) {
    return { ...result, status: "missing_provider", reason: "Provider identity is required before offer ingestion." };
  }
  if (!requested) {
    return { ...result, status: "missing_requested_market", reason: "The market requested from the provider is missing or invalid." };
  }
  if (!response) {
    return { ...result, status: "missing_response_market", reason: "The provider response market is missing or invalid." };
  }
  if (!target) {
    return { ...result, status: "missing_target_market", reason: "The final customer target market is missing or invalid." };
  }
  if (requested !== response) {
    return {
      ...result,
      status: "provider_market_mismatch",
      reason: `Provider responded for ${response} after DROPi requested ${requested}.`,
    };
  }

  return {
    ...result,
    accepted: true,
    status: "accepted",
    reason: "Provider response market matches the explicitly requested market.",
    offers: inputOffers.map((offer) => ({
      ...(offer && typeof offer === "object" ? offer : {}),
      provider: normalizedProvider,
      providerMarket: response,
      requestedMarket: requested,
      targetMarket: target,
      providerRetrievedAt: normalizedString(retrievedAt),
    })),
  };
}
