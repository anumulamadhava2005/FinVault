/**
 * Per-asset market data: today's gain/loss and a month-by-month value series.
 *
 * Live where possible (Yahoo Finance for equity/gold, mfapi.in for mutual funds)
 * and modeled from invested→current for non-market assets. Results are cached in
 * `market_cache` (key `asset:<id>`) so the dashboard/detail screens read them
 * synchronously and still work offline. Series always end at "today".
 */
import { all, first, run } from '../db';
import type { Asset } from '../models/types';
import { nowISO, todayISO, parseISO, monthsBetween } from '../utils/date';
import { fetchYahooChart } from '../utils/yahoo';
import { nseQuote } from '../api/assets/nseApi';

type AssetRow = Asset & { type_name: string; slug: string };

const TROY_OZ_TO_GRAMS = 31.1035;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface AssetMarket {
  asset_id: string;
  day_change_pct: number;
  day_change_value: number;            // paise gained/lost today
  monthly: { labels: string[]; values: number[] }; // value in paise, month-end → today
  source: string;
  modeled: boolean;
  updated_at: string;
}

const LIVE_SLUGS = new Set(['equity', 'mutual_fund', 'digital_gold', 'physical_gold']);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const monthEndCloses = (timestamps: number[], closes: number[]): { label: string; value: number }[] => {
  const byMonth = new Map<string, { label: string; value: number }>();
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    const d = new Date(timestamps[i] * 1000);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    byMonth.set(key, { label: MONTHS[d.getMonth()], value: c }); // last seen per month = latest
  }
  return [...byMonth.values()];
};

async function yahooDaily(symbol: string): Promise<{ closes: { label: string; value: number }[]; price: number; prevClose: number } | null> {
  const data = await fetchYahooChart(symbol, '1y');
  if (!data) return null;
  return { closes: monthEndCloses(data.timestamps, data.closes), price: data.price, prevClose: data.prevClose };
}

async function usdInr(): Promise<number> {
  const data = await fetchYahooChart('USDINR=X', '1d');
  return data?.price ?? 83;
}

/** Last 13 month-end values + today, scaled to the asset's quantity (paise). */
const buildMonthly = (closes: { label: string; value: number }[], qty: number, latestPrice: number): { labels: string[]; values: number[] } => {
  const recent = closes.slice(-13);
  const labels = recent.map((c) => c.label);
  const values = recent.map((c) => Math.round(qty * c.value * 100));
  // Ensure the final point reflects today's price.
  if (values.length) values[values.length - 1] = Math.round(qty * latestPrice * 100);
  return { labels, values };
};

// ─── Modeled series (non-market or fallback) ─────────────────────────────────

/** Smooth monthly value curve from invested (at start) → current (today). */
export const modeledMonthly = (asset: Asset): { labels: string[]; values: number[] } => {
  const start = parseISO(asset.investment_date ?? asset.purchase_date) ?? parseISO(asset.created_at);
  const t = new Date(todayISO() + 'T00:00:00');
  const n = start ? Math.min(Math.max(monthsBetween(start, t), 1), 12) : 1;
  const invested = asset.invested_amount || asset.current_value || 0;
  const current = asset.current_value || invested;
  const labels: string[] = [];
  const values: number[] = [];
  for (let i = 0; i <= n; i++) {
    const d = new Date(t.getFullYear(), t.getMonth() - (n - i), 1);
    labels.push(MONTHS[d.getMonth()]);
    const frac = n === 0 ? 1 : i / n;
    const v = invested > 0 ? invested * Math.pow(current / invested, frac) : current;
    values.push(Math.round(v));
  }
  return { labels, values };
};

// ─── Gold purity ─────────────────────────────────────────────────────────────

/**
 * Returns the purity multiplier (0..1) for a gold asset relative to 24K.
 * Reads `purity` (karats) from details_json; falls back to parsing "22K" / "24K"
 * from the asset name; defaults to 1.0 (24K pure) when not determinable.
 */
const goldPurityFactor = (asset: AssetRow): number => {
  if (asset.slug === 'digital_gold') return 1.0; // digital gold is always 24K
  try {
    const dj = asset.details_json ? JSON.parse(asset.details_json) : null;
    if (dj?.purity && typeof dj.purity === 'number') return Math.min(dj.purity, 24) / 24;
  } catch { /* ignore */ }
  const m = asset.name.match(/\b(\d{2})K\b/i);
  if (m) return Math.min(Number(m[1]), 24) / 24;
  return 1.0;
};

// ─── Fetch + cache ───────────────────────────────────────────────────────────

const cacheKey = (id: string) => `asset:${id}`;

