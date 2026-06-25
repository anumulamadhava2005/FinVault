/**
 * Live market feeds — no backend, no API keys.
 *
 *  • Market snapshot  → Yahoo Finance v8 chart (Nifty, Sensex, Gold, USD/INR)
 *                       with day-change and trailing-1y returns.
 *  • Benchmarks       → derived from the snapshot (live equity / gold returns),
 *                       cached in `market_cache` and read synchronously by the
 *                       portfolio-intelligence engine (with static fallback).
 *  • Wealth Feed      → public Indian-finance RSS feeds, parsed client-side and
 *                       personalised against the user's holdings by the screen.
 *
 * Network results are cached in SQLite so the rest of the app can read them
 * synchronously and so the UI still has data when offline.
 */
import { all, first, run } from '../db';
import { nowISO } from '../utils/date';
import { fetchYahooChart, YAHOO_UA } from '../utils/yahoo';

// ─── Yahoo chart series ──────────────────────────────────────────────────────

interface SeriesResult { price: number; prevClose: number; firstClose: number; currency: string }

async function fetchYahooSeries(symbol: string, signal?: AbortSignal): Promise<SeriesResult | null> {
  const data = await fetchYahooChart(symbol, '1y', signal);
  if (!data) return null;
  return { price: data.price, prevClose: data.prevClose, firstClose: data.firstClose, currency: data.currency };
}

// ─── Market snapshot ─────────────────────────────────────────────────────────

export interface MarketIndex {
  symbol: string;
  label: string;
  price: number;
  unit: string;
  changePct: number; // day
  return1y: number;
}
export interface MarketSnapshot {
  updated_at: string;
  indices: MarketIndex[];
}

const TROY_OZ_TO_GRAMS = 31.1035;

/** Fetch indices + gold + FX and cache the snapshot. Safe to call often. */
export const refreshMarketData = async (): Promise<MarketSnapshot | null> => {
  let nifty: SeriesResult | null, sensex: SeriesResult | null, gold: SeriesResult | null, fx: SeriesResult | null;
  try {
    [nifty, sensex, gold, fx] = await Promise.all([
      fetchYahooSeries('^NSEI'),
      fetchYahooSeries('^BSESN'),
      fetchYahooSeries('GC=F'),
      fetchYahooSeries('USDINR=X'),
    ]);
  } catch {
    return getMarketSnapshot(); // keep serving stale cache on network failure
  }

  const indices: MarketIndex[] = [];
  const mk = (s: SeriesResult | null, symbol: string, label: string, unit: string, transform?: (v: number) => number): void => {
    if (!s) return;
    const t = transform ?? ((v) => v);
    indices.push({
      symbol,
      label,
      price: Number(t(s.price).toFixed(2)),
      unit,
      changePct: s.prevClose ? Number((((s.price - s.prevClose) / s.prevClose) * 100).toFixed(2)) : 0,
      return1y: s.firstClose ? Number((((s.price - s.firstClose) / s.firstClose) * 100).toFixed(1)) : 0,
    });
  };

  mk(nifty, '^NSEI', 'Nifty 50', 'pts');
  mk(sensex, '^BSESN', 'Sensex', 'pts');
  // Gold → ₹/gram using live USD/INR when available.
  if (gold) {
    const usdInr = fx?.price ?? 83;
    mk(gold, 'GOLD', 'Gold', '₹/g', (usdPerOz) => (usdPerOz / TROY_OZ_TO_GRAMS) * usdInr);
  }
  mk(fx, 'USDINR=X', 'USD / INR', '₹');

  if (!indices.length) return getMarketSnapshot(); // keep last good cache

  const snapshot: MarketSnapshot = { updated_at: nowISO(), indices };
  try {
    run('INSERT OR REPLACE INTO market_cache (key, value, updated_at) VALUES (?, ?, ?)', [
      'snapshot',
      JSON.stringify(snapshot),
      snapshot.updated_at,
    ]);
  } catch { /* cache write is best-effort */ }
  return snapshot;
};

/** Synchronous read of the last cached market snapshot. */
export const getMarketSnapshot = (): MarketSnapshot | null => {
  try {
    const row = first<{ value: string }>('SELECT value FROM market_cache WHERE key = ?', ['snapshot']);
    return row ? (JSON.parse(row.value) as MarketSnapshot) : null;
  } catch {
    return null;
  }
};

