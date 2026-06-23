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

// Lines we should never read an amount or item from (taxes, ids, metadata).
const NEGATIVE_RE = /(sub\s*total|tax|gst|cgst|sgst|igst|cess|discount|change|\bcash\b|round|invoice|bill\s*no|phone|mobile|gstin|tin|\bdate\b|\btime\b|mode\s*:)/i;

// Customer / column-header / metadata line prefixes — never a merchant or item.
const META_RE = /^(name|table|bill|invoice|gst|gstin|date|time|receipt|item|price|qty|qnty|order|token|cashier|server|mode)\b/i;

// Address / location lines — often end in a 6-digit pincode; never an amount.
// The bare \d{6} also catches stray ids (e.g. document numbers) that OCR mixes in.
const ADDRESS_RE = /(\broad\b|\brd\.?\b|street|\bst\.?\b|layout|nagar|colony|\bcross\b|\bmain\b|sector|block|floor|near\b|opp\.?\b|bengaluru|bangalore|karnataka|\bpin\b|\b\d{6}\b)/i;

// Business-type words that strongly identify the merchant name on a receipt.
const MERCHANT_KEYWORDS = /(palace|restaurant|hotel|caf[eé]|bhavan|bhawan|foods?|kitchen|\bbar\b|dhaba|sweets?|bakery|\bmart\b|stores?|supermarket|grocer|pharma|medical|enterprises?|traders?|provisions?|\binn\b)/i;

/** A value that could plausibly be a money amount on a consumer bill. */
const isPlausibleAmount = (n: number): boolean => n > 0 && n < 1_000_000;

const detectAmount = (lines: string[]): number | null => {
  // 1. Keyword-anchored search with forward lookahead.
  //
  // ML Kit / Vision often emit receipts column-by-column, so the value for a
  // "Total" label lands a few lines *below* the label rather than beside it.
  // For each total keyword we therefore scan a small window of following lines
  // (stopping at the next keyword), and take the largest plausible value there.
  // Ties on weight prefer the *later* occurrence — the grand total sits at the
  // bottom of a bill, after sub-total/tax.
  let best: { value: number; weight: number; idx: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (NEGATIVE_RE.test(lines[i])) continue;
    let weight = 0;
    for (const k of TOTAL_KEYWORDS) {
      if (k.re.test(lines[i])) weight = Math.max(weight, k.weight);
    }
    if (weight === 0) continue;

    const window: number[] = [];
    for (let j = i; j < Math.min(lines.length, i + 5); j++) {
      if (j > i && TOTAL_KEYWORDS.some((k) => k.re.test(lines[j]))) break; // next section
      if (j > i && NEGATIVE_RE.test(lines[j])) continue;
      for (const n of moneyIn(lines[j])) if (isPlausibleAmount(n)) window.push(n);
    }
    if (!window.length) continue;

    const value = Math.max(...window);
    if (!best || weight > best.weight || (weight === best.weight && i >= best.idx)) {
      best = { value, weight, idx: i };
    }
  }
  if (best) return best.value;

  // 2. Fallback: the largest plausible value on a non-tax, non-address line.
  let max = 0;
  for (const line of lines) {
    if (NEGATIVE_RE.test(line) || ADDRESS_RE.test(line)) continue;
    for (const n of moneyIn(line)) {
      if (isPlausibleAmount(n) && n > max) max = n;
    }
  }
  return max > 0 ? max : null;
};

const detectMerchant = (lines: string[]): string | null => {
  // 1. A line naming a business type is the most reliable signal — and it
  //    survives column-reordered OCR (it can appear anywhere on the bill).
  for (const line of lines) {
    if (line.length <= 40 && MERCHANT_KEYWORDS.test(line) && !NEGATIVE_RE.test(line)) {
      return line.replace(/\s+/g, ' ').trim();
    }
  }
  // 2. Otherwise the first "name-like" line that isn't metadata/address/date.
  for (const line of lines.slice(0, 8)) {
    if (META_RE.test(line) || ADDRESS_RE.test(line) || NEGATIVE_RE.test(line)) continue;
    const letters = (line.match(/[A-Za-z]/g) || []).length;
    const digits = (line.match(/\d/g) || []).length;
    if (letters >= 3 && letters >= digits && line.length <= 40 && !/\d{2}[\/\-.]\d{2}/.test(line)) {
      return line.replace(/\s+/g, ' ').trim();
    }
  }
  return null;
};

const detectLineItems = (lines: string[]): BillLineItem[] => {
  const items: BillLineItem[] = [];
  for (const line of lines) {
    if (NEGATIVE_RE.test(line) || ADDRESS_RE.test(line) || META_RE.test(line)) continue;
    if (TOTAL_KEYWORDS.some((k) => k.re.test(line))) continue;
    // "<name> .... <price>" on the SAME line — decimal optional. When OCR splits
    // names and prices into separate columns no line matches, so we emit nothing
    // rather than pairing an address/date with a stray number.
    const m = line.match(/^(.*?[A-Za-z].*?)\s+(?:₹|rs\.?|inr)?\s*((?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?)\s*$/i);
    if (m) {
      const name = m[1].replace(/[.\-•|]+$/, '').replace(/\s+/g, ' ').trim();
      const price = toNumber(m[2]);
      if (name.length >= 2 && name.length <= 40 && isPlausibleAmount(price) && !MERCHANT_KEYWORDS.test(name)) {
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
