import { all } from '../db';
import type { Asset } from '../models/types';
import { parseISO, todayISO, monthsBetween, daysBetween } from '../utils/date';
import { xirr, CashFlow, portfolioReturns, benchmarkAnalysis } from './portfolioIntelligence';
import { getMarketSnapshot, getLiveBenchmarks } from './marketFeeds';

const today = () => new Date(todayISO() + 'T00:00:00');

export interface BenchmarkComparisonPeriod {
  period: string; // '1Y' | '3Y' | 'All'
  period_label: string; // '1 Year' | '3 Years' | 'All Time'
  portfolio_return: number | null; // %
  equity_return: number | null; // %
  benchmark_return: number; // %
  alpha: number | null; // %
  equity_alpha: number | null; // %
}

export interface GrowthDataPoint {
  label: string; // 'Year 0', 'Year 1', etc.
  portfolio_val: number;
  benchmark_val: number;
}

export interface BenchmarkComparisonResult {
  benchmark_type: 'nifty' | 'sensex' | 'blended';
  benchmark_name: string;
  periods: BenchmarkComparisonPeriod[];
  growth_chart: GrowthDataPoint[];
  portfolio_xirr: number | null;
  equity_xirr: number | null;
}

/**
 * Estimates the historical valuation of an asset at a specific target date
 * using its holding period CAGR (for equity/gold) or linear growth (for debt/fixed).
 */
const getAssetValueAtDate = (a: Asset & { slug: string }, targetDate: Date, t: Date): number => {
  const purchaseDate = parseISO(a.purchase_date || a.investment_date) || targetDate;
  if (purchaseDate >= targetDate) return 0; // Not yet purchased at target date

  const totalDays = Math.max(1, daysBetween(purchaseDate, t));
  const daysToTarget = Math.max(0, daysBetween(purchaseDate, targetDate));

  if (a.invested_amount <= 0 || a.current_value <= 0) return 0;

  const isEquityOrMf = a.slug === 'equity' || a.slug === 'mutual_fund' || a.slug === 'nps';
  if (isEquityOrMf) {
    const totalYears = totalDays / 365;
    const yearsToTarget = daysToTarget / 365;
    const ratio = a.current_value / a.invested_amount;
    // Compounding growth calculation
    const cagr = Math.pow(ratio, 1 / totalYears) - 1;
    return Math.round(a.invested_amount * Math.pow(1 + cagr, yearsToTarget));
  } else {
    // Linear growth calculation for debt, fixed deposits, and real estate
    const totalGain = a.current_value - a.invested_amount;
    const gainToTarget = totalGain * (daysToTarget / totalDays);
    return Math.round(a.invested_amount + gainToTarget);
  }
};

/**
 * Computes XIRR for a filtered list of assets over a specific trailing period.
 */
