const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const state = { products: [], researchCategories: [] };

const statusLabels = {
  verified_deal: "VERIFIED DEAL",
  needs_shipping_quote: "PRICE GAP — VERIFY DELIVERY",
  needs_quality_evidence: "NEEDS QUALITY EVIDENCE",
  needs_dispatch_evidence: "VERIFY DISPATCH",
  needs_tax_evidence: "VERIFY TAX / DUTY",
  stale: "STALE — RECHECK",
  cheaper_in_ireland: "CHEAPER IN IRELAND",
  research_queue: "RESEARCH QUEUE",
};

const statusOrder = {
  verified_deal: 0,
  needs_shipping_quote: 1,
  needs_quality_evidence: 2,
  needs_dispatch_evidence: 3,
  needs_tax_evidence: 4,
  cheaper_in_ireland: 5,
  research_queue: 6,
  stale: 7,
};

const unique = (list) => [...new Set(list.filter(Boolean))].sort();
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));
const formatDate = value => value ? new Intl.DateTimeFormat("en-IE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00Z`)) : "Not dated";

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function optionize(id, values, labelFn = value => value) {
  const el = document.querySelector(id);
  for (const value of values) el.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(value)}">${escapeHtml(labelFn(value))}</option>`);
}

function evidenceLinks(product) {
  const entries = Object.values(product.evidence || {});
  if (!entries.length) return "";
  const links = entries.map(item => {
    const url = safeUrl(item.url);
    return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label || "Source")}</a>` : "";
  }).filter(Boolean);
  return links.length ? `<div class="evidence"><span>Evidence</span>${links.join("")}</div>` : "";
}

function benchmarkBlock(product) {
  if (!Array.isArray(product.benchmarks) || !product.benchmarks.length) return "";
  return `<div class="benchmarks">${product.benchmarks.map(item => {
    const price = new Intl.NumberFormat("en-IE", { style: "currency", currency: item.currency }).format(item.amount);
    const url = safeUrl(item.url);
    return `<div><span>${escapeHtml(item.market)}</span><b>${price}${item.pack ? ` / ${escapeHtml(item.pack)}` : ""}</b>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">source</a>` : ""}</div>`;
  }).join("")}</div>`;
}

function card(product) {
  const d = product.derived || {};
  const label = statusLabels[d.status] || "RESEARCH";
  const pillClass = d.status === "verified_deal" ? "good" : d.status === "research_queue" || d.status === "stale" ? "neutral" : "warn";
  const gapText = d.rawGap == null ? "No publishable EUR comparison yet" : `${money.format(d.rawGap)} raw product-price gap before Ireland delivery`;
  const outcome = d.status === "verified_deal"
    ? `<p class="verified-saving">Verified landed saving ${money.format(d.savings)} (${d.savingsPercent}%)</p>`
    : `<p class="fineprint">${escapeHtml(d.statusReason || "More evidence required.")}</p>`;

  return `<article class="product-card ${d.publishableDeal ? "verified-card" : ""}">
    <div class="product-top"><span class="pill ${pillClass}">${escapeHtml(label)}</span><span>${escapeHtml(product.category)}</span></div>
    <h3>${escapeHtml(product.name)}</h3>
    <dl>
      <div><dt>Origin</dt><dd>${escapeHtml(product.originCountry)}</dd></div>
      <div><dt>Dispatch</dt><dd>${escapeHtml(product.dispatchCountry || product.shipsFrom)}</dd></div>
    </dl>
    <p class="gap">${gapText}</p>
    ${product.irelandPrice != null && product.sourcePrice != null ? `<div class="prices"><span>Ireland <b>${money.format(product.irelandPrice)}</b></span><span>Source <b>${money.format(product.sourcePrice)}</b></span></div>` : ""}
    ${benchmarkBlock(product)}
    <p class="quality"><b>Quality check:</b> ${escapeHtml(product.qualityBasis)}</p>
    <div class="freshness"><span>Checked ${escapeHtml(formatDate(product.checkedAt))}</span><span>${d.freshness === "fresh" ? "Fresh" : d.freshness === "stale" ? "Expired" : "Undated"}</span></div>
    ${outcome}
    ${evidenceLinks(product)}
  </article>`;
}

function renderProducts() {
  const category = document.querySelector("#category").value;
  const origin = document.querySelector("#origin").value;
  const status = document.querySelector("#status").value;
  const filtered = state.products
    .filter(p => (category === "all" || p.category === category) && (origin === "all" || p.originCountry === origin) && (status === "all" || p.derived?.status === status))
    .sort((a, b) => (statusOrder[a.derived?.status] ?? 99) - (statusOrder[b.derived?.status] ?? 99) || (b.derived?.rawGap ?? -Infinity) - (a.derived?.rawGap ?? -Infinity));
  document.querySelector("#products").innerHTML = filtered.map(card).join("") || "<p>No candidates match these filters.</p>";
}

function renderResearch() {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const categories = [...state.researchCategories].sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));
  document.querySelector("#researchCategories").innerHTML = categories.map(item => `<article class="research-card">
    <div><span class="pill ${item.priority === "high" ? "good" : "neutral"}">${escapeHtml(item.priority.toUpperCase())}</span><span>${escapeHtml(item.fulfilment)}</span></div>
    <h3>${escapeHtml(item.title)}</h3>
    <p><b>Scan:</b> ${escapeHtml(item.sourceCountries.join(" · "))}</p>
    <p><b>Quality gate:</b> ${escapeHtml(item.qualityRule)}</p>
  </article>`).join("");
  document.querySelector("#researchCount").textContent = `${categories.length} category pipelines`;
}

