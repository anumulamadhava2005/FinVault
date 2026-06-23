/**
 * News → portfolio impact analysis.
 *
 * Pure, offline heuristic engine: given a news headline + summary, it works out
 * which of the user's market holdings the story mentions, gauges the story's
 * sentiment from a finance lexicon, and estimates how much of the portfolio is
 * exposed. Feeds the News Impact flow-chart screen. No network / no LLM.
 */
import { all } from '../db';
import type { Asset } from '../models/types';

type Holding = Asset & { type_name: string; slug: string };

export type Sentiment = 'positive' | 'negative' | 'neutral';

export interface ImpactHolding {
  id: string;
  name: string;
  type_name: string;
  slug: string;
  value: number;       // paise
  weight_pct: number;  // % of total market holdings
  matched: string[];   // keywords from this holding found in the news
}

export interface NewsImpact {
  sentiment: Sentiment;
  sentiment_score: number;   // net signed lexicon hits
  matched_terms: string[];   // sentiment words found (deduped)
  affected: ImpactHolding[]; // sorted by value desc
  affected_value: number;    // paise
  exposure_pct: number;      // affected_value / total_market_value
  total_market_value: number;
  headline_summary: string;  // one-line plain-English takeaway
}

// ─── Lexicons ─────────────────────────────────────────────────────────────────

const POSITIVE = [
  'gain', 'gains', 'surge', 'surged', 'rally', 'rallies', 'rallied', 'jump', 'jumps', 'jumped',
  'rise', 'rises', 'rose', 'soar', 'soared', 'profit', 'profits', 'beat', 'beats', 'upgrade',
  'upgraded', 'growth', 'grew', 'record', 'boost', 'boosted', 'bull', 'bullish', 'outperform',
  'strong', 'strength', 'dividend', 'buyback', 'approval', 'approved', 'win', 'wins', 'deal',
  'partnership', 'acquire', 'acquisition', 'expansion', 'optimism', 'recovery', 'upbeat', 'high',
];
const NEGATIVE = [
  'fall', 'falls', 'fell', 'drop', 'drops', 'dropped', 'decline', 'declines', 'declined', 'loss',
  'losses', 'slump', 'slumped', 'crash', 'crashed', 'plunge', 'plunged', 'downgrade', 'downgraded',
  'cut', 'cuts', 'probe', 'fraud', 'scam', 'ban', 'banned', 'weak', 'weakness', 'miss', 'missed',
  'bearish', 'bear', 'selloff', 'lawsuit', 'fine', 'penalty', 'default', 'layoff', 'layoffs',
  'warning', 'warns', 'concern', 'concerns', 'slowdown', 'recession', 'tumble', 'tumbled', 'sink',
  'sank', 'downturn', 'pressure', 'halt', 'halted', 'recall', 'recalled', 'low', 'lows',
];

// Words too generic to identify a specific holding.
const GENERIC = new Set([
  'fund', 'funds', 'gold', 'bank', 'india', 'indian', 'index', 'bond', 'bonds', 'plan', 'direct',
  'regular', 'growth', 'large', 'small', 'mid', 'midcap', 'cap', 'ltd', 'limited', 'company', 'co',
  'mutual', 'equity', 'capital', 'value', 'asset', 'assets', 'shares', 'stock', 'stocks', 'nifty',
  'sensex', 'corporation', 'industries', 'finance', 'financial', 'services', 'group', 'holdings',
]);

const MARKET_SLUGS = ['equity', 'mutual_fund', 'digital_gold', 'physical_gold', 'sgb'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const countHits = (text: string, words: string[]): { score: number; hits: string[] } => {
  const hits: string[] = [];
  for (const w of words) {
    const re = new RegExp(`\\b${w}\\b`, 'i');
    if (re.test(text)) hits.push(w);
  }
  return { score: hits.length, hits };
};

/** Keyword set that identifies a holding (name words ≥4 chars + bare ticker). */
const holdingKeywords = (h: Holding): string[] => {
  const set = new Set<string>();
  for (const w of (h.name || '').split(/\s+/)) {
    const c = w.replace(/[^A-Za-z]/g, '').toLowerCase();
    if (c.length >= 4 && !GENERIC.has(c)) set.add(c);
  }
  if (h.ticker) {
    const t = h.ticker.replace(/\..*$/, '').toLowerCase();
    if (t.length >= 3 && !GENERIC.has(t)) set.add(t);
  }
  return [...set];
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export const analyzeNewsImpact = (
  userId: string,
  title: string,
  summary: string,
  seedNames: string[] = [],
): NewsImpact => {
  const text = `${title} ${summary}`.toLowerCase();
  const seeds = new Set(seedNames.map((n) => n.toLowerCase()));

  // Sentiment.
  const pos = countHits(text, POSITIVE);
  const neg = countHits(text, NEGATIVE);
  const score = pos.score - neg.score;
  const sentiment: Sentiment = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';

  // Holdings universe (market-driven types).
  const holdings = all<Holding>(
    `SELECT a.*, t.name AS type_name, t.slug AS slug FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id
     WHERE a.user_id = ? AND t.slug IN (${MARKET_SLUGS.map(() => '?').join(',')})`,
    [userId, ...MARKET_SLUGS],
  );
  const total_market_value = holdings.reduce((s, h) => s + h.current_value, 0);

  const affected: ImpactHolding[] = [];
  for (const h of holdings) {
    let matched = holdingKeywords(h).filter((k) => new RegExp(`\\b${k}\\b`, 'i').test(text));
    // A holding the story was explicitly fetched for is always included, even if
    // the headline phrases its name differently than how it's stored.
    if (!matched.length && seeds.has(h.name.toLowerCase())) matched = ['mentioned'];
    if (matched.length) {
      affected.push({
        id: h.id,
        name: h.name,
        type_name: h.type_name,
        slug: h.slug,
        value: h.current_value,
        weight_pct: total_market_value ? Number(((h.current_value / total_market_value) * 100).toFixed(1)) : 0,
        matched,
      });
    }
  }
  affected.sort((a, b) => b.value - a.value);

  const affected_value = affected.reduce((s, a) => s + a.value, 0);
  const exposure_pct = total_market_value ? Number(((affected_value / total_market_value) * 100).toFixed(1)) : 0;

  // Plain-English takeaway.
  let headline_summary: string;
  if (!affected.length) {
    headline_summary = 'No direct mention of your holdings was detected, but broad market news can still move your portfolio.';
  } else {
    const names = affected.slice(0, 3).map((a) => a.name).join(', ');
    const dir = sentiment === 'positive' ? 'a potential tailwind for' : sentiment === 'negative' ? 'a potential headwind for' : 'relevant to';
    headline_summary = `This story looks like ${dir} ${names}${affected.length > 3 ? ` and ${affected.length - 3} more` : ''}, covering ${exposure_pct}% of your market holdings.`;
  }

  return {
    sentiment,
    sentiment_score: score,
    matched_terms: [...pos.hits, ...neg.hits],
    affected,
    affected_value,
    exposure_pct,
    total_market_value,
    headline_summary,
  };
};
