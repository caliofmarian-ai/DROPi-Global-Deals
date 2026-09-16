const list = (value) => Array.isArray(value) ? value : [];

function observationKey(item = {}) {
  if (item.id) return `id:${item.id}`;
  return [item.seller || item.label || "", item.url || item.evidenceUrl || "", item.variant || item.pack || ""].join("|");
}

function mergeObservedList(existing, incoming) {
  const map = new Map();
  for (const item of list(existing)) map.set(observationKey(item), item);
  for (const item of list(incoming)) map.set(observationKey(item), item);
  return [...map.values()];
}

export function mergeMarketObservations(catalog, observations = {}) {
  const patches = new Map(list(observations.products).map((item) => [item.productId, item]));
  const products = list(catalog?.products).map((product) => {
    const patch = patches.get(product.id);
    if (!patch) return product;
    return {
      ...product,
      ...(patch.patch || {}),
      irelandOffers: mergeObservedList(product.irelandOffers, patch.irelandOffers),
      sourceOffers: mergeObservedList(product.sourceOffers, patch.sourceOffers),
      benchmarks: mergeObservedList(product.benchmarks, patch.benchmarks),
    };
  });

  return {
    ...catalog,
    observationGeneratedAt: observations.generatedAt || null,
    products,
  };
}