const writeCache = (m: AssetMarket) => {
  try {
    run('INSERT OR REPLACE INTO market_cache (key, value, updated_at) VALUES (?, ?, ?)', [cacheKey(m.asset_id), JSON.stringify(m), m.updated_at]);
  } catch { /* best-effort */ }
};

async function fetchOne(asset: AssetRow, fx: number): Promise<AssetMarket> {
  console.log(`[fetch] Asset market data for: "${asset.name}" (${asset.slug}, id=${asset.id})`);
  const qty = asset.quantity || 0;
  const modeledResult = (): AssetMarket => ({
    asset_id: asset.id,
    day_change_pct: 0,
    day_change_value: 0,
    monthly: modeledMonthly(asset),
    source: 'modeled',
    modeled: true,
    updated_at: nowISO(),
  });

  try {
    if ((asset.slug === 'equity') && asset.ticker) {
      const sym = asset.ticker.includes('.') ? asset.ticker : `${asset.ticker}.NS`;
      // Strip .NS — NSE direct API uses bare symbols (e.g. 'RELIANCE', not 'RELIANCE.NS')
      const nseSym = sym.endsWith('.NS') ? sym.slice(0, -3) : sym.endsWith('.BO') ? null : sym;
      // Fetch NSE (reliable prevClose) + Yahoo (historical monthly series) in parallel.
      const [nse, d] = await Promise.all([
        nseSym ? nseQuote(nseSym) : Promise.resolve(null),
        yahooDaily(sym),
      ]);
      if (nse && qty > 0) {
        const prevClose = nse.previousClose;
        return {
          asset_id: asset.id,
          day_change_pct: Number(nse.pChange.toFixed(2)),
          day_change_value: prevClose ? Math.round(qty * (nse.lastPrice - prevClose) * 100) : 0,
          monthly: d ? buildMonthly(d.closes, qty, nse.lastPrice) : buildMonthly([], qty, nse.lastPrice),
          source: `NSE · ${nseSym}`,
          modeled: false,
          updated_at: nowISO(),
        };
      }
      // Fallback: Yahoo Finance (prevClose from chartPreviousClose metadata)
      if (d && qty > 0) {
        return {
          asset_id: asset.id,
          day_change_pct: d.prevClose ? Number((((d.price - d.prevClose) / d.prevClose) * 100).toFixed(2)) : 0,
          day_change_value: Math.round(qty * (d.price - d.prevClose) * 100),
          monthly: buildMonthly(d.closes, qty, d.price),
          source: `Yahoo · ${sym}`,
          modeled: false,
          updated_at: nowISO(),
        };
      }
    } else if (asset.slug === 'mutual_fund') {
      let code: number | undefined;
      try {
        const dj = asset.details_json ? JSON.parse(asset.details_json) : null;
        if (dj?._mfapi_scheme_code) code = dj._mfapi_scheme_code;
      } catch { /* ignore */ }
      // Hard 10-second timeout on mfapi.in — community service, can be slow
      const mfCtrl = new AbortController();
      const mfTimer = setTimeout(() => mfCtrl.abort(), 10_000);
      try {
        if (!code) {
          const mfSearchUrl = `https://api.mfapi.in/mf/search?q=${encodeURIComponent(asset.name)}`;
          console.log(`[fetch] MF search: ${mfSearchUrl}`);
          const sres = await fetch(mfSearchUrl, { signal: mfCtrl.signal });
          if (sres.ok) {
            const list: { schemeCode: number }[] = await sres.json();
            code = list?.[0]?.schemeCode;
          }
          // Retry with simplified name if first search returned nothing.
          if (!code) {
            const simplified = asset.name
              .replace(/\b(fund|direct|growth|regular|plan|option|idcw|dividend|bonus)\b\.?/gi, '')
              .replace(/\s{2,}/g, ' ')
              .trim();
            if (simplified && simplified !== asset.name) {
              const retryUrl = `https://api.mfapi.in/mf/search?q=${encodeURIComponent(simplified)}`;
              console.log(`[fetch] MF search retry: ${retryUrl}`);
              const sres2 = await fetch(retryUrl, { signal: mfCtrl.signal });
              if (sres2.ok) {
                const list2: { schemeCode: number }[] = await sres2.json();
                code = list2?.[0]?.schemeCode;
              }
            }
          }
        }
        if (code && qty > 0) {
          const mfNavUrl = `https://api.mfapi.in/mf/${code}`;
          console.log(`[fetch] MF NAV: ${mfNavUrl}`);
          const nres = await fetch(mfNavUrl, { signal: mfCtrl.signal });
          if (nres.ok) {
            const nj: any = await nres.json();
            const data: { date: string; nav: string }[] = nj?.data ?? [];
            if (data.length) {
              const latest = parseFloat(data[0].nav);
              const prev = parseFloat(data[1]?.nav ?? data[0].nav);
              const byMonth = new Map<string, { label: string; value: number }>();
              for (const row of data) {
                const [, mm, yyyy] = row.date.split('-');
                const key = `${yyyy}-${mm}`;
                if (!byMonth.has(key)) byMonth.set(key, { label: MONTHS[Number(mm) - 1], value: parseFloat(row.nav) });
              }
              const ordered = [...byMonth.values()].reverse();
              clearTimeout(mfTimer);
              return {
                asset_id: asset.id,
                day_change_pct: prev ? Number((((latest - prev) / prev) * 100).toFixed(2)) : 0,
                day_change_value: Math.round(qty * (latest - prev) * 100),
                monthly: buildMonthly(ordered, qty, latest),
                source: 'AMFI via mfapi.in',
                modeled: false,
                updated_at: nowISO(),
              };
            }
          }
        }
      } finally {
        clearTimeout(mfTimer);
      }
    } else if (asset.slug === 'digital_gold' || asset.slug === 'physical_gold') {
      // qty is in grams. GOLDBEES (Nippon India Gold BeES) = 0.01 g/unit,
      // so price × 100 = ₹/gram (24K equivalent). NSE gives actual exchange previousClose
      // (not Yahoo's dividend-adjusted historical series), fixing false +45% swings.
      // Physical gold (jewelry, coins) must be discounted by purity: 22K = 22/24, etc.
      const purityFactor = goldPurityFactor(asset);
      const [goldbees, gld1y] = await Promise.all([
        nseQuote('GOLDBEES'),
        yahooDaily('GOLDBEES.NS'),
      ]);
      if (goldbees && qty > 0) {
        const priceInr = goldbees.lastPrice * 100 * purityFactor;
        const prevInr = goldbees.previousClose * 100 * purityFactor;
        const closesInr = gld1y
          ? gld1y.closes.map((c) => ({ label: c.label, value: c.value * 100 * purityFactor }))
          : [];
        const sourceLabel = purityFactor < 1
          ? `NSE · GOLDBEES (×${purityFactor.toFixed(4)} purity)`
          : 'NSE · GOLDBEES';
        return {
          asset_id: asset.id,
          day_change_pct: Number(goldbees.pChange.toFixed(2)),
          day_change_value: Math.round(qty * (priceInr - prevInr) * 100),
          monthly: buildMonthly(closesInr, qty, priceInr),
          source: sourceLabel,
          modeled: false,
          updated_at: nowISO(),
        };
      }
      // Fallback: COMEX GC=F × USDINR (absolute price ~15–20% below MCX;
      // day-change % is accurate because USDINR cancels in the ratio).
      const d = await yahooDaily('GC=F');
      if (d && qty > 0) {
        const toInrGram = (usdOz: number) => (usdOz / TROY_OZ_TO_GRAMS) * fx * purityFactor;
        const priceInr = toInrGram(d.price);
        const prevInr = toInrGram(d.prevClose);
        const closesInr = d.closes.map((c) => ({ label: c.label, value: toInrGram(c.value) }));
        return {
          asset_id: asset.id,
          day_change_pct: prevInr ? Number((((priceInr - prevInr) / prevInr) * 100).toFixed(2)) : 0,
          day_change_value: Math.round(qty * (priceInr - prevInr) * 100),
          monthly: buildMonthly(closesInr, qty, priceInr),
          source: 'Yahoo · GC=F (COMEX)',
          modeled: false,
          updated_at: nowISO(),
        };
      }
    }
  } catch { /* fall through to modeled */ }

  return modeledResult();
}

