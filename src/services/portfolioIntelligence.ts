/**
 * Portfolio Intelligence engine — the analysis layer that turns raw holdings
 * into actionable insight (Dezerv-style). Pure functions over SQLite rows.
 *
 * Provides: true money-weighted returns (XIRR), per-holding benchmark
 * comparison + missed-gains, hidden-cost (TER) detection, diversification /
 * concentration / over-diversification analysis, risk-exposure alignment,
 * SIP discipline, a composite Portfolio Health Score, hold/exit suggestions,
 * a daily insights feed, and a retirement projection.
 *
 * Money is paise; annualised returns are plain percent numbers.
 */
import { all, first } from '../db';
import type { Asset } from '../models/types';
import { parseISO, todayISO, monthsBetween } from '../utils/date';
import { calcCAGR } from '../utils/cagr';
import { RISK_TARGET } from './constants';
import { getLiveBenchmarks } from './marketFeeds';

const today = () => new Date(todayISO() + 'T00:00:00');

// ─── Asset-class mapping ─────────────────────────────────────────────────────

export type AssetClass = 'equity' | 'debt' | 'gold' | 'real_estate' | 'other';

const CLASS_BY_SLUG: Record<string, AssetClass> = {
  equity: 'equity',
  mutual_fund: 'equity',
  fd: 'debt',
  ppf: 'debt',
  digital_gold: 'gold',
  physical_gold: 'gold',
  sgb: 'gold',
  real_estate: 'real_estate',
  nps: 'equity', // market-linked, long-horizon growth instrument
  savings: 'debt', // cash / liquid sits in the fixed bucket
};
export const CLASS_LABEL: Record<AssetClass, string> = {
  equity: 'Equity',
  debt: 'Debt / Fixed',
  gold: 'Gold',
  real_estate: 'Real Estate',
  other: 'Other',
};
const classOf = (slug: string): AssetClass => CLASS_BY_SLUG[slug] ?? 'other';

// Long-term category benchmarks (annualised %). Static, India-typical figures —
// used as a reference when no live benchmark feed is available.
const CATEGORY_BENCHMARK: Record<string, { name: string; annual: number }> = {
  equity: { name: 'Nifty 50 TRI', annual: 13 },
  mutual_fund: { name: 'Equity MF category avg', annual: 12 },
  fd: { name: 'Bank FD average', annual: 6.5 },
  ppf: { name: 'PPF rate', annual: 7.1 },
  sgb: { name: 'Gold + 2.5% coupon', annual: 9.5 },
  digital_gold: { name: 'Gold price', annual: 9 },
  physical_gold: { name: 'Gold price', annual: 9 },
  real_estate: { name: 'Real-estate average', annual: 8 },
  nps: { name: 'NPS blended (E+C+G)', annual: 10 },
  savings: { name: 'Savings-account rate', annual: 3.5 },
};

/**
 * Benchmark for a slug, blended with the live market feed where available
 * (gold uses the live trailing gold return; equity/MF nudge toward the live
 * Nifty trailing return, capped so a single weak/strong year can't dominate a
 * long-horizon comparison).
 */
const benchmarkFor = (slug: string) => {
  const base = CATEGORY_BENCHMARK[slug] ?? { name: 'Balanced benchmark', annual: 8 };
  const live = getLiveBenchmarks();
  if (!live) return base;
  if ((slug === 'digital_gold' || slug === 'physical_gold' || slug === 'sgb') && live.gold1y != null) {
    const annual = slug === 'sgb' ? live.gold1y + 2.5 : live.gold1y;
    return { name: `${base.name} (live)`, annual: Number(annual.toFixed(1)) };
  }
  if ((slug === 'equity' || slug === 'mutual_fund') && live.equity1y != null) {
    // Blend live 1y with the long-term figure (70/30) to stay fair.
    const annual = base.annual * 0.7 + live.equity1y * 0.3;
    return { name: `${base.name} (live-blended)`, annual: Number(annual.toFixed(1)) };
  }
  return base;
};

