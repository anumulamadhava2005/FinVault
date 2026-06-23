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
import { first, run } from '../db';
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
  const [nifty, sensex, gold, fx] = await Promise.all([
    fetchYahooSeries('^NSEI'),
    fetchYahooSeries('^BSESN'),
    fetchYahooSeries('GC=F'),
    fetchYahooSeries('USDINR=X'),
  ]);

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
      try {
        const res = await fetch(url, { headers: { 'User-Agent': YAHOO_UA, Accept: 'application/rss+xml, application/xml, text/xml' } });
        if (!res.ok) return [];
        const xml = await res.text();
        return parseRss(xml, source);
      } catch {
        return [];
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