/** Refresh + cache market data for all of a user's assets. */
export const refreshAssetMarket = async (userId: string): Promise<void> => {
  const assets = all<AssetRow>(
    `SELECT a.*, t.name AS type_name, t.slug AS slug FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id WHERE a.user_id = ?`,
    [userId],
  );
  const needsFx = assets.some((a) => a.slug === 'digital_gold' || a.slug === 'physical_gold');
  const fx = needsFx ? await usdInr() : 83;
  for (const a of assets) {
    // Only hit the network for live-capable types; others are modeled (cheap).
    if (LIVE_SLUGS.has(a.slug)) {
      writeCache(await fetchOne(a, fx));
    } else {
      writeCache({
        asset_id: a.id,
        day_change_pct: 0,
        day_change_value: 0,
        monthly: modeledMonthly(a),
        source: 'modeled',
        modeled: true,
        updated_at: nowISO(),
      });
    }
  }
};

export const getAssetMarket = (assetId: string): AssetMarket | null => {
  try {
    const row = first<{ value: string }>('SELECT value FROM market_cache WHERE key = ?', [cacheKey(assetId)]);
    return row ? (JSON.parse(row.value) as AssetMarket) : null;
  } catch {
    return null;
  }
};

// ─── Dashboard aggregates ────────────────────────────────────────────────────

