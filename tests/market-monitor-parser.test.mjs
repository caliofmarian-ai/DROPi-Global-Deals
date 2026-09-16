import test from "node:test";
import assert from "node:assert/strict";
import { applyPriceTransform, extractSourceSnapshot } from "../lib/market-monitor-parser.mjs";

test("extracts product price and availability from JSON-LD when identity markers match", () => {
  const html = `<!doctype html><html><body><h1>Shimano CN-HG701 116 links</h1>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Shimano CN-HG701 116 links","sku":"CNHG701116Q","offers":{"@type":"Offer","price":"25.17","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}</script></body></html>`;
  const result = extractSourceSnapshot(html, { adapter:"jsonld_or_meta", identityMarkers:["CN-HG701","116"], currency:"EUR" });
  assert.equal(result.ok, true);
  assert.equal(result.price, 25.17);
  assert.equal(result.availability, "in_stock");
  assert.equal(result.currency, "EUR");
});

test("exact variant text price can override a generic/default JSON-LD offer", () => {
  const html = `<!doctype html><html><body><h1>Shimano Ultegra CS-R8000 11-speed Cassette</h1>
    <div>11-28 11S 77,99 €</div><div>11-30 11S 49,99 €</div><div>11-32 11S 65,99 €</div>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Shimano Ultegra CS-R8000","offers":{"@type":"Offer","price":"77.99","priceCurrency":"EUR"}}</script>
  </body></html>`;
  const result = extractSourceSnapshot(html, {
    adapter:"jsonld_or_meta",
    identityMarkers:["CS-R8000","11-30"],
    priceRegex:"11-30 11S[\\s\\S]{0,40}?([0-9]+[.,][0-9]{2})\\s*€",
    preferPriceRegex:true,
    currency:"EUR",
  });
  assert.equal(result.ok, true);
  assert.equal(result.price, 49.99);
});

test("identity mismatch blocks a price from being accepted", () => {
  const html = `<html><body><h1>Shimano different chain</h1><meta itemprop="price" content="10.00"></body></html>`;
  const result = extractSourceSnapshot(html, { adapter:"jsonld_or_meta", identityMarkers:["CN-HG701","116"], currency:"EUR" });
  assert.equal(result.ok, false);
  assert.equal(result.monitorStatus, "identity_mismatch");
});

test("shipping parser understands comma decimal prices", () => {
  const html = `<html><body><h2>Ireland</h2><table><tr><td>Gear only</td><td>9,95 €</td></tr></table></body></html>`;
  const result = extractSourceSnapshot(html, {
    adapter:"shipping_text",
    anchorText:"Ireland",
    priceRegex:"Gear only[\\s\\S]{0,100}?([0-9]+[.,][0-9]{2})\\s*€",
    currency:"EUR",
  });
  assert.equal(result.ok, true);
  assert.equal(result.shippingToIreland, 9.95);
});

test("VAT normalization converts source VAT to destination VAT", () => {
  assert.equal(applyPriceTransform(48.25, { sourceVatRate:0.19, destinationVatRate:0.23 }), 49.87);
});

test("missing price never silently becomes zero", () => {
  const html = `<html><body>KNIPEX 86 03 250 4003773033837</body></html>`;
  const result = extractSourceSnapshot(html, { adapter:"jsonld_or_meta", identityMarkers:["86 03 250","4003773033837"], currency:"EUR" });
  assert.equal(result.ok, false);
  assert.equal(result.monitorStatus, "price_missing");
});
