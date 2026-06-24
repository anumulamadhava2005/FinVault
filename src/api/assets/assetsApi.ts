/**
 * Live price APIs — no backend required.
 *
 * • Equity  → Yahoo Finance v8 chart API (NSE tickers, suffix `.NS`)
 * • MF NAV  → api.mfapi.in (free Indian MF NAV service, searches by name)
 * • Gold    → Yahoo Finance `GC=F` + `USDINR=X` → INR/gram
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
 * Fetch NAV for an Indian mutual fund.
 * Uses api.mfapi.in — searches by fund name (since ISIN lookup isn't supported).
 * Caches scheme_code via the optional cacheCallback.
 */
export async function fetchMutualFundNav(
  nameOrIsin: string,
  _token?: string,
  signal?: AbortSignal,
  schemeCode?: number,
): Promise<ApiResponse<MutualFundNavResult> & { schemeCode?: number }> {
  try {
    let code = schemeCode;

    // If we don't have a cached scheme code, search for it
    if (!code) {
      const searchUrl = `https://api.mfapi.in/mf/search?q=${encodeURIComponent(nameOrIsin)}`;
      const searchRes = await fetch(searchUrl, { signal });
      if (!searchRes.ok) return { data: null, error: 'MF search failed' };
      const results: MfApiSearchResult[] = await searchRes.json();
      if (!results.length) return { data: null, error: 'No matching fund found' };
      code = results[0].schemeCode;
    }

    // Fetch NAV
    const navUrl = `https://api.mfapi.in/mf/${code}`;
    const navRes = await fetch(navUrl, { signal });
    if (!navRes.ok) return { data: null, error: 'NAV fetch failed' };
    const navJson: MfApiNavResponse = await navRes.json();
    const latest = navJson.data?.[0];
    if (!latest) return { data: null, error: 'No NAV data available' };
    const nav = parseFloat(latest.nav);
    if (isNaN(nav)) return { data: null, error: 'Invalid NAV value' };

    return {
      data: {
        isin: nameOrIsin,
        nav,
        scheme_name: navJson.meta?.scheme_name ?? nameOrIsin,
      },
      schemeCode: code,
      error: null,
    };
  } catch {
    return { data: null, error: 'Network error fetching MF NAV' };
  }
}

// ─── Gold ───────────────────────────────────────────────────────────────────

const TROY_OZ_TO_GRAMS = 31.1035;

/** Fetch current gold price in INR/gram via Yahoo Finance (gold futures + USD/INR). */
export async function fetchGoldPrice(
  _token?: string,
  signal?: AbortSignal,
): Promise<ApiResponse<GoldPriceResult>> {
  try {
    // Fetch gold futures (USD/oz) and USD/INR in parallel
    const [goldResult, fxResult] = await Promise.all([
      yahooPrice('GC=F', signal),
      yahooPrice('USDINR=X', signal),
    ]);

    if (!goldResult || !fxResult) {
      return { data: null, error: 'Unable to fetch gold/FX prices' };
    }

    const gc_usd = goldResult.price; // USD per troy oz
    const usd_inr = fxResult.price; // INR per USD
    const price_per_gram_inr = (gc_usd / TROY_OZ_TO_GRAMS) * usd_inr;

    return {
      data: {
        price_per_gram_inr: Math.round(price_per_gram_inr * 100) / 100,
        gc_usd,
        usd_inr,
      },
      error: null,
    };
  } catch {
    return { data: null, error: 'Network error fetching gold price' };
  }
}
