const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const state = { products: [], researchCategories: [], fx: null };
const analytics = { enabled: false, consent: null, distinctId: null };

const statusLabels = {
  verified_deal: "VERIFIED DEAL",
  no_verified_import_win: "NO IMPORT WIN YET",
  needs_local_recheck: "RECHECK IRISH PRICE",
  needs_shipping_quote: "VERIFY DELIVERY",
  needs_quality_evidence: "NEEDS QUALITY EVIDENCE",
  needs_dispatch_evidence: "VERIFY DISPATCH",
  needs_tax_evidence: "VERIFY TAX / DUTY",
  stale: "STALE — RECHECK",
  cheaper_in_ireland: "CHEAPER IN IRELAND",
  research_queue: "RESEARCH QUEUE",
};
const routeLabels = {
  verified_route: "VERIFIED ROUTE",
  rejected_local_cheaper: "LOCAL CHEAPER",
  no_ireland_delivery: "NO IRELAND DELIVERY",
  needs_shipping_quote: "VERIFY DELIVERY",
  needs_local_recheck: "RECHECK IRELAND",
  needs_quality_evidence: "VERIFY QUALITY",
  needs_dispatch_evidence: "VERIFY DISPATCH",
  needs_tax_evidence: "VERIFY TAX",
  stale_source: "STALE SOURCE",
  unknown_source_freshness: "UNDATED SOURCE",
  needs_source_price: "PRICE NEEDED",
  excluded_out_of_stock: "OUT OF STOCK",
  excluded_not_comparable: "NOT COMPARABLE",
};
const statusOrder = { verified_deal:0, no_verified_import_win:1, needs_local_recheck:2, needs_shipping_quote:3, needs_quality_evidence:4, needs_dispatch_evidence:5, needs_tax_evidence:6, cheaper_in_ireland:7, research_queue:8, stale:9 };

const unique = (list) => [...new Set(list.filter(Boolean))].sort();
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
function safeUrl(value) { try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) ? u.href : null; } catch { return null; } }
function optionize(id, values, labelFn = (value) => value) { const el = document.querySelector(id); for (const value of values) el.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(value)}">${escapeHtml(labelFn(value))}</option>`); }
function eurApprox(amount, currency) { if (!state.fx || currency === "EUR") return null; const rate = Number(state.fx.rates?.[currency]); return Number.isFinite(rate) && rate > 0 ? amount / rate : null; }

