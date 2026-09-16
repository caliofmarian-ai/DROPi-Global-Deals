const numberFromText = (value) => {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.+-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const decodeEntities = (value = "") => String(value)
  .replace(/&nbsp;/gi, " ")
  .replace(/&euro;/gi, "€")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

export function htmlToText(html = "") {
  return decodeEntities(String(html)
    .replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function flattenJsonLd(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, out);
    return out;
  }
  if (!value || typeof value !== "object") return out;
  out.push(value);
  if (Array.isArray(value["@graph"])) flattenJsonLd(value["@graph"], out);
  return out;
}

export function extractJsonLd(html = "") {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(String(html)))) {
    const raw = decodeEntities(match[1]).trim();
    if (!raw) continue;
    try {
      flattenJsonLd(JSON.parse(raw), blocks);
    } catch {
      // Broken retailer JSON-LD must not abort the whole monitor run.
    }
  }
  return blocks;
}

function typeIncludes(value, typeName) {
  const values = Array.isArray(value) ? value : [value];
  return values.some((item) => String(item || "").toLowerCase() === typeName.toLowerCase());
}

function markerScore(node, markers = []) {
  if (!markers.length) return 0;
  const haystack = JSON.stringify(node).toLowerCase();
  return markers.reduce((score, marker) => score + (haystack.includes(String(marker).toLowerCase()) ? 1 : 0), 0);
}

function firstOffer(product) {
  const offers = Array.isArray(product?.offers) ? product.offers : product?.offers ? [product.offers] : [];
  const normalized = offers.flatMap((offer) => Array.isArray(offer) ? offer : [offer]).filter(Boolean);
  normalized.sort((a, b) => {
    const aPrice = numberFromText(a.price ?? a.lowPrice ?? a.priceSpecification?.price);
    const bPrice = numberFromText(b.price ?? b.lowPrice ?? b.priceSpecification?.price);
    if (aPrice === null) return 1;
    if (bPrice === null) return -1;
    return aPrice - bPrice;
  });
  return normalized[0] || null;
}

function normalizeAvailability(value) {
  const text = String(value || "").toLowerCase();
  if (!text) return "unknown";
  if (text.includes("outofstock") || text.includes("out_of_stock") || text.includes("sold out")) return "out_of_stock";
  if (text.includes("instock") || text.includes("in_stock") || text.includes("available")) return "in_stock";
  if (text.includes("preorder") || text.includes("pre-order")) return "preorder";
  if (text.includes("limited")) return "limited";
  return "unknown";
}

function metaContent(html, patterns) {
  for (const pattern of patterns) {
    const match = String(html).match(pattern);
    if (match?.[1]) return decodeEntities(match[1]);
  }
  return null;
}

function productSnapshot(html, source) {
  const text = htmlToText(html);
  const allLower = `${String(html).toLowerCase()} ${text.toLowerCase()}`;
  const markers = Array.isArray(source.identityMarkers) ? source.identityMarkers : [];
  const missingMarkers = markers.filter((marker) => !allLower.includes(String(marker).toLowerCase()));
  if (missingMarkers.length) {
    return {
      ok: false,
      monitorStatus: "identity_mismatch",
      identityStatus: "mismatch",
      error: `Missing identity marker(s): ${missingMarkers.join(", ")}`,
    };
  }

  const productNodes = extractJsonLd(html)
    .filter((node) => typeIncludes(node["@type"], "Product"))
    .sort((a, b) => markerScore(b, markers) - markerScore(a, markers));
  const product = productNodes[0] || null;
  const offer = firstOffer(product);

  let rawPrice = numberFromText(offer?.price ?? offer?.lowPrice ?? offer?.priceSpecification?.price);
  let currency = offer?.priceCurrency || product?.offers?.priceCurrency || source.currency || null;
  let availability = normalizeAvailability(offer?.availability);

  if (rawPrice === null) {
    rawPrice = numberFromText(metaContent(html, [
      /<meta[^>]+(?:property|name|itemprop)=["'](?:product:price:amount|price)["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["'](?:product:price:amount|price)["']/i,
    ]));
  }
  if (!currency) {
    currency = metaContent(html, [
      /<meta[^>]+(?:property|name|itemprop)=["'](?:product:price:currency|priceCurrency)["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["'](?:product:price:currency|priceCurrency)["']/i,
    ]) || source.currency || null;
  }
  if (availability === "unknown") {
    const metaAvailability = metaContent(html, [
      /<meta[^>]+(?:property|name|itemprop)=["'](?:product:availability|availability)["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["'](?:product:availability|availability)["']/i,
    ]);
    availability = normalizeAvailability(metaAvailability || text);
  }
  if (rawPrice === null && source.priceRegex) {
    const match = text.match(new RegExp(source.priceRegex, "i"));
    rawPrice = numberFromText(match?.[1]);
  }
  if (rawPrice === null) {
    return {
      ok: false,
      monitorStatus: "price_missing",
      identityStatus: "verified",
      availability,
      currency,
      error: "No trustworthy price could be extracted from this page.",
    };
  }

  const normalizedPrice = applyPriceTransform(rawPrice, source.priceTransform);
  return {
    ok: true,
    monitorStatus: "ok",
    identityStatus: "verified",
    rawPrice,
    price: normalizedPrice,
    currency: currency || source.currency || "EUR",
    availability,
    identifiers: {
      sku: product?.sku || null,
      mpn: product?.mpn || product?.model || null,
      gtin: product?.gtin13 || product?.gtin14 || product?.gtin12 || product?.gtin || null,
    },
  };
}

function shippingSnapshot(html, source) {
  const text = htmlToText(html);
  const anchor = String(source.anchorText || "").toLowerCase();
  if (anchor && !text.toLowerCase().includes(anchor)) {
    return { ok: false, monitorStatus: "identity_mismatch", identityStatus: "mismatch", error: `Shipping anchor '${source.anchorText}' not found.` };
  }
  if (!source.priceRegex) {
    return { ok: false, monitorStatus: "parser_config_error", identityStatus: "verified", error: "Shipping monitor has no priceRegex." };
  }
  const match = text.match(new RegExp(source.priceRegex, "i"));
  const shipping = numberFromText(match?.[1]);
  if (shipping === null) {
    return { ok: false, monitorStatus: "price_missing", identityStatus: "verified", error: "Ireland shipping price was not found." };
  }
  return {
    ok: true,
    monitorStatus: "ok",
    identityStatus: "verified",
    shippingToIreland: shipping,
    currency: source.currency || "EUR",
    availability: "n/a",
  };
}

export function applyPriceTransform(price, transform) {
  const numeric = numberFromText(price);
  if (numeric === null) return null;
  if (!transform) return Math.round(numeric * 100) / 100;
  let value = numeric;
  const sourceVat = Number(transform.sourceVatRate);
  const destinationVat = Number(transform.destinationVatRate);
  if (Number.isFinite(sourceVat) && sourceVat >= 0 && Number.isFinite(destinationVat) && destinationVat >= 0) {
    value = value / (1 + sourceVat) * (1 + destinationVat);
  }
  if (Number.isFinite(Number(transform.multiplier))) value *= Number(transform.multiplier);
  if (Number.isFinite(Number(transform.add))) value += Number(transform.add);
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function extractSourceSnapshot(html, source) {
  if (!source || !source.adapter) throw new Error("Source adapter is required");
  if (source.adapter === "shipping_text") return shippingSnapshot(html, source);
  if (source.adapter === "jsonld_or_meta") return productSnapshot(html, source);
  throw new Error(`Unsupported source adapter: ${source.adapter}`);
}