async function loadData() {
  const [productsResponse, researchResponse] = await Promise.all([fetch("/api/products"), fetch("/api/research-categories")]);
  if (!productsResponse.ok || !researchResponse.ok) throw new Error("Catalog request failed");
  const products = await productsResponse.json();
  const research = await researchResponse.json();
  state.products = products.products;
  state.researchCategories = research.categories;
  optionize("#category", unique(state.products.map(p => p.category)));
  optionize("#origin", unique(state.products.map(p => p.originCountry)));
  optionize("#status", unique(state.products.map(p => p.derived?.status)), value => statusLabels[value] || value);
  renderProducts();
  renderResearch();
}

document.querySelectorAll(".filters select").forEach(el => el.addEventListener("change", renderProducts));

document.querySelector("#calculatorForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const fd = new FormData(event.currentTarget);
  const customsRaw = fd.get("customsRate");
  const payload = {
    localIrelandPrice: Number(fd.get("localIrelandPrice")),
    sourcePrice: Number(fd.get("sourcePrice")),
    shipping: Number(fd.get("shipping")),
    intrinsicValue: Number(fd.get("intrinsicValue")),
    adminFee: Number(fd.get("adminFee")),
    dispatchInEu: fd.get("dispatchInEu") === "true",
    distinctLineItems: Number(fd.get("distinctLineItems")) || 1,
    vatRate: Number(fd.get("vatRate")) / 100,
    customsRate: customsRaw === "" ? null : Number(customsRaw) / 100,
    iossVatCollected: fd.get("iossVatCollected") === "on"
  };
  const response = await fetch("/api/calculate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json();
  const box = document.querySelector("#calcResult");
  if (!response.ok) {
    box.innerHTML = `<b>More information needed</b><span>${escapeHtml(result.reason)}</span>`;
    return;
  }
  const tone = result.savings > 0 ? "good-text" : "bad-text";
  box.innerHTML = `<b>Landed cost: ${money.format(result.landedCost)}</b><span>Customs ${money.format(result.customsDuty)} · Import VAT ${money.format(result.importVat)} · Fees ${money.format(result.adminFee)}</span><strong class="${tone}">${result.savings > 0 ? `Potential saving ${money.format(result.savings)} (${result.savingsPercent}%)` : `Ireland is cheaper by ${money.format(Math.abs(result.savings))}`}</strong>`;
});

loadData().catch(error => {
  console.error(error);
  document.querySelector("#products").textContent = "Catalog temporarily unavailable.";
  document.querySelector("#researchCategories").textContent = "Research map temporarily unavailable.";
});
