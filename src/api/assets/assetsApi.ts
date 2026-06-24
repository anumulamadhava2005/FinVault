/**
 * Live price APIs — no backend required.
 *
 * • Equity  → Yahoo Finance v8 chart API (NSE tickers, suffix `.NS`)
 *             Standard non-commercial client usage (crumb/cookie session).
 * • MF NAV  → api.mfapi.in (community wrapper around official AMFI NAV data;
 *             same scheme codes as AMFI, updated daily)
 * • Gold    → Nippon India Gold BeES (GOLDBEES.NS, 0.01 g/unit) — reflects
 *             Indian market price including import duty + GST.
 *             Fallback: COMEX GC=F × USDINR=X (may differ 5–15% from MCX).
 */

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}
import { fetchYahooChart } from '../../utils/yahoo';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EquityPriceResult {
  symbol: string;
  price: number; // INR
  currency: string;
}

export interface MutualFundNavResult {
  isin: string;
  nav: number;
  scheme_name: string;
}

export interface GoldPriceResult {
  price_per_gram_inr: number;
  gc_usd: number;
  usd_inr: number;
}

// ─── Yahoo Finance helper ────────────────────────────────────────────────────

async function yahooPrice(
  symbol: string,
  signal?: AbortSignal,
): Promise<{ price: number; currency: string } | null> {
  const data = await fetchYahooChart(symbol, '1d', signal);
  if (!data) return null;
  return { price: data.price, currency: data.currency };
}

// ─── Equity ─────────────────────────────────────────────────────────────────

/** Fetch latest price for an NSE/BSE ticker via Yahoo Finance. */
export async function fetchEquityPrice(
  ticker: string,
  _token?: string,
  signal?: AbortSignal,
): Promise<ApiResponse<EquityPriceResult>> {
  // Append .NS if no exchange suffix present
  const symbol = ticker.includes('.') ? ticker : `${ticker}.NS`;
  const result = await yahooPrice(symbol, signal);
  if (!result) {
    // Fallback: try BSE suffix
    if (!ticker.includes('.')) {
      const bse = await yahooPrice(`${ticker}.BO`, signal);
      if (bse) {
        return {
          data: { symbol: `${ticker}.BO`, price: bse.price, currency: bse.currency },
          error: null,
        };
      }
    }
    return { data: null, error: 'Unable to fetch price from Yahoo Finance' };
  }
  return { data: { symbol, price: result.price, currency: result.currency }, error: null };
}

// ─── Mutual Fund NAV ────────────────────────────────────────────────────────

interface MfApiSearchResult {
  schemeCode: number;
  schemeName: string;
}

interface MfApiNavResponse {
  meta: { scheme_name: string; scheme_code: number };
  data: Array<{ date: string; nav: string }>;
}

/**
 * Fetch NAV for an Indian mutual fund via api.mfapi.in (wraps official AMFI data).
 * Searches by fund name when scheme code is not already cached on the asset.
 * Hard 10-second timeout guards against slow responses.
 */
export async function fetchMutualFundNav(
  nameOrIsin: string,
  _token?: string,
  signal?: AbortSignal,
  schemeCode?: number,
): Promise<ApiResponse<MutualFundNavResult> & { schemeCode?: number }> {
  // Enforce a 10-second timeout; respect an earlier abort from the caller
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  const sig: AbortSignal = (signal as any) ?? ctrl.signal;

  try {
    let code = schemeCode;

    if (!code) {
      const searchUrl = `https://api.mfapi.in/mf/search?q=${encodeURIComponent(nameOrIsin)}`;
      const searchRes = await fetch(searchUrl, { signal: sig });
      if (!searchRes.ok) return { data: null, error: 'MF search failed' };
      const results: MfApiSearchResult[] = await searchRes.json();
      if (!results.length) return { data: null, error: 'No matching fund found' };
      code = results[0].schemeCode;
    }

    const navUrl = `https://api.mfapi.in/mf/${code}`;
    const navRes = await fetch(navUrl, { signal: sig });
    if (!navRes.ok) return { data: null, error: 'NAV fetch failed' };
    const navJson: MfApiNavResponse = await navRes.json();
    const latest = navJson.data?.[0];
    if (!latest) return { data: null, error: 'No NAV data available' };
    const nav = parseFloat(latest.nav);
    if (isNaN(nav)) return { data: null, error: 'Invalid NAV value' };

    return {
      data: { isin: nameOrIsin, nav, scheme_name: navJson.meta?.scheme_name ?? nameOrIsin },
      schemeCode: code,
      error: null,
    };
  } catch (err: unknown) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    return { data: null, error: timedOut ? 'MF NAV request timed out' : 'Network error fetching MF NAV' };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Gold ───────────────────────────────────────────────────────────────────

const TROY_OZ_TO_GRAMS = 31.1035;
// GOLDBEES: Nippon India Gold BeES ETF — 1 unit = 0.01 g of 99.5% purity gold.
// Price × 100 = ₹/gram. Reflects actual Indian market price (incl. import duty + GST).
const GOLDBEES_SYMBOL = 'GOLDBEES.NS';
const GOLDBEES_GRAMS_PER_UNIT = 0.01;

/**
 * Fetch current gold price in INR/gram.
 * Primary: GOLDBEES.NS (Indian ETF, ~Indian MCX price).
 * Fallback: COMEX GC=F futures × USDINR=X (may underestimate by 5-15% vs MCX).
 */
export async function fetchGoldPrice(
  _token?: string,
  signal?: AbortSignal,
): Promise<ApiResponse<GoldPriceResult>> {
  // Primary: GOLDBEES ETF — one unit = 0.01g, so price / 0.01 = ₹/gram
  try {
    const goldbees = await yahooPrice(GOLDBEES_SYMBOL, signal);
    if (goldbees) {
      const price_per_gram_inr = goldbees.price / GOLDBEES_GRAMS_PER_UNIT;
      return {
        data: { price_per_gram_inr: Math.round(price_per_gram_inr * 100) / 100, gc_usd: 0, usd_inr: 0 },
        error: null,
      };
    }
  } catch { /* fall through to COMEX fallback */ }

  // Fallback: COMEX GC=F gold futures + USD/INR spot rate
  try {
    const [goldResult, fxResult] = await Promise.all([
      yahooPrice('GC=F', signal),
      yahooPrice('USDINR=X', signal),
    ]);
    if (!goldResult || !fxResult) return { data: null, error: 'Unable to fetch gold price' };
    const gc_usd = goldResult.price;
    const usd_inr = fxResult.price;
    const price_per_gram_inr = (gc_usd / TROY_OZ_TO_GRAMS) * usd_inr;
    return {
      data: { price_per_gram_inr: Math.round(price_per_gram_inr * 100) / 100, gc_usd, usd_inr },
      error: null,
    };
  } catch {
    return { data: null, error: 'Network error fetching gold price' };
  }
}
