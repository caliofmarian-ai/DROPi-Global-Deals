const numericOrNull = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function guardOffer(product) {
  const guards = (Array.isArray(product.irelandOffers) ? product.irelandOffers : [])
    .filter((offer) => offer.guardPositiveVerdict === true && offer.availability !== "out_of_stock")
    .map((offer) => ({ ...offer, numericPrice: numericOrNull(offer.price) }))
    .filter((offer) => offer.numericPrice !== null)
    .sort((a, b) => a.numericPrice - b.numericPrice);
  return guards[0] || null;
}

function publicGuard(offer) {
  if (!offer) return null;
  return {
    seller: offer.seller || offer.label || "Irish market guard",
    label: offer.label || offer.seller || "Irish market guard",
    price: roundMoney(offer.numericPrice),
    url: offer.url || null,
    observedAt: offer.observedAt || null,
    checkedAt: offer.checkedAt || null,
    reason: offer.guardReason || offer.note || "A lower potentially comparable Irish price must be resolved before a positive import verdict is published.",
  };
}

export function applyLocalMarketGuards(catalog) {
  return {
    ...catalog,
    products: (catalog.products || []).map((product) => {
      const guard = guardOffer(product);
      const derived = product.derived;
      if (!guard || !derived) return product;

      const routeCost = numericOrNull(derived.landedCost ?? derived.bestCompleteSourceRoute?.landedCost);
      if (routeCost === null || guard.numericPrice > routeCost) {
        return { ...product, derived: { ...derived, localMarketGuard: publicGuard(guard) } };
      }

      const guardedRoutes = (derived.sourceRoutes || []).map((route) => {
        if (route.status !== "verified_route" || numericOrNull(route.landedCost) === null || route.landedCost < guard.numericPrice) return route;
        return {
          ...route,
          status: "needs_local_recheck",
          publishableRoute: false,
          reason: `A potentially comparable Irish offer from ${guard.seller || guard.label || "another retailer"} is listed at €${roundMoney(guard.numericPrice).toFixed(2)} and must be variant-checked before this route can be published.`,
        };
      });

      if (!derived.publishableDeal) {
        return { ...product, derived: { ...derived, sourceRoutes: guardedRoutes, localMarketGuard: publicGuard(guard) } };
      }

      return {
        ...product,
        derived: {
          ...derived,
          candidateLandedCost: derived.landedCost,
          candidateSavings: derived.savings,
          candidateSavingsPercent: derived.savingsPercent,
          landedCost: routeCost,
          savings: null,
          savingsPercent: null,
          publishableDeal: false,
          status: "needs_local_recheck",
          blockers: [...new Set([...(derived.blockers || []), "ambiguous_local_price_guard"])],
          statusReason: `A potentially comparable Irish offer from ${guard.seller || guard.label || "another retailer"} is listed at €${roundMoney(guard.numericPrice).toFixed(2)}, below the €${roundMoney(routeCost).toFixed(2)} candidate landed cost. The exact variant must be confirmed before publishing a positive import verdict.`,
          sourceRoutes: guardedRoutes,
          localMarketGuard: publicGuard(guard),
        },
      };
    }),
  };
}
