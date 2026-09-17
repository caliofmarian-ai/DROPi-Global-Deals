import { routeCommercialProduct } from "./commerce-routing.mjs";

function cleanText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function commerceViewForProduct(catalog = {}, registry = {}, { productId = null, targetVertical = null } = {}) {
  const id = cleanText(productId);
  const vertical = cleanText(targetVertical);

  if (!id || id.length > 160) {
    return {
      status: "invalid_request",
      httpStatus: 400,
      reason: "Valid productId is required.",
      productId: id,
    };
  }
  if (vertical && vertical.length > 160) {
    return {
      status: "invalid_request",
      httpStatus: 400,
      reason: "targetVertical is too long.",
      productId: id,
    };
  }

  const products = Array.isArray(catalog.products) ? catalog.products : [];
  const product = products.find(item => cleanText(item?.id) === id) ?? null;
  if (!product) {
    return {
      status: "not_found",
      httpStatus: 404,
      reason: "Product was not found in the evaluated catalog.",
      productId: id,
    };
  }

  const commerce = routeCommercialProduct(product, registry, { targetVertical: vertical });
  return {
    status: "ok",
    httpStatus: 200,
    product: {
      id: cleanText(product.id),
      name: cleanText(product.name),
      category: cleanText(product.category),
      evaluationStatus: cleanText(product.derived?.status),
      publishableDeal: product.derived?.publishableDeal === true,
    },
    registry: {
      version: registry?.version ?? null,
      generatedAt: registry?.generatedAt ?? null,
      destinationCount: Array.isArray(registry?.destinations) ? registry.destinations.length : 0,
    },
    targetVertical: vertical,
    commerce,
  };
}