const calculatePeriodXirr = (
  userId: string,
  slugs: string[] | null, // null means all assets
  periodYears: number | null, // null means all-time
): number | null => {
  const query = slugs
    ? `SELECT a.*, t.slug FROM assets a
       JOIN asset_types t ON t.id = a.asset_type_id
       WHERE a.user_id = ? AND t.slug IN (${slugs.map(() => '?').join(',')})`
    : `SELECT a.*, t.slug FROM assets a
       JOIN asset_types t ON t.id = a.asset_type_id
       WHERE a.user_id = ?`;

  const params = slugs ? [userId, ...slugs] : [userId];
  const assets = all<Asset & { slug: string }>(query, params);

  if (assets.length === 0) return null;

  const t = today();
  const flows: CashFlow[] = [];
  let totalCurrentValue = 0;

  const cutoffDate = periodYears
    ? new Date(t.getTime() - periodYears * 365 * 86400000)
    : null;

  for (const a of assets) {
    if (a.invested_amount <= 0) continue;

    totalCurrentValue += a.current_value;
    const start = parseISO(a.investment_date ?? a.purchase_date) || t;

    if (cutoffDate && start < cutoffDate) {
      // Asset was purchased BEFORE the cutoff date.
      // 1. Estimate its value at the cutoff date and treat it as the initial outflow.
      const initialVal = getAssetValueAtDate(a, cutoffDate, t);
      if (initialVal > 0) {
        flows.push({ when: cutoffDate, amount: -initialVal });
      }

      // 2. Add subsequent SIP flows that occurred after the cutoff date
      if (a.is_sip && a.sip_monthly_amount > 0) {
        const monthsTotal = Math.max(monthsBetween(start, t), 0);
        const monthsBeforeCutoff = Math.max(monthsBetween(start, cutoffDate), 0);
        const monthly = a.sip_monthly_amount;

        for (let i = monthsBeforeCutoff; i < monthsTotal; i++) {
          const d = new Date(start.getFullYear(), start.getMonth() + i, start.getDate());
          if (d >= cutoffDate && d < t) {
            flows.push({ when: d, amount: -monthly });
          }
        }
      }
    } else {
      // Asset was purchased AFTER the cutoff date, include all its regular flows.
      if (a.is_sip && a.sip_monthly_amount > 0) {
        const months = Math.max(monthsBetween(start, t), 0);
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
  }

  if (flows.length === 0) return null;

  // Add the final valuation inflow today
  flows.push({ when: t, amount: totalCurrentValue });
  flows.sort((x, y) => x.when.getTime() - y.when.getTime());

  return flows.length >= 2 ? xirr(flows) : null;
};

/**
 * Main analysis function that calculates portfolio returns, equity returns,
 * benchmark returns, and alphas across multiple horizons.
 */
export const getBenchmarkComparison = (
  userId: string,
  benchmarkType: 'nifty' | 'sensex' | 'blended',
): BenchmarkComparisonResult => {
  // 1. Calculate overall portfolio and equity returns
  const portfolioAll = calculatePeriodXirr(userId, null, null);
  const portfolio3Y = calculatePeriodXirr(userId, null, 3);
  const portfolio1Y = calculatePeriodXirr(userId, null, 1);

  const equitySlugs = ['equity', 'mutual_fund', 'nps'];
  const equityAll = calculatePeriodXirr(userId, equitySlugs, null);
  const equity3Y = calculatePeriodXirr(userId, equitySlugs, 3);
  const equity1Y = calculatePeriodXirr(userId, equitySlugs, 1);

  // 2. Fetch live and historical benchmark index returns
  const live = getLiveBenchmarks();
  const snap = getMarketSnapshot();

  let live1Y = 14.0; // Fallback Nifty 1y return
  let indexName = 'Nifty 50';

  if (benchmarkType === 'nifty') {
    indexName = 'Nifty 50';
    if (live && live.equity1y != null) {
      live1Y = live.equity1y;
    }
  } else if (benchmarkType === 'sensex') {
    indexName = 'Sensex';
    const sensexIndex = snap?.indices.find((i) => i.symbol === '^BSESN');
    if (sensexIndex && sensexIndex.return1y != null) {
      live1Y = sensexIndex.return1y;
    } else {
      live1Y = 13.0; // Fallback Sensex 1y return
    }
  } else {
    indexName = 'Blended Portfolio Benchmark';
    const blended = benchmarkAnalysis(userId).blended_benchmark;
    live1Y = blended || 11.0;
  }

  // Define index returns across horizons:
  // - 1-Year: Uses the live trailing return from Yahoo Finance.
  // - 3-Year: Blended return to smooth short-term volatility (30% live, 70% long-term historical avg).
  // - All-Time (5-Year average): Compounded long-term historical return (20% live, 80% long-term historical avg).
  const benchmark1Y = Number(live1Y.toFixed(1));
  let benchmark3Y = 14.2;
  let benchmarkAll = 13.0;

  if (benchmarkType === 'nifty') {
    benchmark3Y = Number((live1Y * 0.3 + 14.2 * 0.7).toFixed(1));
    benchmarkAll = Number((live1Y * 0.2 + 13.0 * 0.8).toFixed(1));
  } else if (benchmarkType === 'sensex') {
    benchmark3Y = Number((live1Y * 0.3 + 13.8 * 0.7).toFixed(1));
    benchmarkAll = Number((live1Y * 0.2 + 12.5 * 0.8).toFixed(1));
  } else {
    // Blended benchmark stays stable around its calculated value
    benchmark3Y = Number((live1Y * 0.8 + 11.0 * 0.2).toFixed(1));
    benchmarkAll = Number((live1Y * 0.7 + 10.5 * 0.3).toFixed(1));
  }

  // 3. Assemble periods data
  const createPeriod = (
    period: string,
    label: string,
    portVal: number | null,
    eqVal: number | null,
    benchVal: number,
  ): BenchmarkComparisonPeriod => {
    return {
      period,
      period_label: label,
      portfolio_return: portVal,
      equity_return: eqVal,
      benchmark_return: benchVal,
      alpha: portVal != null ? Number((portVal - benchVal).toFixed(2)) : null,
      equity_alpha: eqVal != null ? Number((eqVal - benchVal).toFixed(2)) : null,
    };
  };

  const periods = [
    createPeriod('1Y', '1 Year', portfolio1Y, equity1Y, benchmark1Y),
    createPeriod('3Y', '3 Years', portfolio3Y, equity3Y, benchmark3Y),
    createPeriod('All', 'All Time', portfolioAll, equityAll, benchmarkAll),
  ];

  // 4. Generate Wealth Growth Projection Chart (₹1,00,000 grown over 5 years)
  const growth_chart: GrowthDataPoint[] = [];
  const ratePortfolio = portfolioAll || 12.0;
  const rateBenchmark = benchmarkAll;

  for (let year = 0; year <= 5; year++) {
    growth_chart.push({
      label: `Yr ${year}`,
      portfolio_val: Math.round(100000 * Math.pow(1 + ratePortfolio / 100, year)),
      benchmark_val: Math.round(100000 * Math.pow(1 + rateBenchmark / 100, year)),
    });
  }

  return {
    benchmark_type: benchmarkType,
    benchmark_name: indexName,
    periods,
    growth_chart,
    portfolio_xirr: portfolioAll,
    equity_xirr: equityAll,
  };
};
