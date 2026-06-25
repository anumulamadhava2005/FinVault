/**
 * Shared Yahoo Finance v8 client with crumb authentication.
 *
 * Yahoo Finance requires a session cookie + crumb for all chart API calls.
 * This module:
 *   1. Visits finance.yahoo.com to establish the session (sets cookies natively).
 *   2. Fetches a crumb from /v1/test/getcrumb and caches it for ~55 min.
 *   3. Appends the crumb to every chart URL.
 *   4. Auto-invalidates and retries once on 401/403.
 *   5. Deduplicates identical requests within a 2-minute window so two sync
 *      pipelines hitting the same symbol don't double the network calls.
 */

export const YAHOO_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';

const CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const CRUMB_URL = 'https://query1.finance.yahoo.com/v1/test/getcrumb';
const CRUMB_TTL = 55 * 60 * 1000; // 55 minutes

let _crumb: string | null = null;
let _crumbAt = 0;
let _sessionInitialized = false;

// In-flight dedup: if the same request is already in flight, reuse its promise.
const _inFlight = new Map<string, Promise<YahooChartData | null>>();
// Short-lived result cache: prevents duplicate network hits across two sync pipelines.
const _resultCache = new Map<string, { data: YahooChartData; exp: number }>();
const RESULT_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

async function initSession(): Promise<void> {
  if (_sessionInitialized) return;
  try {
    await fetch('https://finance.yahoo.com/', {
      headers: {
        'User-Agent': YAHOO_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    _sessionInitialized = true;
  } catch { /* ignore — will retry next call */ }
}

async function fetchCrumb(): Promise<string | null> {
  const now = Date.now();
  if (_crumb && now - _crumbAt < CRUMB_TTL) return _crumb;

  await initSession();

  try {
    const res = await fetch(CRUMB_URL, { headers: { 'User-Agent': YAHOO_UA } });
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    // A valid crumb is a short alphanumeric-ish string (<= 20 chars).
    if (!text || text.length > 30 || text.includes('<')) return null;
    const isRefresh = !!_crumb && _crumb !== text;
    _crumb = text;
    _crumbAt = now;
    if (isRefresh) console.log('[fetch] Yahoo crumb refreshed');
    return _crumb;
  } catch {
    return null;
  }
}

function invalidateCrumb() {
  _crumb = null;
  _crumbAt = 0;
  _sessionInitialized = false;
}

export interface YahooChartData {
  price: number;
  prevClose: number;
  firstClose: number;
  currency: string;
  timestamps: number[];
  closes: number[];
}

async function _fetchYahooChartUncached(
  symbol: string,
  range: '1d' | '1y',
  signal?: AbortSignal,
  _retry = true,
): Promise<YahooChartData | null> {
  const crumb = await fetchCrumb();

  let url = `${CHART_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  if (crumb) url += `&crumb=${encodeURIComponent(crumb)}`;

  console.log(`[fetch] Yahoo Finance: ${url}`);
  try {
    const res = await fetch(url, { signal, headers: { 'User-Agent': YAHOO_UA } });

    if (res.status === 401 || res.status === 403) {
      if (_retry) {
        invalidateCrumb();
        return _fetchYahooChartUncached(symbol, range, signal, false);
      }
      return null;
    }
    if (!res.ok) return null;

    const json: any = await res.json();
    const r = json?.chart?.result?.[0];
    if (!r) return null;

    const meta = r.meta ?? {};
    const rawCloses: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
    const closes = rawCloses.filter((c): c is number => c != null);
    const timestamps: number[] = r.timestamp ?? [];

    const price = meta.regularMarketPrice ?? closes[closes.length - 1];
    const prevClose =
      meta.chartPreviousClose ?? meta.previousClose ?? closes[closes.length - 2] ?? price;
    const firstClose = closes[0] ?? price;

    if (!price) return null;

    return {
      price,
      prevClose,
      firstClose,
      currency: meta.currency ?? 'INR',
      timestamps,
      closes,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch Yahoo Finance chart data for a symbol.
 * @param symbol  Yahoo Finance symbol (e.g. "RELIANCE.NS", "^NSEI", "GC=F")
 * @param range   "1d" for current price only, "1y" for historical series
 * @param signal  Optional AbortSignal
 */
export async function fetchYahooChart(
  symbol: string,
  range: '1d' | '1y' = '1y',
  signal?: AbortSignal,
): Promise<YahooChartData | null> {
  // A 1y response already includes regularMarketPrice, so serve it for 1d requests too.
  const yearKey = `${symbol}:1y`;
  const cached1y = _resultCache.get(yearKey);
  if (cached1y && Date.now() < cached1y.exp) {
    console.log(`[fetch] Yahoo Finance (cached 1y→serves ${range}): ${symbol}`);
    return cached1y.data;
  }

  const ck = `${symbol}:${range}`;
  const cached = _resultCache.get(ck);
  if (cached && Date.now() < cached.exp) {
    console.log(`[fetch] Yahoo Finance (cached): ${symbol} range=${range}`);
    return cached.data;
  }

  // Dedup concurrent in-flight requests for the same symbol+range.
  const existing = _inFlight.get(ck);
  if (existing) {
    console.log(`[fetch] Yahoo Finance (dedup in-flight): ${symbol} range=${range}`);
    return existing;
  }

  const promise = _fetchYahooChartUncached(symbol, range, signal).then((data) => {
    _inFlight.delete(ck);
    if (data) _resultCache.set(ck, { data, exp: Date.now() + RESULT_CACHE_TTL_MS });
    return data;
  });
  _inFlight.set(ck, promise);
  return promise;
}