function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch {} }
function anonymousId() {
  let id = storageGet("dropi_analytics_id");
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `dropi-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    storageSet("dropi_analytics_id", id);
  }
  return id;
}
async function sendAnalytics(event, properties = {}) {
  if (!analytics.enabled || analytics.consent !== "granted") return;
  try {
    await fetch("/api/analytics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ event, distinctId: analytics.distinctId, consent: true, properties }),
    });
  } catch {}
}
function closeConsentBanner() { document.querySelector("#analyticsConsent")?.remove(); }
function showConsentBanner() {
  if (document.querySelector("#analyticsConsent")) return;
  const box = document.createElement("aside");
  box.id = "analyticsConsent";
  box.className = "consent-banner";
  box.setAttribute("aria-label", "Analytics preference");
  box.innerHTML = `<div><strong>Help improve DROPi Global?</strong><p>Optional anonymous product analytics only. No session recording, advertising profiles, email, phone or address collection.</p></div><div class="consent-actions"><button type="button" class="button" data-consent="denied">No thanks</button><button type="button" class="button primary" data-consent="granted">Allow analytics</button></div>`;
  document.body.appendChild(box);
  box.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-consent]")?.dataset.consent;
    if (!choice) return;
    analytics.consent = choice;
    storageSet("dropi_analytics_consent", choice);
    closeConsentBanner();
    if (choice === "granted") sendAnalytics("analytics_consent_granted");
  });
}
async function initAnalytics() {
  try {
    const response = await fetch("/api/analytics/config");
    if (!response.ok) return;
    const config = await response.json();
    analytics.enabled = config.enabled === true;
    if (!analytics.enabled) return;
    analytics.distinctId = anonymousId();
    analytics.consent = storageGet("dropi_analytics_consent");
    if (analytics.consent !== "granted" && analytics.consent !== "denied") showConsentBanner();
  } catch {}
}

function sourceLink(url, label, product, sourceKind, seller = "") {
  const safe = safeUrl(url);
  if (!safe) return "";
  return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer" data-source-kind="${escapeHtml(sourceKind)}" data-product-id="${escapeHtml(product.id || "")}" data-seller="${escapeHtml(seller)}">${escapeHtml(label)}</a>`;
}
function evidenceLinks(product) {
  const entries = Object.values(product.evidence || {});
  const local = product.derived?.bestFreshIrelandOffer || product.derived?.comparisonIrelandOffer;
  if (local?.url) entries.unshift({ label:`Ireland: ${local.label}`, url:local.url, seller:local.seller });
  const links = entries.map((item) => sourceLink(item.url, item.label || "Source", product, "evidence", item.seller || item.label || "")).filter(Boolean);
  return links.length ? `<div class="evidence"><span>Evidence</span>${links.join("")}</div>` : "";
}
function benchmarkBlock(product) {
  if (!Array.isArray(product.benchmarks) || !product.benchmarks.length) return "";
  return `<div class="benchmarks">${product.benchmarks.map((item) => {
    const formatted = new Intl.NumberFormat("en-IE", { style:"currency", currency:item.currency }).format(item.amount);
    const approx = eurApprox(item.amount, item.currency);
    return `<div><span>${escapeHtml(item.market)}</span><b>${formatted}${item.pack ? ` / ${escapeHtml(item.pack)}` : ""}${approx != null ? ` <small>≈ ${money.format(approx)}</small>` : ""}</b>${sourceLink(item.url, "source", product, "benchmark", item.market)}</div>`;
  }).join("")}</div>`;
}
function routeBlock(product, routes = []) {
  if (!routes.length) return "";
  return `<div class="routes"><div class="routes-title">Import routes tested</div>${routes.map((route) => {
    const label = routeLabels[route.status] || route.status;
    const tone = route.status === "verified_route" ? "good" : route.status === "rejected_local_cheaper" ? "bad" : "neutral";
    const cost = route.landedCost != null ? `<b>${money.format(route.landedCost)} landed</b>` : route.productPrice != null ? `<b>${money.format(route.productPrice)} product</b>` : "";
    const shipping = route.shippingToIreland != null ? ` + ${money.format(route.shippingToIreland)} delivery` : "";
    const threshold = route.breakEvenShipping != null ? `<small>Break-even delivery: ${money.format(route.breakEvenShipping)}${route.shippingOverBreakEven > 0 ? ` · misses by ${money.format(route.shippingOverBreakEven)}` : ""}</small>` : "";
    const link = sourceLink(route.url || route.evidenceUrl, "route evidence", product, "route", route.seller);
    return `<div class="route-row"><div><span class="route-status ${tone}">${escapeHtml(label)}</span><strong>${escapeHtml(route.seller)}</strong></div><div class="route-cost">${cost}${shipping}${threshold}</div><p>${escapeHtml(route.reason)}</p>${link}</div>`;
  }).join("")}</div>`;
}
function card(product) {
  const d = product.derived || {};
  const label = statusLabels[d.status] || "RESEARCH";
  const pillClass = d.status === "verified_deal" ? "good" : d.status === "research_queue" || d.status === "stale" ? "neutral" : "warn";
  const gapText = d.rawGap == null ? "No publishable EUR comparison yet" : `${money.format(d.rawGap)} raw product-price gap before Ireland delivery`;
  const outcome = d.status === "verified_deal" ? `<p class="verified-saving">Verified landed saving ${money.format(d.savings)} (${d.savingsPercent}%)</p>` : `<p class="fineprint">${escapeHtml(d.statusReason || "More evidence required.")}</p>`;
  return `<article class="product-card ${d.publishableDeal ? "verified-card" : ""}" data-product-id="${escapeHtml(product.id || "")}"><div class="product-top"><span class="pill ${pillClass}">${escapeHtml(label)}</span><span>${escapeHtml(product.category)}</span></div><h3>${escapeHtml(product.name)}</h3><dl><div><dt>Origin</dt><dd>${escapeHtml(product.originCountry)}</dd></div><div><dt>Dispatch</dt><dd>${escapeHtml(product.dispatchCountry || product.shipsFrom)}</dd></div></dl><p class="gap">${gapText}</p>${d.comparisonIrelandPrice != null ? `<div class="prices"><span>Known Irish floor <b>${money.format(d.comparisonIrelandPrice)}</b><small>${escapeHtml(d.comparisonIrelandOffer?.seller || "Irish market")}</small></span>${d.bestFreshIrelandPrice != null ? `<span>Fresh Irish floor <b>${money.format(d.bestFreshIrelandPrice)}</b><small>${escapeHtml(d.bestFreshIrelandOffer?.seller || "fresh Irish reference")}</small></span>` : ""}</div>` : ""}${benchmarkBlock(product)}${routeBlock(product, d.sourceRoutes)}<p class="quality"><b>Quality check:</b> ${escapeHtml(product.qualityBasis)}</p><div class="freshness"><span>${d.freshIrelandOfferCount || 0} fresh Irish offer(s)</span><span>${(d.sourceRoutes || []).length} source route(s)</span></div>${outcome}${evidenceLinks(product)}</article>`;
}
function currentFilters() {
  return { category:document.querySelector("#category").value, origin:document.querySelector("#origin").value, status:document.querySelector("#status").value };
}
function renderProducts() {
  const { category, origin, status } = currentFilters();
  const filtered = state.products.filter((p) => (category === "all" || p.category === category) && (origin === "all" || p.originCountry === origin) && (status === "all" || p.derived?.status === status)).sort((a,b) => (statusOrder[a.derived?.status] ?? 99) - (statusOrder[b.derived?.status] ?? 99) || (b.derived?.rawGap ?? -Infinity) - (a.derived?.rawGap ?? -Infinity));
  document.querySelector("#products").innerHTML = filtered.map(card).join("") || "<p>No candidates match these filters.</p>";
}
function renderResearch() {
  const priorityOrder = { high:0, medium:1, low:2 };
  const categories = [...state.researchCategories].sort((a,b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
  document.querySelector("#researchCategories").innerHTML = categories.map((item) => `<article class="research-card"><div><span class="pill ${item.priority === "high" ? "good" : "neutral"}">${escapeHtml(item.priority.toUpperCase())}</span><span>${escapeHtml(item.fulfilment)}</span></div><h3>${escapeHtml(item.title)}</h3><p><b>Scan:</b> ${escapeHtml(item.sourceCountries.join(" · "))}</p><p><b>Quality gate:</b> ${escapeHtml(item.qualityRule)}</p></article>`).join("");
  document.querySelector("#researchCount").textContent = `${categories.length} category pipelines`;
}
async function loadData() {
  const [productsResponse, researchResponse, fxResponse] = await Promise.all([fetch("/api/products"), fetch("/api/research-categories"), fetch("/api/fx")]);
  if (!productsResponse.ok || !researchResponse.ok || !fxResponse.ok) throw new Error("Data request failed");
  const products = await productsResponse.json();
  const research = await researchResponse.json();
  state.fx = await fxResponse.json();
  state.products = products.products;
  state.researchCategories = research.categories;
  optionize("#category", unique(state.products.map((p) => p.category)));
  optionize("#origin", unique(state.products.map((p) => p.originCountry)));
  optionize("#status", unique(state.products.map((p) => p.derived?.status)), (value) => statusLabels[value] || value);
  document.querySelector("#fxNote").textContent = `ECB reference snapshot ${state.fx.date}. Rates are informational; payment-provider FX costs should be added when known.`;
  renderProducts();
  renderResearch();
}

document.querySelectorAll(".filters select").forEach((element) => element.addEventListener("change", () => {
  renderProducts();
  sendAnalytics("catalog_filter_changed", currentFilters());
}));

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-source-kind]");
  if (!link) return;
  sendAnalytics("source_link_clicked", { product_id:link.dataset.productId || "", seller:link.dataset.seller || "", source_kind:link.dataset.sourceKind || "" });
});