/** Live trailing returns derived from the snapshot, for the analysis engine. */
export const getLiveBenchmarks = (): { equity1y: number | null; gold1y: number | null } | null => {
  const snap = getMarketSnapshot();
  if (!snap) return null;
  const find = (sym: string) => snap.indices.find((i) => i.symbol === sym)?.return1y ?? null;
  return { equity1y: find('^NSEI'), gold1y: find('GOLD') };
};

// ─── Wealth feed (RSS) ───────────────────────────────────────────────────────

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  source: string;
  published: string | null;
  summary: string;
  /** Names of the user's holdings this story was fetched for (portfolio-targeted feed). */
  holdings?: string[];
}

const RSS_FEEDS: { url: string; source: string }[] = [
  { url: 'https://www.moneycontrol.com/rss/marketreports.xml', source: 'Moneycontrol' },
  { url: 'https://www.moneycontrol.com/rss/business.xml', source: 'Moneycontrol' },
  { url: 'https://www.livemint.com/rss/markets', source: 'Mint' },
  { url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', source: 'ET Markets' },
];

const decodeEntities = (s: string): string => {
  // Pass 1 – unwrap CDATA and strip literal HTML tags.
  let out = s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, ' ');
  // Pass 2 – decode named/numeric entities.
  out = out
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  // Pass 3 – strip any HTML tags that appeared after entity decoding (e.g. &lt;a&gt;).
  out = out.replace(/<[^>]+>/g, ' ');
  return out.replace(/\s+/g, ' ').trim();
};

const tag = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]) : '';
};

const parseRss = (xml: string, source: string): FeedItem[] => {
  const items: FeedItem[] = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of matches) {
    const title = tag(block, 'title');
    const link = tag(block, 'link');
    if (!title) continue;
    const pub = tag(block, 'pubDate');
    let published: string | null = null;
    const d = pub ? new Date(pub) : null;
    if (d && !isNaN(d.getTime())) published = d.toISOString();
    items.push({
      id: link || `${source}-${title.slice(0, 40)}`,
      title,
      link,
      source,
      published,
      summary: tag(block, 'description').slice(0, 220),
    });
  }
  return items;
};