export interface Mover {
  id: string;
  name: string;
  type_name: string;
  slug: string;
  current: number;
  change: number; // paise today
  pct: number;
}

export const todayMovers = (userId: string) => {
  const assets = all<AssetRow>(
    `SELECT a.*, t.name AS type_name, t.slug AS slug FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id WHERE a.user_id = ?`,
    [userId],
  );
  let totalValue = 0;
  let todayChange = 0;
  let haveData = false;
  // Oldest live quote time across all market assets (= most stale price)
  let lastPriceAt: string | null = null;
  const rows: Mover[] = assets.map((a) => {
    totalValue += a.current_value;
    const m = getAssetMarket(a.id);
    if (m && !m.modeled) {
      haveData = true;
      if (!lastPriceAt || m.updated_at < lastPriceAt) lastPriceAt = m.updated_at;
    }
    const change = m ? m.day_change_value : 0;
    todayChange += change;
    return { id: a.id, name: a.name, type_name: a.type_name, slug: a.slug, current: a.current_value, change, pct: m ? m.day_change_pct : 0 };
  });
  const yesterday = totalValue - todayChange;
  return {
    totalValue,
    todayChange,
    todayChangePct: yesterday ? Number(((todayChange / yesterday) * 100).toFixed(2)) : 0,
    gainers: rows.filter((r) => r.change > 0).sort((a, b) => b.change - a.change).slice(0, 5),
    losers: rows.filter((r) => r.change < 0).sort((a, b) => a.change - b.change).slice(0, 5),
    haveData,
    lastPriceAt,
  };
};

// ─── Daily movement (1D return) ──────────────────────────────────────────────

export interface DailyHolding {
  id: string;
  name: string;
  type_name: string;
  slug: string;
  quantity: number;
  current: number; // paise
  change: number;  // paise today
  pct: number;     // % today
}

export interface DailyMovementResult {
  as_of: string;        // ISO datetime of the latest live quote (or now)
  total_value: number;  // paise — sum of market-holding current values
  day_change: number;   // paise
  day_change_pct: number;
  count: number;
  have_data: boolean;
  holdings: DailyHolding[]; // sorted by |change| desc
}

/**
 * 1D return across the user's market-driven holdings (equity, mutual funds,
 * gold) — the universe whose value actually moves day-to-day. Self-consistent:
 * the header total equals the sum of the listed holdings' changes.
 */
export const dailyMovement = (userId: string): DailyMovementResult => {
  const assets = all<AssetRow>(
    `SELECT a.*, t.name AS type_name, t.slug AS slug FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id
     WHERE a.user_id = ? AND t.slug IN ('equity','mutual_fund','digital_gold','physical_gold')
     ORDER BY a.current_value DESC`,
    [userId],
  );
  let total_value = 0;
  let day_change = 0;
  let have_data = false;
  let latest = '';
  const holdings: DailyHolding[] = assets.map((a) => {
    const m = getAssetMarket(a.id);
    if (m && !m.modeled) {
      have_data = true;
      if (m.updated_at > latest) latest = m.updated_at;
    }
    const change = m ? m.day_change_value : 0;
    total_value += a.current_value;
    day_change += change;
    return {
      id: a.id,
      name: a.name,
      type_name: a.type_name,
      slug: a.slug,
      quantity: a.quantity || 0,
      current: a.current_value,
      change,
      pct: m ? m.day_change_pct : 0,
    };
  });
  holdings.sort((x, y) => Math.abs(y.change) - Math.abs(x.change));
  const prev = total_value - day_change;
  return {
    as_of: latest || nowISO(),
    total_value,
    day_change,
    day_change_pct: prev ? Number(((day_change / prev) * 100).toFixed(2)) : 0,
    count: holdings.length,
    have_data,
    holdings,
  };
};

/** Equity + mutual-fund holdings with today's change, for the dashboard list. */
export const marketHoldings = (userId: string): Mover[] => {
  const assets = all<AssetRow>(
    `SELECT a.*, t.name AS type_name, t.slug AS slug FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id
     WHERE a.user_id = ? AND t.slug IN ('equity','mutual_fund') ORDER BY a.current_value DESC`,
    [userId],
  );
  return assets.map((a) => {
    const m = getAssetMarket(a.id);
    return {
      id: a.id, name: a.name, type_name: a.type_name, slug: a.slug, current: a.current_value,
      change: m ? m.day_change_value : 0, pct: m ? m.day_change_pct : 0,
    };
  });
};
