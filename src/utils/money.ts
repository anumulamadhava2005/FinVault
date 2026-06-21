/**
 * Money helpers. Like the web backend, all monetary values are stored as
 * INTEGER paise (1 rupee = 100 paise) to avoid floating-point drift.
 */

export const rupeesToPaise = (rupees: number | string): number => {
  const cleaned = typeof rupees === 'string' ? rupees.replace(/,/g, '') : rupees;
  const n = typeof cleaned === 'string' ? parseFloat(cleaned) : cleaned;
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
};

export const paiseToRupees = (paise: number): number => (paise || 0) / 100;

/** Format paise as an Indian-grouped rupee string, e.g. 4200000 -> "₹42,000". */
export const formatINR = (paise: number, withDecimals = false): string => {
  const rupees = paiseToRupees(paise || 0);
  const formatted = rupees.toLocaleString('en-IN', {
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  });
  return `₹${formatted}`;
};

/** Compact form for chart axes / KPIs, e.g. ₹4.2L, ₹1.5Cr. */
export const formatINRCompact = (paise: number): string => {
  const r = paiseToRupees(paise || 0);
  const abs = Math.abs(r);
  if (abs >= 1e7) return `₹${(r / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(r / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `₹${(r / 1e3).toFixed(1)}k`;
  return `₹${Math.round(r)}`;
};

export const pct = (part: number, whole: number, digits = 1): number =>
  whole ? Number(((part / whole) * 100).toFixed(digits)) : 0;

export const scoreColor = (p: number): 'good' | 'warn' | 'bad' =>
  p >= 70 ? 'good' : p >= 40 ? 'warn' : 'bad';

/** Returns gain/loss in paise (current_value − invested_amount). */
export const assetPnl = (currentPaise: number, investedPaise: number): number =>
  (currentPaise || 0) - (investedPaise || 0);
