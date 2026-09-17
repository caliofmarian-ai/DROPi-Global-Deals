const CHANNELS = new Set(["affiliate", "merchant_referral", "shopify"]);

function cleanText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function finiteMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sameText(a, b) {
  const left = cleanText(a)?.toLowerCase() ?? null;
  const right = cleanText(b)?.toLowerCase() ?? null;
  return left !== null && right !== null && left === right;
}

export function validateCommercialDestination(destination = {}, { targetVertical = null } = {}) {
  const id = cleanText(destination.id);
  const channel = cleanText(destination.channel)?.toLowerCase() ?? null;
  const sourceOfferId = cleanText(destination.sourceOfferId);
  const seller = cleanText(destination.seller);
  const url = cleanText(destination.url);
  const approvalStatus = cleanText(destination.approvalStatus)?.toLowerCase() ?? null;
  const disclosureText = cleanText(destination.disclosure?.text ?? destination.disclosureText);
  const disclosureRequired = destination.disclosure?.required === true || destination.disclosureRequired === true;

  const base = {
    id,
    channel,
    sourceOfferId,
    seller,
    url,
    enabled: destination.enabled === true,
    approvalStatus,
    disclosure: {
      required: disclosureRequired,
      text: disclosureText,
    },
    eligible: false,
    status: "blocked",
    reason: null,
    storeAssignment: destination.storeAssignment ?? null,
  };

  if (!id) return { ...base, status: "missing_id", reason: "Commercial destination id is required." };
  if (!CHANNELS.has(channel)) return { ...base, status: "invalid_channel", reason: "Unsupported or research-only monetization channel." };
  if (!sourceOfferId && !seller) return { ...base, status: "missing_offer_match", reason: "Destination must match a source offer id or seller." };
  if (destination.enabled !== true) return { ...base, status: "disabled", reason: "Commercial destination is disabled." };
  if (approvalStatus !== "approved") return { ...base, status: "not_approved", reason: "Commercial destination is not explicitly approved." };
  if (!url) return { ...base, status: "missing_url", reason: "Commercial destination URL is required." };
  if (!disclosureRequired || !disclosureText) {
    return { ...base, status: "missing_disclosure", reason: "Commercial disclosure metadata is required." };
  }

  if (channel === "shopify") {
    const assignment = destination.storeAssignment;
    const assignmentStatus = cleanText(assignment?.status)?.toLowerCase() ?? null;
    const assignmentVertical = cleanText(assignment?.vertical);
    const storeKey = cleanText(assignment?.storeKey);
    const expectedVertical = cleanText(targetVertical);

    if (assignmentStatus !== "assigned" || !assignmentVertical || !storeKey) {
      return { ...base, status: "shopify_store_unassigned", reason: "Shopify destination requires an explicitly assigned store." };
    }
    if (!expectedVertical) {
      return { ...base, status: "missing_target_vertical", reason: "Shopify routing requires an explicit target vertical." };
    }
    if (!sameText(assignmentVertical, expectedVertical)) {
      return { ...base, status: "shopify_vertical_mismatch", reason: "Assigned Shopify store does not belong to the target vertical." };
    }
  }

  return {
    ...base,
    eligible: true,
    status: "approved",
    reason: "Commercial destination is approved for routing.",
  };
}

function destinationMatchesRoute(destination, route) {
  if (destination.sourceOfferId && destination.sourceOfferId === route.id) return true;
  if (destination.seller && sameText(destination.seller, route.seller)) return true;
  return false;
}

function transactionFrom(destination) {
  return {
    destinationId: destination.id,
    channel: destination.channel,
    url: destination.url,
    disclosure: destination.disclosure,
  };
}

export function routeCommercialProduct(product = {}, registry = {}, { targetVertical = null } = {}) {
  const derived = product?.derived && typeof product.derived === "object" ? product.derived : {};
  const routes = Array.isArray(derived.sourceRoutes) ? derived.sourceRoutes : [];
  const destinations = Array.isArray(registry.destinations) ? registry.destinations : [];

  const result = {
    productId: cleanText(product.id),
    status: "not_publishable",
    reason: "Product is not a publishable verified deal.",
    selectedRoute: null,
    transaction: null,
    monetizableAlternatives: [],
    blockedDestinations: [],
    rankingBasis: "verified_landed_cost_then_route_order",
    commissionInfluencesRanking: false,
  };

  if (derived.publishableDeal !== true) return result;

  const verifiedRoutes = routes
    .map((route, index) => ({ route, index, landedCost: finiteMoney(route?.landedCost) }))
    .filter(({ route, landedCost }) => route?.status === "verified_route" && route?.publishableRoute === true && landedCost !== null)
    .sort((a, b) => a.landedCost - b.landedCost || a.index - b.index);

  if (!verifiedRoutes.length) {
    return { ...result, status: "no_verified_routes", reason: "Publishable deal has no verified source route available for commerce routing." };
  }

  const validated = destinations.map((destination, index) => ({
    index,
    normalized: validateCommercialDestination(destination, { targetVertical }),
  }));

  const blockedDestinations = validated
    .filter(({ normalized }) => !normalized.eligible)
    .map(({ normalized }) => ({ id: normalized.id, status: normalized.status, reason: normalized.reason }));

  const commercialByRoute = verifiedRoutes.map(({ route, index, landedCost }) => {
    const matches = validated
      .filter(({ normalized }) => normalized.eligible && destinationMatchesRoute(normalized, route))
      .sort((a, b) => a.index - b.index);
    return { route, routeIndex: index, landedCost, destination: matches[0]?.normalized ?? null };
  });

  const selected = commercialByRoute[0];
  const monetizableAlternatives = commercialByRoute
    .slice(1)
    .filter(entry => entry.destination)
    .map(entry => ({ route: entry.route, transaction: transactionFrom(entry.destination) }));

  if (selected.destination) {
    return {
      ...result,
      status: "monetized_verified_route",
      reason: "The best verified route also has an approved commercial destination.",
      selectedRoute: selected.route,
      transaction: transactionFrom(selected.destination),
      monetizableAlternatives,
      blockedDestinations,
    };
  }

  return {
    ...result,
    status: monetizableAlternatives.length ? "best_route_not_monetizable" : "verified_no_monetization",
    reason: monetizableAlternatives.length
      ? "The best verified route has no approved commercial destination; more expensive monetizable routes are exposed only as alternatives."
      : "The best verified route is valid for comparison but has no approved commercial destination.",
    selectedRoute: selected.route,
    transaction: null,
    monetizableAlternatives,
    blockedDestinations,
  };
}
