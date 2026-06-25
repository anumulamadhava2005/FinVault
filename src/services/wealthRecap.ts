/**
 * Net-worth history + yearly Wealth Recap.
 *
 * A monthly net-worth snapshot is captured (idempotently, one row per month)
 * whenever the dashboard/recap loads. The recap then summarises growth, the
 * biggest wealth creators, volatility and milestones for a chosen year.
 */
import { all, first, run, newId } from '../db';
import type { Asset } from '../models/types';
import { netWorth } from './finance';
import { nowISO } from '../utils/date';
import { fyStartYear, fyStartYm, fyEndYm, fyLabel, ymToFyStartYear } from '../utils/financialYear';

interface Snapshot {
  ym: string;
  net_worth: number;
  total_assets: number;
  total_liabilities: number;
}

/** Capture (or refresh) this month's net-worth snapshot. */
export const captureNetWorthSnapshot = (userId: string): void => {
  if (!userId) return;
  const nw = netWorth(userId);
  const t = new Date();
  const ym = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
  try {
    run(
      `INSERT OR REPLACE INTO networth_snapshots (id, user_id, ym, net_worth, total_assets, total_liabilities, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId(), userId, ym, nw.net_worth, nw.total_assets, nw.total_liabilities, nowISO()],
    );
  } catch { /* best-effort */ }
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MILESTONES: { paise: number; label: string }[] = [
  { paise: 100_000_00, label: '₹1 Lakh' },
  { paise: 500_000_00, label: '₹5 Lakh' },
  { paise: 1_000_000_00, label: '₹10 Lakh' },
  { paise: 2_500_000_00, label: '₹25 Lakh' },
  { paise: 5_000_000_00, label: '₹50 Lakh' },
  { paise: 10_000_000_00, label: '₹1 Crore' },
  { paise: 20_000_000_00, label: '₹2 Crore' },
  { paise: 50_000_000_00, label: '₹5 Crore' },
];

export const availableSnapshotYears = (userId: string): number[] => {
  const rows = all<{ ym: string }>(
    `SELECT DISTINCT ym FROM networth_snapshots WHERE user_id = ? ORDER BY ym DESC`,
    [userId],
  );
  const fyYears = new Set<number>();
  for (const { ym } of rows) fyYears.add(ymToFyStartYear(ym));
  const current = fyStartYear();
  fyYears.add(current);
  return [...fyYears].sort((a, b) => b - a);
};

export const wealthRecap = (userId: string, fyYear: number) => {
  // fyYear is the FY start year: e.g. 2025 → Apr 2025 – Mar 2026
  const rows = all<Snapshot>(
    `SELECT ym, net_worth, total_assets, total_liabilities FROM networth_snapshots
     WHERE user_id = ? AND ym >= ? AND ym <= ? ORDER BY ym`,
    [userId, fyStartYm(fyYear), fyEndYm(fyYear)],
  );

  const series = rows.map((r) => ({
    ym: r.ym,
    label: MONTH_LABELS[Number(r.ym.slice(5, 7)) - 1] ?? r.ym,
    net_worth: r.net_worth,
  }));

  const start = rows[0]?.net_worth ?? 0;
  const end = rows[rows.length - 1]?.net_worth ?? start;
  const growth = end - start;
  const growthPct = start ? Number(((growth / start) * 100).toFixed(1)) : 0;

  // Month-over-month change stats → volatility band.
  let best: { label: string; change: number } | null = null;
  let worst: { label: string; change: number } | null = null;
  const pctChanges: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const change = rows[i].net_worth - rows[i - 1].net_worth;
    const lbl = MONTH_LABELS[Number(rows[i].ym.slice(5, 7)) - 1];
    if (!best || change > best.change) best = { label: lbl, change };
    if (!worst || change < worst.change) worst = { label: lbl, change };
    if (rows[i - 1].net_worth) pctChanges.push((change / Math.abs(rows[i - 1].net_worth)) * 100);
  }
  let volatility = 0;
  if (pctChanges.length) {
    const mean = pctChanges.reduce((s, v) => s + v, 0) / pctChanges.length;
    volatility = Math.sqrt(pctChanges.reduce((s, v) => s + (v - mean) ** 2, 0) / pctChanges.length);
  }
  const volatilityBand = volatility < 3 ? 'Low' : volatility < 7 ? 'Moderate' : 'High';

  // Biggest wealth creators (by absolute gain).
  const assets = all<Asset & { type_name: string }>(
    `SELECT a.*, t.name AS type_name FROM assets a JOIN asset_types t ON t.id = a.asset_type_id WHERE a.user_id = ?`,
    [userId],
  );
  const creators = assets
    .map((a) => ({ name: a.name, type_name: a.type_name, gain: a.current_value - a.invested_amount, invested: a.invested_amount }))
    .filter((c) => c.gain > 0)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 5)
    .map((c) => ({ ...c, pct: c.invested ? Number(((c.gain / c.invested) * 100).toFixed(1)) : 0 }));

  // Milestones crossed during the year.
  const milestones = MILESTONES.filter((m) => start < m.paise && end >= m.paise).map((m) => m.label);

  return {
    year: fyYear,
    fy_label: fyLabel(fyYear),
    months_tracked: rows.length,
    series,
    start,
    end,
    growth,
    growth_pct: growthPct,
    best_month: best,
    worst_month: worst,
    volatility: Number(volatility.toFixed(1)),
    volatility_band: volatilityBand,
    creators,
    milestones,
  };
};
