/** Date helpers. Dates are stored as ISO "YYYY-MM-DD" strings (web-app parity). */

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

export const nowISO = (): string => new Date().toISOString();

export const parseISO = (value?: string | null): Date | null => {
  if (!value) return null;
  const d = new Date(value.slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
};

export const isValidISODate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return parseISO(value) !== null;
};

export const daysBetween = (a: Date, b: Date): number =>
  Math.round((b.getTime() - a.getTime()) / 86_400_000);

/** Whole months between two dates (matches the goal-timeline approximation). */
export const monthsBetween = (a: Date, b: Date): number =>
  (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

export const addMonths = (d: Date, months: number): Date => {
  const r = new Date(d);
  const day = r.getDate();
  r.setMonth(r.getMonth() + months);
  if (r.getDate() < day) r.setDate(0); // clamp to last day of shorter month
  return r;
};

export const formatDisplayDate = (iso?: string | null): string => {
  const d = parseISO(iso);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
