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

function mergeProduct(base = {}, incoming = {}) {
  return {
    ...base,
    ...incoming,
    irelandOffers: mergeObservedList(base.irelandOffers, incoming.irelandOffers),
    sourceOffers: mergeObservedList(base.sourceOffers, incoming.sourceOffers),
    benchmarks: mergeObservedList(base.benchmarks, incoming.benchmarks),
  };
}

export function mergeMarketObservations(catalog, observations = {}) {
  const productMap = new Map();
  for (const product of list(catalog?.products)) {
    if (!product?.id) continue;
    productMap.set(product.id, product);
  }

  for (const discovered of list(observations.discoveredProducts)) {
    if (!discovered?.id) continue;
    productMap.set(discovered.id, mergeProduct(productMap.get(discovered.id), discovered));
  }

  const patches = new Map(list(observations.products).map((item) => [item.productId, item]));
  const products = [...productMap.values()].map((product) => {
    const patch = patches.get(product.id);
    if (!patch) return product;
    return mergeProduct(product, {
      ...(patch.patch || {}),
      irelandOffers: patch.irelandOffers,
      sourceOffers: patch.sourceOffers,
      benchmarks: patch.benchmarks,
    });
  });

  return {
    ...catalog,
    observationGeneratedAt: observations.generatedAt || null,
    discoveredProductCount: list(observations.discoveredProducts).length,
    products,
  };
}
