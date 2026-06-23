/**
 * Heuristic parser that turns raw OCR text from a bill/receipt into structured
 * fields (total amount, date, merchant, line items). Tuned for Indian receipts
 * (₹ / Rs / INR, dd/mm/yyyy dates) but degrades gracefully on anything else.
 */

export interface BillLineItem {
  name: string;
  price: number; // rupees
}

export interface ParsedBill {
  /** Detected total in rupees (not paise), or null. */
  amount: number | null;
  /** Total formatted for a numeric TextInput, e.g. "1234.50". */
  amountText: string;
  /** ISO yyyy-mm-dd, or null. */
  date: string | null;
  /** Best-guess merchant / shop name. */
  merchant: string | null;
  lineItems: BillLineItem[];
  rawText: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** A money token: optional currency marker then a number like 1,234.50 or 1234. */
const MONEY_RE = /(?:₹|rs\.?|inr|mrp)?\s*((?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?)/gi;

const toNumber = (s: string): number => parseFloat(s.replace(/,/g, ''));

/** Extract every money-like number from a line. */
const moneyIn = (line: string): number[] => {
  const out: number[] = [];
  let m: RegExpExecArray | null;
  MONEY_RE.lastIndex = 0;
  while ((m = MONEY_RE.exec(line)) !== null) {
    const n = toNumber(m[1]);
    if (!isNaN(n)) out.push(n);
  }
  return out;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Try hard to find a date and normalise to ISO yyyy-mm-dd. */
const parseDate = (text: string): string | null => {
  // 1. dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy (day-first, common in India)
  let m = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
  if (m) {
    let [, d, mo, y] = m;
    let year = Number(y);
    if (year < 100) year += 2000;
    const day = Number(d);
    const month = Number(mo);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }
  // 2. yyyy-mm-dd
  m = text.match(/\b(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${pad2(Number(mo))}-${pad2(Number(d))}`;
  }
  // 3. dd Mon yyyy  /  Mon dd, yyyy
  m = text.match(/\b(\d{1,2})\s*([A-Za-z]{3,4})\.?\s*,?\s*(\d{2,4})\b/);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month) {
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      return `${year}-${pad2(month)}-${pad2(Number(m[1]))}`;
    }
  }
  m = text.match(/\b([A-Za-z]{3,4})\.?\s*(\d{1,2})\s*,?\s*(\d{2,4})\b/);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    if (month) {
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      return `${year}-${pad2(month)}-${pad2(Number(m[2]))}`;
    }
  }
  return null;
};

// Keywords ranked by how strongly they indicate the final payable amount.
const TOTAL_KEYWORDS: { re: RegExp; weight: number }[] = [
  { re: /grand\s*total/i, weight: 5 },
  { re: /net\s*(amount|payable|total)/i, weight: 5 },
  { re: /amount\s*(payable|due)/i, weight: 5 },
  { re: /total\s*amount/i, weight: 4 },
  { re: /balance\s*due/i, weight: 4 },
  { re: /\btotal\b/i, weight: 3 },
  { re: /\bpaid\b/i, weight: 2 },
];

// Lines we should never read an amount from.
const NEGATIVE_RE = /(sub\s*total|tax|gst|cgst|sgst|igst|cess|discount|change|cash|round|invoice\s*no|bill\s*no|phone|mobile|gstin|tin)/i;

const detectAmount = (lines: string[]): number | null => {
  let best: { value: number; weight: number } | null = null;

  for (const line of lines) {
    const isNegative = NEGATIVE_RE.test(line);
    let lineWeight = 0;
    for (const k of TOTAL_KEYWORDS) {
      if (k.re.test(line)) lineWeight = Math.max(lineWeight, k.weight);
    }
    if (lineWeight === 0) continue;
    if (isNegative && lineWeight < 4) continue; // e.g. "sub total" shouldn't win over "grand total"

    const nums = moneyIn(line);
    if (!nums.length) continue;
    const value = Math.max(...nums); // the payable figure is usually the largest on its line
    if (!best || lineWeight > best.weight || (lineWeight === best.weight && value > best.value)) {
      best = { value, weight: lineWeight };
    }
  }

  if (best) return best.value;

  // Fallback: the largest money value anywhere that looks like a real amount.
  let max = 0;
  for (const line of lines) {
    if (NEGATIVE_RE.test(line)) continue;
    for (const n of moneyIn(line)) {
      if (n > max && n < 10_000_000) max = n;
    }
  }
  return max > 0 ? max : null;
};

const detectMerchant = (lines: string[]): string | null => {
  for (const line of lines.slice(0, 5)) {
    const letters = (line.match(/[A-Za-z]/g) || []).length;
    const digits = (line.match(/\d/g) || []).length;
    // A name line: mostly letters, reasonable length, not a date/amount/GST line.
    if (letters >= 3 && letters >= digits && line.length <= 40 && !NEGATIVE_RE.test(line) && !/\d{2}[\/\-.]\d{2}/.test(line)) {
      return line.replace(/\s+/g, ' ').trim();
    }
  }
  return lines[0] ? lines[0].replace(/\s+/g, ' ').trim() : null;
};

const detectLineItems = (lines: string[]): BillLineItem[] => {
  const items: BillLineItem[] = [];
  for (const line of lines) {
    if (NEGATIVE_RE.test(line)) continue;
    if (TOTAL_KEYWORDS.some((k) => k.re.test(line))) continue;
    // "<name> .... <price with decimals>" at end of line.
    const m = line.match(/^(.*?[A-Za-z].*?)\s+(?:₹|rs\.?|inr)?\s*((?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2})\s*$/i);
    if (m) {
      const name = m[1].replace(/[.\-•|]+$/, '').replace(/\s+/g, ' ').trim();
      const price = toNumber(m[2]);
      if (name.length >= 2 && name.length <= 40 && !isNaN(price) && price > 0) {
        items.push({ name, price });
      }
    }
    if (items.length >= 15) break;
  }
  return items;
};

export const parseBill = (rawText: string): ParsedBill => {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const amount = detectAmount(lines);
  const date = parseDate(rawText);
  const merchant = detectMerchant(lines);
  const lineItems = detectLineItems(lines);

  return {
    amount,
    amountText: amount !== null ? String(amount) : '',
    date,
    merchant,
    lineItems,
    rawText,
  };
};
