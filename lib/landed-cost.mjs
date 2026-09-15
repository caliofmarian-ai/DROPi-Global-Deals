const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function calculateLandedCost(input) {
  const {
    sourcePrice,
    shipping,
    insurance = 0,
    adminFee = 0,
    sourceInEu,
    intrinsicValue = sourcePrice,
    distinctLineItems = 1,
    vatRate = 0.23,
    iossVatCollected = false,
    customsRate = null,
    localIrelandPrice = null,
  } = input;

  for (const [name, value] of Object.entries({ sourcePrice, shipping, insurance, adminFee, intrinsicValue })) {
    if (value === null || value === undefined || Number.isNaN(Number(value)) || Number(value) < 0) {
      return { status: "incomplete", reason: `Missing or invalid ${name}` };
    }
  }

  if (typeof sourceInEu !== "boolean") {
    return { status: "incomplete", reason: "sourceInEu must be known" };
  }

  const goods = Number(sourcePrice);
  const delivery = Number(shipping);
  const cover = Number(insurance);
  const admin = Number(adminFee);
  const intrinsic = Number(intrinsicValue);
  let customsDuty = 0;
  let importVat = 0;

  if (!sourceInEu) {
    if (intrinsic <= 150) {
      customsDuty = 3 * Math.max(1, Number(distinctLineItems) || 1);
      if (!iossVatCollected) {
        importVat = (goods + delivery + cover + customsDuty) * Number(vatRate);
      }
    } else {
      if (customsRate === null || customsRate === undefined || Number.isNaN(Number(customsRate))) {
        return { status: "incomplete", reason: "Customs rate is required for non-EU consignments over €150" };
      }
      const customsValue = goods + delivery + cover;
      customsDuty = customsValue * Number(customsRate);
      importVat = (customsValue + customsDuty) * Number(vatRate);
    }
  }

  const landedCost = roundMoney(goods + delivery + cover + admin + customsDuty + importVat);
  const result = {
    status: "complete",
    sourcePrice: roundMoney(goods),
    shipping: roundMoney(delivery),
    insurance: roundMoney(cover),
    adminFee: roundMoney(admin),
    customsDuty: roundMoney(customsDuty),
    importVat: roundMoney(importVat),
    landedCost,
  };

  if (localIrelandPrice !== null && localIrelandPrice !== undefined && Number(localIrelandPrice) >= 0) {
    const local = roundMoney(Number(localIrelandPrice));
    const savings = roundMoney(local - landedCost);
    result.localIrelandPrice = local;
    result.savings = savings;
    result.savingsPercent = local > 0 ? roundMoney((savings / local) * 100) : 0;
    result.deal = savings > 0;
  }

  return result;
}
