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

// Additional patterns to exclude from *line items only* (not used for total detection).
const ITEM_SKIP_RE = /(service\s*(charge|tax|fee)|cover\s*charge|packing\s*(charge)?|delivery\s*(fee|charge)?|\btip\b|gratuity|min(imum)?\s*(cover|charge)|extra\s*charge|staff\s*welfare)/i;

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

  const shouldSkip = (line: string) =>
    NEGATIVE_RE.test(line) ||
    ITEM_SKIP_RE.test(line) ||
    ADDRESS_RE.test(line) ||
    META_RE.test(line) ||
    TOTAL_KEYWORDS.some((k) => k.re.test(line));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (shouldSkip(line)) continue;

    // Strip leading serial number or "Nx"/"N x" quantity prefix: "1.", "02.", "3 x ", "4x "
    const stripped = line.replace(/^\s*\d{1,3}\.?\s*(?:x\s+)?/, '').trim();

    // All money-like numbers on this line
    const amounts = moneyIn(line).filter(isPlausibleAmount);

    if (amounts.length === 0) {
      // ── Column-split OCR: name line with no price ────────────────────────────
      // If the very next non-blank, non-skip line contains exactly one price,
      // treat it as a split name+price pair (common in columnar restaurant OCR).
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && !shouldSkip(lines[j])) {
        const nextAmounts = moneyIn(lines[j]).filter(isPlausibleAmount);
        if (nextAmounts.length === 1) {
          const name = stripped.replace(/[.\-•|]+$/, '').replace(/\s+/g, ' ').trim();
          const hasLetters = (name.match(/[A-Za-z]/g) || []).length >= 2;
          if (hasLetters && name.length >= 2 && name.length <= 60) {
            items.push({ name, price: nextAmounts[0] });
            i = j; // consume the price line
            if (items.length >= 20) break;
          }
        }
      }
      continue;
    }

    // ── Multi-column line: "Name  [qty]  [rate]  total" ────────────────────────
    // The LAST money value is always the row total (unit price × qty).
    const total = amounts[amounts.length - 1];

    // Detect optional quantity: a small integer (1–50) that, when multiplied by
    // the second-to-last amount, approximates the total (qty × rate = total).
    let qty = 1;
    if (amounts.length >= 3) {
      const possibleQty = amounts[amounts.length - 3];
      const possibleRate = amounts[amounts.length - 2];
      if (
        Number.isInteger(possibleQty) &&
        possibleQty >= 1 &&
        possibleQty <= 50 &&
        Math.abs(possibleQty * possibleRate - total) < total * 0.02
      ) {
        qty = possibleQty;
      }
    }
    // Also handle "2x" / "x2" style inline multipliers when amounts has two entries
    if (qty === 1 && amounts.length === 2) {
      const inline = stripped.match(/\b(\d{1,2})\s*x\s*\d|\bx\s*(\d{1,2})\b/i);
      if (inline) {
        const q = Number(inline[1] ?? inline[2]);
        if (q >= 1 && q <= 50) qty = q;
      }
    }

    // Name: text before the first number cluster, with trailing dots/dashes removed
    let nameRaw = stripped
      .replace(/\s+(?:₹|rs\.?|inr|mrp)?\s*[\d,]+(?:\.\d{1,2})?(?:\s+[\d,]+(?:\.\d{1,2})?)*\s*$/, '')
      .replace(/\s+x\s*\d{1,2}\b|\b\d{1,2}\s*x\s+/i, '') // strip "2x" / "x 2" inline multipliers
      .replace(/[.\-•|×]+\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!nameRaw || !/[A-Za-z]/.test(nameRaw)) continue;
    if ((nameRaw.match(/[A-Za-z]/g) || []).length < 2) continue;
    if (nameRaw.length < 2 || nameRaw.length > 60) continue;
    // Skip date-like strings and pure numbers
    if (/^\d+$/.test(nameRaw) || /\d{2}[\/\-.]\d{2}/.test(nameRaw)) continue;

    // Append "×N" to the display name when quantity > 1 so it's visible in the review card
    const name = qty > 1 ? `${nameRaw} ×${qty}` : nameRaw;
    items.push({ name, price: total });
    if (items.length >= 20) break;
  }

  // Remove exact duplicates (same name+price) that OCR noise can create
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = `${it.name.toLowerCase()}|${it.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
