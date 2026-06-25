/**
 * NSE India direct API — session-cookie-based scraping.
 *
 * Provides real-time equity and ETF quotes straight from the exchange,
 * including exchange-official `previousClose` (not Yahoo Finance's
 * dividend-adjusted historical series) and `pChange` (day change %).
 *
 * Flow: GET homepage → seeds native cookie jar → GET /api/quote-equity
 * React Native's native HTTP stack (iOS NSURLSession / Android OkHttp)
 * stores per-host cookies automatically, so the session carries over.
 *
 * Always returns null on failure; callers must fall back to Yahoo Finance.
 */

export interface NseQuoteResult {
  symbol: string;
  /** Last traded price on NSE (INR). */
  lastPrice: number;
  /** Exchange-official previous session close (INR) — NOT dividend-adjusted. */
  previousClose: number;
  /** Exchange-computed day change % — use directly for display. */
  pChange: number;
  open: number;
  dayHigh: number;
  dayLow: number;
}

const NSE_BASE = 'https://www.nseindia.com';

// Mobile Chrome UA — NSE serves JSON cleanly for mobile browsers.
const UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const SESSION_TTL_MS = 25_000;

let sessionAt = 0;
let pendingSession: Promise<void> | null = null;

/**
 * Hit the NSE homepage once every 25 s so the native cookie jar stays seeded.
 * Concurrent callers share the single in-flight request.
 */
async function ensureSession(signal?: AbortSignal): Promise<void> {
  if (Date.now() - sessionAt < SESSION_TTL_MS) return;
  if (!pendingSession) {
    pendingSession = fetch(`${NSE_BASE}/`, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
      },
      credentials: 'include',
      signal,
    })
      .then(() => { sessionAt = Date.now(); })
      .catch(() => {})
      .finally(() => { pendingSession = null; });
  }
  return pendingSession;
}

/**
 * Fetch real-time quote for any NSE-listed equity or ETF.
 * Pass the bare NSE symbol — no exchange suffix (e.g. `'GOLDBEES'`, `'RELIANCE'`).
 */
export async function nseQuote(
  symbol: string,
  signal?: AbortSignal,
): Promise<NseQuoteResult | null> {
  try {
    await ensureSession(signal);
    const nseUrl = `${NSE_BASE}/api/quote-equity?symbol=${encodeURIComponent(symbol.toUpperCase())}`;
    console.log(`[fetch] NSE quote: ${nseUrl}`);
    const resp = await fetch(
      nseUrl,
      {
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-IN,en;q=0.9',
          'Referer': `${NSE_BASE}/get-quotes/equity?symbol=${symbol.toUpperCase()}`,
        },
        credentials: 'include',
        signal,
      },
    );
    if (!resp.ok) return null;
    const json: any = await resp.json();
    const p = json?.priceInfo;
    if (!p || p.lastPrice == null) return null;
    return {
      symbol: symbol.toUpperCase(),
      lastPrice: Number(p.lastPrice),
      previousClose: Number(p.previousClose ?? p.lastPrice),
      pChange: Number(p.pChange ?? 0),
      open: Number(p.open ?? p.lastPrice),
      dayHigh: Number(p.intraDayHighLow?.max ?? p.lastPrice),
      dayLow: Number(p.intraDayHighLow?.min ?? p.lastPrice),
    };
  } catch {
    return null;
  }
}