// Typical Total Expense Ratio (annual %) when the user hasn't recorded one.
// Mutual funds assume a *regular* plan; direct plans are ~0.7%.
const DEFAULT_TER: Record<string, number> = {
  mutual_fund: 1.5,
  equity: 0.1,
  digital_gold: 0.5,
  physical_gold: 0,
  sgb: 0,
  fd: 0,
  ppf: 0,
  real_estate: 0,
  nps: 0.09,
  savings: 0,
};
const DIRECT_PLAN_TER = 0.7;

// ─── Enriched asset loader ───────────────────────────────────────────────────

interface EnrichedAsset extends Asset {
  type_name: string;
  slug: string;
  years: number;
  annual_return: number; // XIRR if computable, else CAGR
  cls: AssetClass;
  ter: number; // effective TER %
}

const loadAssets = (userId: string): EnrichedAsset[] => {
  const rows = all<Asset & { type_name: string; slug: string }>(
    `SELECT a.*, t.name AS type_name, t.slug AS slug FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id WHERE a.user_id = ?`,
    [userId],
  );
  const t = today();
  return rows.map((a) => {
    const start = parseISO(a.investment_date ?? a.purchase_date);
    const months = start ? Math.max(monthsBetween(start, t), 0) : 0;
    const years = Math.max(months / 12, 0);
    const ret = assetAnnualReturn(a, start, t);
    let ter = DEFAULT_TER[a.slug] ?? 0;
    try {
      const d = a.details_json ? JSON.parse(a.details_json) : null;
      if (d && d.expense_ratio != null && !isNaN(parseFloat(d.expense_ratio))) {
        ter = parseFloat(d.expense_ratio);
      }
    } catch { /* ignore */ }
    return { ...a, years, annual_return: ret, cls: classOf(a.slug), ter };
  });
};

// ─── XIRR ────────────────────────────────────────────────────────────────────

export interface CashFlow { when: Date; amount: number }

/** Money-weighted annualised return (%). Bisection — never diverges. */
export const xirr = (cashflows: CashFlow[]): number | null => {
  if (cashflows.length < 2) return null;
  const t0 = cashflows[0].when.getTime();
  const yf = (d: Date) => (d.getTime() - t0) / (365 * 86_400_000);
  const npv = (rate: number) =>
    cashflows.reduce((s, cf) => s + cf.amount / Math.pow(1 + rate, yf(cf.when)), 0);

  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  let fhi = npv(hi);
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1) return Number((mid * 100).toFixed(2));
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return Number((((lo + hi) / 2) * 100).toFixed(2));
};

/** Build cashflows for a single asset and return its annualised return. */
const assetAnnualReturn = (a: Asset, start: Date | null, t: Date): number => {
  if (!start || a.invested_amount <= 0) return 0;
  const months = Math.max(monthsBetween(start, t), 0);
  if (a.is_sip && a.sip_monthly_amount > 0 && months >= 1) {
    const flows: CashFlow[] = [];
    const totalSip = a.sip_monthly_amount * months;
    const lump = a.invested_amount - totalSip;
    const monthly = lump > 0 ? a.sip_monthly_amount : Math.round(a.invested_amount / months);
    if (lump > 0) flows.push({ when: start, amount: -lump });
    for (let i = 0; i < months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, start.getDate());
      if (d < t) flows.push({ when: d, amount: -monthly });
    }
    flows.push({ when: t, amount: a.current_value });
    const r = xirr(flows);
    if (r != null) return r;
  }
  // Lump-sum (or fallback): money-weighted == CAGR.
  return calcCAGR(a.current_value, a.invested_amount, a.investment_date ?? a.purchase_date);
};

// ─── Returns summary ─────────────────────────────────────────────────────────

