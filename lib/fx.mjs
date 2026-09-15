const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function toEur(amount, currency = "EUR", fxSnapshot) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric < 0) return { status: "incomplete", reason: "Invalid amount" };
  const code = String(currency || "EUR").toUpperCase();
  if (code === "EUR") return { status: "complete", amountEur: roundMoney(numeric), rate: 1, currency: code };
  const rate = Number(fxSnapshot?.rates?.[code]);
  if (!Number.isFinite(rate) || rate <= 0) return { status: "incomplete", reason: `Missing ECB reference rate for ${code}` };
  return {
    status: "complete",
    amountEur: roundMoney(numeric / rate),
    rate,
    currency: code,
    rateDate: fxSnapshot?.date || null,
    source: fxSnapshot?.source || null,
  };
}

export function fromEur(amountEur, currency = "EUR", fxSnapshot) {
  const numeric = Number(amountEur);
  if (!Number.isFinite(numeric) || numeric < 0) return { status: "incomplete", reason: "Invalid EUR amount" };
  const code = String(currency || "EUR").toUpperCase();
  if (code === "EUR") return { status: "complete", amount: roundMoney(numeric), rate: 1, currency: code };
  const rate = Number(fxSnapshot?.rates?.[code]);
  if (!Number.isFinite(rate) || rate <= 0) return { status: "incomplete", reason: `Missing ECB reference rate for ${code}` };
  return { status: "complete", amount: roundMoney(numeric * rate), rate, currency: code, rateDate: fxSnapshot?.date || null };
}
