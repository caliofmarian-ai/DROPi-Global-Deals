import { calculateLandedCost } from "./landed-cost.mjs";
import { toEur } from "./fx.mjs";

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function calculateBasketEconomics(input, fxSnapshot) {
  const quantity = Number(input.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1) return { status: "incomplete", reason: "Quantity must be a positive whole number" };
  const localUnit = Number(input.localIrelandUnitPrice);
  if (!Number.isFinite(localUnit) || localUnit < 0) return { status: "incomplete", reason: "Invalid Irish unit price" };
  const converted = toEur(input.sourceUnitPrice, input.sourceCurrency || "EUR", fxSnapshot);
  if (converted.status !== "complete") return converted;

  const sourceUnitEur = converted.amountEur;
  const localBasketPrice = roundMoney(localUnit * quantity);
  const sourceBasketPrice = roundMoney(sourceUnitEur * quantity);
  const shipping = Number(input.shipping ?? 0);
  const adminFee = Number(input.adminFee ?? 0);
  const insurance = Number(input.insurance ?? 0);
  const dispatchInEu = input.dispatchInEu;

  const landed = calculateLandedCost({
    localIrelandPrice: localBasketPrice,
    sourcePrice: sourceBasketPrice,
    shipping,
    adminFee,
    insurance,
    intrinsicValue: input.intrinsicValue ?? sourceBasketPrice,
    dispatchInEu,
    distinctLineItems: input.distinctLineItems ?? 1,
    vatRate: input.vatRate ?? 0.23,
    iossVatCollected: input.iossVatCollected ?? false,
    customsRate: input.customsRate ?? null,
  });
  if (landed.status !== "complete") return landed;

  let breakEvenQuantity = null;
  let maxShippingForQuantity = null;
  if (dispatchInEu === true && localUnit > sourceUnitEur) {
    const fixedNonShipping = Math.max(0, adminFee) + Math.max(0, insurance);
    const unitGap = localUnit - sourceUnitEur;
    breakEvenQuantity = Math.floor((Math.max(0, shipping) + fixedNonShipping) / unitGap) + 1;
    maxShippingForQuantity = roundMoney(Math.max(0, (unitGap * quantity) - fixedNonShipping));
  }

  return {
    ...landed,
    quantity,
    sourceCurrency: converted.currency,
    fxRate: converted.rate,
    fxRateDate: converted.rateDate || fxSnapshot?.date || null,
    sourceUnitOriginal: roundMoney(Number(input.sourceUnitPrice)),
    sourceUnitEur,
    localIrelandUnitPrice: roundMoney(localUnit),
    localBasketPrice,
    sourceBasketPrice,
    landedPerUnit: roundMoney(landed.landedCost / quantity),
    savingsPerUnit: roundMoney(landed.savings / quantity),
    breakEvenQuantity,
    maxShippingForQuantity,
  };
}