document.querySelector("#calculatorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const fd = new FormData(event.currentTarget);
  const customsRaw = fd.get("customsRate");
  const payload = { localIrelandUnitPrice:Number(fd.get("localIrelandUnitPrice")), sourceUnitPrice:Number(fd.get("sourceUnitPrice")), sourceCurrency:fd.get("sourceCurrency"), quantity:Number(fd.get("quantity")), shipping:Number(fd.get("shipping")), adminFee:Number(fd.get("adminFee")), dispatchInEu:fd.get("dispatchInEu") === "true", distinctLineItems:Number(fd.get("distinctLineItems")) || 1, vatRate:Number(fd.get("vatRate"))/100, customsRate:customsRaw === "" ? null : Number(customsRaw)/100, iossVatCollected:fd.get("iossVatCollected") === "on" };
  const response = await fetch("/api/basket", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload) });
  const result = await response.json();
  const box = document.querySelector("#calcResult");
  if (!response.ok) { box.innerHTML = `<b>More information needed</b><span>${escapeHtml(result.reason)}</span>`; return; }
  const tone = result.savings > 0 ? "good-text" : "bad-text";
  box.innerHTML = `<b>${result.quantity} units · landed ${money.format(result.landedCost)} total</b><span>Source ${money.format(result.sourceUnitEur)}/unit after FX · landed ${money.format(result.landedPerUnit)}/unit</span><strong class="${tone}">${result.savings > 0 ? `Basket saving ${money.format(result.savings)} (${result.savingsPercent}%)` : `Ireland cheaper by ${money.format(Math.abs(result.savings))}`}</strong>${result.breakEvenQuantity ? `<span>EU break-even quantity at this delivery cost: <b>${result.breakEvenQuantity}</b> · max delivery for ${result.quantity} units: ${money.format(result.maxShippingForQuantity)}</span>` : ""}`;
  sendAnalytics("basket_calculated", { source_currency:payload.sourceCurrency, quantity:payload.quantity, dispatch_in_eu:payload.dispatchInEu, saving_direction:result.savings > 0 ? "import" : "ireland" });
});

async function bootstrap() {
  await Promise.all([initAnalytics(), loadData()]);
  sendAnalytics("catalog_loaded", {
    publishable_deal_count:state.products.filter((p) => p.derived?.publishableDeal).length,
    candidate_count:state.products.filter((p) => !p.derived?.publishableDeal).length,
  });
}
bootstrap().catch((error) => {
  console.error(error);
  document.querySelector("#products").textContent = "Catalog temporarily unavailable.";
  document.querySelector("#researchCategories").textContent = "Research map temporarily unavailable.";
});
