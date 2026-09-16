const list = (value) => Array.isArray(value) ? value : [];

export function selectDeals(catalog = {}) {
  return list(catalog.products).filter((product) => product?.derived?.publishableDeal === true);
}

export function selectCandidates(catalog = {}) {
  return list(catalog.products).filter((product) => product?.derived?.publishableDeal !== true);
}

export function summarizeCatalog(catalog = {}) {
  const products = list(catalog.products);
  const statusCounts = {};
  for (const product of products) {
    const status = product?.derived?.status || "unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  const deals = selectDeals(catalog);
  const candidates = selectCandidates(catalog);
  return {
    generatedAt: catalog.generatedAt || null,
    observationGeneratedAt: catalog.observationGeneratedAt || null,
    productCount: products.length,
    publishableDealCount: deals.length,
    candidateCount: candidates.length,
    statusCounts,
  };
}

export function dealFeed(catalog = {}) {
  return {
    ...summarizeCatalog(catalog),
    deals: selectDeals(catalog),
  };
}

export function candidateFeed(catalog = {}) {
  return {
    ...summarizeCatalog(catalog),
    candidates: selectCandidates(catalog),
  };
}
