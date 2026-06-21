/** CAGR calculation matching the browser app's formula. */

export const calcCAGR = (currentPaise: number, investedPaise: number, purchaseDateISO: string | null): number => {
  if (!investedPaise || investedPaise <= 0 || !purchaseDateISO) return 0;
  const purchaseMs = new Date(purchaseDateISO).getTime();
  const nowMs = Date.now();
  const days = (nowMs - purchaseMs) / 86_400_000;
  const years = Math.max(days / 365, 0.25); // 0.25yr floor prevents division by near-zero
  const ratio = currentPaise / investedPaise;
  return Number(((Math.pow(ratio, 1 / years) - 1) * 100).toFixed(2));
};
