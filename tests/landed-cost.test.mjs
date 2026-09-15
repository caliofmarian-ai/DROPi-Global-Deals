import test from "node:test";
import assert from "node:assert/strict";
import { calculateLandedCost } from "../lib/landed-cost.mjs";

test("EU shipment has no import customs or import VAT added by the engine", () => {
  const result = calculateLandedCost({ sourcePrice: 30, shipping: 7, sourceInEu: true, localIrelandPrice: 50 });
  assert.equal(result.landedCost, 37);
  assert.equal(result.customsDuty, 0);
  assert.equal(result.importVat, 0);
  assert.equal(result.savings, 13);
});

test("non-EU <= €150 adds €3 per distinct line item and VAT when IOSS is not used", () => {
  const result = calculateLandedCost({ sourcePrice: 100, shipping: 10, sourceInEu: false, distinctLineItems: 1, vatRate: 0.23 });
  assert.equal(result.customsDuty, 3);
  assert.equal(result.importVat, 25.99);
  assert.equal(result.landedCost, 138.99);
});

test("IOSS flag prevents double-adding import VAT for low-value consignments", () => {
  const result = calculateLandedCost({ sourcePrice: 100, shipping: 10, sourceInEu: false, distinctLineItems: 1, iossVatCollected: true });
  assert.equal(result.customsDuty, 3);
  assert.equal(result.importVat, 0);
  assert.equal(result.landedCost, 113);
});

test("over €150 requires a customs rate", () => {
  const result = calculateLandedCost({ sourcePrice: 301, shipping: 33, sourceInEu: false });
  assert.equal(result.status, "incomplete");
});

test("Revenue-style >€150 zero-duty example computes VAT before admin fee", () => {
  const result = calculateLandedCost({ sourcePrice: 301, shipping: 33, adminFee: 10, sourceInEu: false, customsRate: 0, vatRate: 0.23 });
  assert.equal(result.importVat, 76.82);
  assert.equal(result.landedCost, 420.82);
});