export const portfolioReturns = (userId: string) => {
  const assets = loadAssets(userId);
  const total_invested = assets.reduce((s, a) => s + a.invested_amount, 0);
  const total_value = assets.reduce((s, a) => s + a.current_value, 0);

  // Portfolio XIRR from all asset outflows + one final inflow today.
  const t = today();
  const flows: CashFlow[] = [];
  for (const a of assets) {
    const start = parseISO(a.investment_date ?? a.purchase_date);
    if (!start || a.invested_amount <= 0) continue;
    const months = Math.max(monthsBetween(start, t), 0);
    if (a.is_sip && a.sip_monthly_amount > 0 && months >= 1) {
      const totalSip = a.sip_monthly_amount * months;
      const lump = a.invested_amount - totalSip;
      const monthly = lump > 0 ? a.sip_monthly_amount : Math.round(a.invested_amount / months);
      if (lump > 0) flows.push({ when: start, amount: -lump });
      for (let i = 0; i < months; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, start.getDate());
        if (d < t) flows.push({ when: d, amount: -monthly });
      }
    } else {
      flows.push({ when: start, amount: -a.invested_amount });
    }
  }
  flows.push({ when: t, amount: total_value });
  flows.sort((x, y) => x.when.getTime() - y.when.getTime());

  return {
    total_invested,
    total_value,
    total_pnl: total_value - total_invested,
    portfolio_xirr: flows.length >= 2 ? xirr(flows) : null,
    holdings: assets
      .map((a) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        type_name: a.type_name,
        invested: a.invested_amount,
        current: a.current_value,
        annual_return: a.annual_return,
        years: Number(a.years.toFixed(1)),
      }))
      .sort((x, y) => y.current - x.current),
  };
};

// ─── Benchmark comparison + missed gains ─────────────────────────────────────

export const benchmarkAnalysis = (userId: string) => {
  const assets = loadAssets(userId);
  const rows = assets.map((a) => {
    const bench = benchmarkFor(a.slug);
    const years = Math.max(a.years, 0.5);
    const matured = a.years >= 0.5;
    const delta = Number((a.annual_return - bench.annual).toFixed(2));
    // What the holding *could* be worth growing at the benchmark.
    const benchValue = a.invested_amount * Math.pow(1 + bench.annual / 100, years);
    const missed = matured ? Math.max(Math.round(benchValue - a.current_value), 0) : 0;
    const underperforming = matured && delta < -1.5;
    return {
      id: a.id,
      name: a.name,
      slug: a.slug,
      type_name: a.type_name,
      current: a.current_value,
      annual_return: a.annual_return,
      benchmark_name: bench.name,
      benchmark_return: bench.annual,
      delta,
      years: Number(a.years.toFixed(1)),
      matured,
      underperforming,
      missed_gains: missed,
    };
  });
  const underperformers = rows.filter((r) => r.underperforming).sort((a, b) => a.delta - b.delta);
  const total_missed = underperformers.reduce((s, r) => s + r.missed_gains, 0);

  // Value-weighted blended benchmark XIRR across matured holdings — a single
  // figure to compare the whole portfolio's XIRR against.
  const maturedRows = rows.filter((r) => r.matured && r.current > 0);
  const totalCur = maturedRows.reduce((s, r) => s + r.current, 0);
  const blended_benchmark = totalCur
    ? Number((maturedRows.reduce((s, r) => s + r.benchmark_return * r.current, 0) / totalCur).toFixed(1))
    : 0;

  return {
    rows: rows.sort((a, b) => a.delta - b.delta),
    underperformers,
    total_missed_gains: total_missed,
    blended_benchmark,
  };
};

// ─── Hidden cost detection (TER) ─────────────────────────────────────────────

export const costAnalysis = (userId: string) => {
  const assets = loadAssets(userId);
  const rows = assets
    .filter((a) => a.ter > 0 && a.current_value > 0)
    .map((a) => {
      const annual_cost = Math.round((a.current_value * a.ter) / 100);
      const isRegularMf = a.slug === 'mutual_fund' && a.ter > DIRECT_PLAN_TER + 0.01;
      const potential_saving = isRegularMf
        ? Math.round((a.current_value * (a.ter - DIRECT_PLAN_TER)) / 100)
        : 0;
      return {
        id: a.id,
        name: a.name,
        slug: a.slug,
        ter: a.ter,
        annual_cost,
        high: a.ter >= 1.0,
        potential_saving,
      };
    })
    .sort((a, b) => b.annual_cost - a.annual_cost);
  return {
    rows,
    total_annual_cost: rows.reduce((s, r) => s + r.annual_cost, 0),
    potential_savings: rows.reduce((s, r) => s + r.potential_saving, 0),
    high_cost_count: rows.filter((r) => r.high).length,
  };
};

