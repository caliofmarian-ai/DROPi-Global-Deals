const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });
const state = { products: [] };

const unique = (list) => [...new Set(list.filter(Boolean))].sort();
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[c]));

function optionize(id, values) {
  const el = document.querySelector(id);
  for (const value of values) el.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
}

function rawGap(product) {
  if (product.irelandPrice == null || product.sourcePrice == null) return null;
  return Math.round((product.irelandPrice - product.sourcePrice) * 100) / 100;
}

function card(product) {
  const gap = rawGap(product);
  const status = product.status === "needs_shipping_quote" ? "PRICE GAP — VERIFY DELIVERY" : "RESEARCH QUEUE";
  const gapText = gap == null ? "No publishable comparison yet" : `${money.format(gap)} product-price gap before Ireland delivery`;
  return `<article class="product-card">
    <div class="product-top"><span class="pill ${product.status === "needs_shipping_quote" ? "warn" : "neutral"}">${status}</span><span>${escapeHtml(product.category)}</span></div>
    <h3>${escapeHtml(product.name)}</h3>
    <dl><div><dt>Origin</dt><dd>${escapeHtml(product.originCountry)}</dd></div><div><dt>Ships from</dt><dd>${escapeHtml(product.shipsFrom)}</dd></div></dl>
    <p class="gap">${gapText}</p>
    ${product.irelandPrice != null ? `<div class="prices"><span>Ireland <b>${money.format(product.irelandPrice)}</b></span><span>Source <b>${money.format(product.sourcePrice)}</b></span></div>` : ""}
    <p class="quality"><b>Quality check:</b> ${escapeHtml(product.qualityBasis)}</p>
    <p class="fineprint">DROPi will not call this a saving until delivery, taxes and fees are known.</p>
  </article>`;
}

function render() {
  const category = document.querySelector("#category").value;
  const origin = document.querySelector("#origin").value;
  const status = document.querySelector("#status").value;
  const filtered = state.products.filter(p => (category === "all" || p.category === category) && (origin === "all" || p.originCountry === origin) && (status === "all" || p.status === status));
  document.querySelector("#products").innerHTML = filtered.map(card).join("") || "<p>No candidates match these filters.</p>";
}

async function loadProducts() {
  const response = await fetch("/api/products");
  const data = await response.json();
  state.products = data.products;
  optionize("#category", unique(state.products.map(p => p.category)));
  optionize("#origin", unique(state.products.map(p => p.originCountry)));
  render();
}

document.querySelectorAll(".filters select").forEach(el => el.addEventListener("change", render));

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
    sourceInEu: fd.get("sourceInEu") === "true",
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

loadProducts().catch(error => {
  console.error(error);
  document.querySelector("#products").textContent = "Catalog temporarily unavailable.";
});
