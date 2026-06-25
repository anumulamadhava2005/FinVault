/** Indian Financial Year utilities (April 1 – March 31). */

/**
 * Returns the FY start year for a given date.
 * Apr–Dec → current calendar year; Jan–Mar → previous calendar year.
 * E.g. any date in Apr 2025 – Mar 2026 → 2025 (meaning FY 2025-26).
 */
export const fyStartYear = (date: Date = new Date()): number =>
  date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;

/** ISO date for April 1 of the FY starting at fyYear (e.g. "2025-04-01"). */
export const fyStartDate = (fyYear: number): string => `${fyYear}-04-01`;

/** ISO date for March 31 of the FY ending at fyYear+1 (e.g. "2026-03-31"). */
export const fyEndDate = (fyYear: number): string => `${fyYear + 1}-03-31`;

/** YYYY-MM for April of fyYear (used as ym range lower bound). */
export const fyStartYm = (fyYear: number): string =>
  `${fyYear}-04`;

/** YYYY-MM for March of fyYear+1 (used as ym range upper bound). */
export const fyEndYm = (fyYear: number): string =>
  `${fyYear + 1}-03`;

/** Human-readable label, e.g. "FY 2025-26". */
export const fyLabel = (fyYear: number): string =>
  `FY ${fyYear}-${String(fyYear + 1).slice(-2)}`;

/**
 * The 12 calendar {calYear, calMonth} pairs for a FY in display order (Apr–Mar).
 * calMonth is 1-based.
 */
export const fyMonths = (fyYear: number): { calYear: number; calMonth: number }[] => {
  const result: { calYear: number; calMonth: number }[] = [];
  for (let m = 4; m <= 12; m++) result.push({ calYear: fyYear, calMonth: m });
  for (let m = 1; m <= 3; m++) result.push({ calYear: fyYear + 1, calMonth: m });
  return result;
};

/** Short month labels in FY order (Apr–Mar). */
export const FY_MONTH_LABELS = [
  'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar',
];

/**
 * Given a ym string "YYYY-MM", returns the FY start year it belongs to.
 * E.g. "2025-11" → 2025; "2026-02" → 2025.
 */
export const ymToFyStartYear = (ym: string): number => {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return m >= 4 ? y : y - 1;
};