// ─── Diversification / concentration / overlap ───────────────────────────────

export const diversification = (userId: string) => {
  const assets = loadAssets(userId);
  const total = assets.reduce((s, a) => s + a.current_value, 0);
  const holdings = assets.filter((a) => a.current_value > 0);
  const top = holdings.slice().sort((a, b) => b.current_value - a.current_value)[0];
  const top_pct = total && top ? Number(((top.current_value / total) * 100).toFixed(1)) : 0;

  // Herfindahl–Hirschman Index across holdings (0–10000). Lower = more spread.
  const hhi = total
    ? Math.round(holdings.reduce((s, a) => s + Math.pow((a.current_value / total) * 100, 2), 0))
    : 0;

  const fundCount = holdings.filter((a) => a.slug === 'mutual_fund' || a.slug === 'equity').length;
  const tiny = holdings.filter((a) => total && a.current_value / total < 0.02).length;
  const over_diversified = fundCount > 15 || tiny >= 6;

  // Allocation by asset class.
  const byClass = new Map<AssetClass, number>();
  for (const a of holdings) byClass.set(a.cls, (byClass.get(a.cls) ?? 0) + a.current_value);
  const classes = [...byClass.entries()]
    .map(([cls, value]) => ({ cls, label: CLASS_LABEL[cls], value, pct: total ? Number(((value / total) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.value - a.value);

  // Score: breadth (#classes) + balance (penalise high HHI & top holding).
  const breadth = Math.min(classes.length / 4, 1) * 100;
  const balance = Math.max(0, 100 - Math.max(0, hhi - 2000) / 60 - Math.max(0, top_pct - 30) * 1.2);
  const score = Math.round(Math.max(0, Math.min(100, breadth * 0.4 + balance * 0.6)));

  return {
    score,
    hhi,
    top_holding: top?.name ?? '—',
    top_holding_pct: top_pct,
    holdings_count: holdings.length,
    fund_count: fundCount,
    over_diversified,
    classes,
    concentrated: top_pct > 25,
  };
};

// ─── Risk exposure vs ideal ──────────────────────────────────────────────────

export const riskExposure = (userId: string, riskProfile = 'moderate') => {
  const div = diversification(userId);
  const total = div.classes.reduce((s, c) => s + c.value, 0);
  const pctOf = (cls: AssetClass) => {
    const row = div.classes.find((c) => c.cls === cls);
    return row ? row.pct : 0;
  };
  const equity_pct = pctOf('equity');
  const debt_pct = pctOf('debt');
  const gold_pct = pctOf('gold');
  const target_equity = RISK_TARGET[riskProfile] ?? 50;

  // Ideal split per risk appetite.
  const IDEAL: Record<string, { equity: number; debt: number; gold: number }> = {
    conservative: { equity: 30, debt: 60, gold: 10 },
    moderate: { equity: 55, debt: 35, gold: 10 },
    aggressive: { equity: 75, debt: 18, gold: 7 },
  };
  const ideal = IDEAL[riskProfile] ?? IDEAL.moderate;
  const alignment = Math.max(0, Math.round(100 - Math.abs(equity_pct - target_equity) * 1.5));

  let recommendation: string;
  if (!total) recommendation = 'Add investments to assess your risk exposure.';
  else if (equity_pct > target_equity + 12)
    recommendation = `Equity is ${equity_pct}% vs a ${target_equity}% target for a ${riskProfile} profile — consider trimming equity into debt/gold to reduce volatility.`;
  else if (equity_pct < target_equity - 12)
    recommendation = `Equity is only ${equity_pct}% vs a ${target_equity}% target — you may be too conservative for long-term growth. Consider adding equity.`;
  else recommendation = `Your equity exposure (${equity_pct}%) is well aligned with a ${riskProfile} risk profile.`;

  return {
    equity_pct,
    debt_pct,
    gold_pct,
    other_pct: Math.max(0, Number((100 - equity_pct - debt_pct - gold_pct).toFixed(1))),
    target_equity,
    alignment_score: alignment,
    recommendation,
    bars: [
      { label: 'Equity', actual: equity_pct, ideal: ideal.equity },
      { label: 'Debt / Fixed', actual: debt_pct, ideal: ideal.debt },
      { label: 'Gold', actual: gold_pct, ideal: ideal.gold },
    ],
  };
};

// ─── SIP discipline ──────────────────────────────────────────────────────────

export const disciplineAnalysis = (userId: string) => {
  const assets = loadAssets(userId);
  const sipAssets = assets.filter((a) => a.is_sip && a.sip_monthly_amount > 0);
  const monthly_sip = sipAssets.reduce((s, a) => s + a.sip_monthly_amount, 0);
  const active = first<{ c: number; stepup: number }>(
    `SELECT COUNT(*) AS c, COALESCE(SUM(CASE WHEN annual_step_up_pct > 0 THEN 1 ELSE 0 END),0) AS stepup
     FROM sip_schedules WHERE user_id = ? AND status = 'active'`,
    [userId],
  );
  const active_sips = Math.max(active?.c ?? 0, sipAssets.length);
  const has_stepup = (active?.stepup ?? 0) > 0;

  let score = 0;
  if (active_sips > 0) score += 55;
  if (active_sips >= 3) score += 15;
  if (has_stepup) score += 15;
  const sipShare = assets.length ? sipAssets.length / assets.length : 0;
  score += Math.round(sipShare * 15);
  score = Math.min(100, score);

  let guidance: string;
  if (active_sips === 0)
    guidance = 'No active SIPs. Automating a monthly SIP is the single biggest driver of long-term discipline.';
  else if (!has_stepup)
    guidance = 'Good — SIPs are running. Add an annual step-up (10%) so contributions grow with your income.';
  else
    guidance = 'Excellent discipline: automated SIPs with an annual step-up. Stay invested through market cycles.';

  return { active_sips, monthly_sip, sip_assets: sipAssets.length, total_assets: assets.length, has_stepup, score, guidance };
};

// ─── Composite Portfolio Health Score ────────────────────────────────────────

const GRADE = (s: number) =>
  s >= 85 ? { grade: 'A', label: 'Excellent' }
  : s >= 70 ? { grade: 'B', label: 'Healthy' }
  : s >= 55 ? { grade: 'C', label: 'Fair' }
  : s >= 40 ? { grade: 'D', label: 'Needs Work' }
  : { grade: 'E', label: 'At Risk' };

export const portfolioHealth = (userId: string, riskProfile = 'moderate') => {
  const div = diversification(userId);
  const risk = riskExposure(userId, riskProfile);
  const cost = costAnalysis(userId);
  const ret = portfolioReturns(userId);
  const disc = disciplineAnalysis(userId);
  const bench = benchmarkAnalysis(userId);

  // Cost efficiency: penalise blended TER above ~0.75%.
  const blendedTer = ret.total_value
    ? (cost.total_annual_cost / ret.total_value) * 100
    : 0;
  const costScore = Math.round(Math.max(0, Math.min(100, 100 - Math.max(0, blendedTer - 0.5) * 60)));

  // Performance: portfolio XIRR vs an 11% blended benchmark.
  const x = ret.portfolio_xirr ?? 0;
  const perfScore = Math.round(Math.max(0, Math.min(100, 50 + (x - 11) * 5)));

  const subscores = {
    diversification: div.score,
    risk: risk.alignment_score,
    cost: costScore,
    performance: perfScore,
    discipline: disc.score,
  };
  const score = Math.round(
    subscores.diversification * 0.25 +
    subscores.risk * 0.25 +
    subscores.cost * 0.15 +
    subscores.performance * 0.20 +
    subscores.discipline * 0.15,
  );
  return { score: Math.max(1, Math.min(100, score)), ...GRADE(score), subscores, underperformer_count: bench.underperformers.length };
};

// ─── Hold / Exit suggestions ─────────────────────────────────────────────────

export interface HoldExit {
  id: string;
  name: string;
  action: 'hold' | 'add' | 'review' | 'trim' | 'exit';
  tone: 'good' | 'warn' | 'bad';
  reason: string;
}

export const holdExitSuggestions = (userId: string, riskProfile = 'moderate'): HoldExit[] => {
  const bench = benchmarkAnalysis(userId);
  const div = diversification(userId);
  const total = div.classes.reduce((s, c) => s + c.value, 0);
  const assetsById = new Map(loadAssets(userId).map((a) => [a.id, a]));
  const out: HoldExit[] = [];

  for (const r of bench.rows) {
    const a = assetsById.get(r.id);
    if (!a) continue;
    const holdingPct = total ? (a.current_value / total) * 100 : 0;

    if (r.underperforming && r.delta < -4) {
      out.push({ id: r.id, name: r.name, action: 'exit', tone: 'bad',
        reason: `Trailing ${r.benchmark_name} by ${Math.abs(r.delta)}%/yr over ${r.years}y — consider switching to a better performer.` });
    } else if (r.underperforming) {
      out.push({ id: r.id, name: r.name, action: 'review', tone: 'warn',
        reason: `Slightly below ${r.benchmark_name} (${r.delta}%/yr). Watch for another quarter before acting.` });
    } else if (holdingPct > 30) {
      out.push({ id: r.id, name: r.name, action: 'trim', tone: 'warn',
        reason: `${holdingPct.toFixed(0)}% of your portfolio sits in this one holding — trim to reduce concentration risk.` });
    } else if (r.matured && r.delta > 2) {
      out.push({ id: r.id, name: r.name, action: 'add', tone: 'good',
        reason: `Beating ${r.benchmark_name} by ${r.delta}%/yr — a quality compounder worth adding to.` });
    } else if (r.matured) {
      out.push({ id: r.id, name: r.name, action: 'hold', tone: 'good',
        reason: `Performing in line with its benchmark — stay invested.` });
    }
  }
  // Prioritise actionable items first.
  const order: Record<HoldExit['action'], number> = { exit: 0, trim: 1, review: 2, add: 3, hold: 4 };
  return out.sort((a, b) => order[a.action] - order[b.action]);
};

// ─── Daily insights feed ─────────────────────────────────────────────────────

export interface Insight {
  id: string;
  icon: string;
  tone: 'good' | 'warn' | 'bad' | 'info';
  title: string;
  body: string;
}

const inr = (paise: number) => `₹${Math.round((paise || 0) / 100).toLocaleString('en-IN')}`;

export const dailyInsights = (userId: string, riskProfile = 'moderate'): Insight[] => {
  const out: Insight[] = [];
  const ret = portfolioReturns(userId);
  if (ret.holdings.length === 0) {
    return [{ id: 'empty', icon: 'lightbulb-on-outline', tone: 'info', title: 'Start tracking your wealth',
      body: 'Add your mutual funds, stocks, FDs and gold to unlock personalised portfolio insights.' }];
  }
  const bench = benchmarkAnalysis(userId);
  const cost = costAnalysis(userId);
  const div = diversification(userId);
  const risk = riskExposure(userId, riskProfile);
  const disc = disciplineAnalysis(userId);

  if (ret.portfolio_xirr != null) {
    const good = ret.portfolio_xirr >= 11;
    out.push({ id: 'xirr', icon: good ? 'trending-up' : 'trending-down', tone: good ? 'good' : 'warn',
      title: `Your portfolio XIRR is ${ret.portfolio_xirr}%`,
      body: good
        ? 'You are beating a typical balanced benchmark (~11%). Stay the course.'
        : 'This trails a typical balanced benchmark (~11%). Review laggards below to close the gap.' });
  }
  if (bench.total_missed_gains > 0) {
    out.push({ id: 'missed', icon: 'cash-remove', tone: 'warn',
      title: `~${inr(bench.total_missed_gains)} in missed gains`,
      body: `${bench.underperformers.length} holding(s) have trailed their category benchmark. Switching laggards could have earned this much more.` });
  }
  if (cost.potential_savings > 0) {
    out.push({ id: 'cost', icon: 'sale', tone: 'warn',
      title: `Save ~${inr(cost.potential_savings)}/yr on fees`,
      body: `You appear to hold regular-plan funds. Switching to direct plans cuts the expense ratio and saves this every year.` });
  }
  if (div.concentrated) {
    out.push({ id: 'conc', icon: 'chart-donut', tone: 'warn',
      title: `${div.top_holding_pct}% is in one holding`,
      body: `${div.top_holding} dominates your portfolio. Trimming it reduces single-asset risk.` });
  }
  if (div.over_diversified) {
    out.push({ id: 'overdiv', icon: 'view-grid-plus', tone: 'warn',
      title: 'Possible over-diversification',
      body: `You hold ${div.fund_count} funds/stocks. Beyond ~12, extra funds rarely add value and are harder to track — consider consolidating.` });
  }
  out.push({ id: 'risk', icon: 'scale-balance', tone: risk.alignment_score >= 70 ? 'good' : 'warn',
    title: `Equity exposure: ${risk.equity_pct}%`, body: risk.recommendation });
  out.push({ id: 'disc', icon: 'calendar-sync', tone: disc.score >= 70 ? 'good' : 'info',
    title: `Investment discipline: ${disc.score}/100`, body: disc.guidance });

  const best = bench.rows.filter((r) => r.matured).sort((a, b) => b.delta - a.delta)[0];
  if (best && best.delta > 2) {
    out.push({ id: 'best', icon: 'star', tone: 'good',
      title: `${best.name} is a star performer`,
      body: `It is beating ${best.benchmark_name} by ${best.delta}%/yr — your best risk-adjusted compounder.` });
  }
  return out;
};

// ─── Retirement projection ───────────────────────────────────────────────────

export interface RetirementInput {
  currentAge: number;
  retireAge: number;
  lifeExpectancy: number;
  monthlyExpense: number;     // today's rupees
  inflationPct: number;
  expectedReturnPct: number;  // pre-retirement
  postReturnPct: number;      // post-retirement
  currentCorpus: number;      // rupees
  monthlySip: number;         // rupees
}

export const retirementPlan = (p: RetirementInput) => {
  const years = Math.max(p.retireAge - p.currentAge, 0);
  const retYears = Math.max(p.lifeExpectancy - p.retireAge, 1);
  const infl = p.inflationPct / 100;
  const r = p.expectedReturnPct / 100;
  const rPost = p.postReturnPct / 100;

  // Expense at retirement (inflated), then annualised.
  const futureMonthly = p.monthlyExpense * Math.pow(1 + infl, years);
  const futureAnnual = futureMonthly * 12;

  // Required corpus = inflation-adjusted annuity over retirement, discounted at
  // the post-retirement real return.
  const realRate = (1 + rPost) / (1 + infl) - 1;
  let requiredCorpus: number;
  if (Math.abs(realRate) < 1e-6) requiredCorpus = futureAnnual * retYears;
  else requiredCorpus = futureAnnual * (1 - Math.pow(1 + realRate, -retYears)) / realRate;

  // Projected corpus = current corpus grown + future value of monthly SIPs.
  const rm = r / 12;
  const months = years * 12;
  const fvCurrent = p.currentCorpus * Math.pow(1 + r, years);
  const fvSip = rm > 0
    ? p.monthlySip * ((Math.pow(1 + rm, months) - 1) / rm) * (1 + rm)
    : p.monthlySip * months;
  const projectedCorpus = fvCurrent + fvSip;

  const gap = requiredCorpus - projectedCorpus;
  // Extra monthly SIP needed to close any gap.
  const sipFactor = rm > 0 ? ((Math.pow(1 + rm, months) - 1) / rm) * (1 + rm) : months;
  const additionalSip = gap > 0 && sipFactor > 0 ? gap / sipFactor : 0;

  return {
    years,
    retYears,
    futureMonthlyExpense: Math.round(futureMonthly),
    requiredCorpus: Math.round(requiredCorpus),
    projectedCorpus: Math.round(projectedCorpus),
    gap: Math.round(gap),
    onTrack: gap <= 0,
    additionalSip: Math.round(additionalSip),
    coverPct: requiredCorpus > 0 ? Math.round((projectedCorpus / requiredCorpus) * 100) : 0,
  };
};