/** Fetch and merge the RSS feeds. Cached so the feed survives going offline. */
export const fetchWealthFeed = async (): Promise<FeedItem[]> => {
  const results = await Promise.all(
    RSS_FEEDS.map(async ({ url, source }) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': YAHOO_UA, Accept: 'application/rss+xml, application/xml, text/xml' } });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRss(xml, source);
      } catch {
        return [];
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  // Merge, de-dupe by title, sort newest-first.
  const seen = new Set<string>();
  const merged: FeedItem[] = [];
  for (const list of results) {
    for (const it of list) {
      const key = it.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(it);
    }
  }
  merged.sort((a, b) => (b.published ?? '').localeCompare(a.published ?? ''));
  const top = merged.slice(0, 40);

  if (top.length) {
    try {
      run('INSERT OR REPLACE INTO market_cache (key, value, updated_at) VALUES (?, ?, ?)', [
        'feed',
        JSON.stringify(top),
        nowISO(),
      ]);
    } catch { /* best-effort */ }
  }
  return top.length ? top : getCachedFeed();
};

export const getCachedFeed = (): FeedItem[] => {
  try {
    const row = first<{ value: string }>('SELECT value FROM market_cache WHERE key = ?', ['feed']);
    return row ? (JSON.parse(row.value) as FeedItem[]) : [];
  } catch {
    return [];
  }
};

// ─── Portfolio-targeted news (Google News RSS search) ────────────────────────

const GOOGLE_NEWS_SEARCH = 'https://news.google.com/rss/search';
const PORTFOLIO_SLUGS = ['equity', 'mutual_fund', 'digital_gold', 'physical_gold', 'sgb'];

/** Strip corporate suffixes so "Reliance Industries Ltd" → "Reliance Industries". */
const cleanCompany = (name: string): string =>
  name
    .replace(/\b(ltd|limited|pvt|private|inc|corp|company|co)\b\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/** Build de-duplicated search queries from the user's market holdings. */
const buildPortfolioQueries = (userId: string): { query: string; holdings: string[] }[] => {
  const rows = all<{ name: string; ticker: string | null; slug: string }>(
    `SELECT a.name, a.ticker, t.slug AS slug FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id
     WHERE a.user_id = ? AND t.slug IN (${PORTFOLIO_SLUGS.map(() => '?').join(',')})
     ORDER BY a.current_value DESC`,
    [userId, ...PORTFOLIO_SLUGS],
  );
  const map = new Map<string, { query: string; holdings: Set<string> }>();
  const add = (query: string, name: string) => {
    if (!query.trim()) return;
    const key = query.toLowerCase();
    if (!map.has(key)) map.set(key, { query, holdings: new Set() });
    map.get(key)!.holdings.add(name);
  };
  for (const r of rows) {
    if (r.slug === 'equity') add(`${cleanCompany(r.name)} share price`, r.name);
    else if (r.slug === 'mutual_fund') add(`${cleanCompany(r.name)} fund`, r.name);
    else add('gold price india', r.name); // digital/physical gold + SGB share one query
  }
  // Cap the number of network calls; holdings are value-sorted so the biggest win.
  return [...map.values()].slice(0, 8).map((v) => ({ query: v.query, holdings: [...v.holdings] }));
};

/** Parse a Google News RSS search result, cleaning the "Title - Publisher" form. */
const parseGoogleNews = (xml: string, holdings: string[]): FeedItem[] => {
  const items: FeedItem[] = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of matches) {
    let title = tag(block, 'title');
    if (!title) continue;
    const link = tag(block, 'link');
    const pub = tag(block, 'pubDate');
    let published: string | null = null;
    const d = pub ? new Date(pub) : null;
    if (d && !isNaN(d.getTime())) published = d.toISOString();

    let source = tag(block, 'source') || '';
    // Google News appends " - Publisher" to titles; pull it off for a clean title.
    const dash = title.lastIndexOf(' - ');
    if (dash > 0) {
      const pubName = title.slice(dash + 3).trim();
      if (!source) source = pubName;
      title = title.slice(0, dash).trim();
    }
    if (!source) source = 'Google News';

    items.push({
      id: link || `${source}-${title.slice(0, 40)}`,
      title,
      link,
      source,
      published,
      summary: tag(block, 'description').slice(0, 200),
      holdings,
    });
  }
  return items;
};

/**
 * Fetch news that actually mentions the user's holdings, via per-holding Google
 * News searches. Each item is tagged with the holding(s) it relates to. Falls
 * back to the generic market feed when the user has no market holdings, and to
 * the cache when offline.
 */
export const fetchPortfolioNews = async (userId: string): Promise<FeedItem[]> => {
  try {
    const queries = buildPortfolioQueries(userId);
    if (!queries.length) return fetchWealthFeed(); // no holdings → broad market news

    const results = await Promise.all(
      queries.map(async ({ query, holdings }) => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        try {
          const url = `${GOOGLE_NEWS_SEARCH}?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
          const res = await fetch(url, {
            signal: ctrl.signal,
            headers: { 'User-Agent': YAHOO_UA, Accept: 'application/rss+xml, application/xml, text/xml' },
          });
          if (!res.ok) return [];
          const xml = await res.text();
          return parseGoogleNews(xml, holdings).slice(0, 6); // freshest few per holding
        } catch {
          return [];
        } finally {
          clearTimeout(timer);
        }
      }),
    );

    // Merge, de-dupe by title (merging holding tags), sort newest-first.
    const byKey = new Map<string, FeedItem>();
    for (const list of results) {
      for (const it of list) {
        const key = it.title.toLowerCase().slice(0, 60);
        const existing = byKey.get(key);
        if (existing) {
          existing.holdings = [...new Set([...(existing.holdings ?? []), ...(it.holdings ?? [])])];
        } else {
          byKey.set(key, it);
        }
      }
    }
    const merged = [...byKey.values()].sort((a, b) => (b.published ?? '').localeCompare(a.published ?? ''));
    const top = merged.slice(0, 40);

    if (top.length) {
      try {
        run('INSERT OR REPLACE INTO market_cache (key, value, updated_at) VALUES (?, ?, ?)', [
          'feed',
          JSON.stringify(top),
          nowISO(),
        ]);
      } catch { /* best-effort */ }
      return top;
    }
    // Targeted search returned nothing (offline / rate-limited) — use cache, then generic.
    const cached = getCachedFeed();
    return cached.length ? cached : fetchWealthFeed();
  } catch {
    return [];
  }
};
