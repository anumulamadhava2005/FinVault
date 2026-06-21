/**
 * Financial calculations ported from the web app's services.py. Pure functions
 * over rows already loaded from SQLite. Money is paise; dates are ISO strings.
 */
import { all, first } from '../db';
import type { Asset, FinancialGoal, InsurancePolicy, Loan, VaultCredential } from '../models/types';
import { parseISO, daysBetween, monthsBetween, todayISO } from '../utils/date';
import { pct } from '../utils/money';
import {
  BENCH_CLASS,
  BENCHMARKS,
  EQUITY_TYPES,
  FREQ_PER_YEAR,
  HIGH_INTEREST_PCT,
  LIQUID_TYPES,
  LOAN_TYPE_COLORS,
  LOAN_TYPE_LABELS,
  POLICY_TYPE_COLORS,
  POLICY_TYPE_LABELS,
  RISK_TARGET,
  titleCase,
} from './constants';

const today = () => new Date(todayISO() + 'T00:00:00');

// --- Portfolio --------------------------------------------------------------

export interface AllocationRow {
  type: string;
  value: number;
  invested: number;
  count: number;
  pct: number;
}

export const portfolioSummary = (userId: string) => {
  const assets = all<Asset & { type_name: string }>(
    `SELECT a.*, t.name AS type_name FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id WHERE a.user_id = ?`,
    [userId],
  );
  const total_invested = assets.reduce((s, a) => s + a.invested_amount, 0);
  const total_value = assets.reduce((s, a) => s + a.current_value, 0);
  const total_pnl = total_value - total_invested;
  const byType = new Map<string, { value: number; invested: number; count: number }>();
  for (const a of assets) {
    const k = a.type_name || 'Other';
    const e = byType.get(k) || { value: 0, invested: 0, count: 0 };
    e.value += a.current_value;
    e.invested += a.invested_amount;
    e.count += 1;
    byType.set(k, e);
  }
  const allocation: AllocationRow[] = [...byType.entries()]
    .map(([type, v]) => ({ type, ...v, pct: pct(v.value, total_value) }))
    .sort((a, b) => b.value - a.value);

  // Sum sip_monthly_amount from assets directly — this covers all SIP-enabled
  // assets regardless of whether a sip_schedule row exists.
  const sipRow = first<{ monthly_sip: number; active_sips: number }>(
    `SELECT COALESCE(SUM(sip_monthly_amount), 0) AS monthly_sip,
            COUNT(*) AS active_sips
     FROM assets
     WHERE user_id = ? AND is_sip = 1 AND sip_monthly_amount > 0`,
    [userId],
  );

  return {
    total_invested,
    total_value,
    total_pnl,
    pnl_pct: total_invested ? Number(((total_pnl / total_invested) * 100).toFixed(2)) : 0,
    asset_count: assets.length,
    monthly_sip: sipRow?.monthly_sip ?? 0,
    active_sips: sipRow?.active_sips ?? 0,
    allocation,
  };
};

export const benchmarkComparison = (userId: string, riskProfile = 'moderate') => {
  const pf = portfolioSummary(userId);
  const actual: Record<string, number> = {};
  for (const a of pf.allocation) {
    const cls = BENCH_CLASS[a.type] || a.type;
    actual[cls] = (actual[cls] || 0) + a.pct;
  }
  const target = BENCHMARKS[riskProfile] || BENCHMARKS.moderate;
  const classes = [...new Set([...Object.keys(actual), ...Object.keys(target)])].sort();
  let drift = 0;
  const rows = classes.map((c) => {
    const act = Number((actual[c] || 0).toFixed(1));
    const rec = target[c] || 0;
    if (c !== 'Real Estate') drift += Math.abs(act - rec);
    return { type: c, actual: act, recommended: rec };
  });
  return { rows, drift: Number(drift.toFixed(1)), risk_profile: riskProfile };
};

// --- Loans ------------------------------------------------------------------

export const loanStatus = (l: Loan, t = today()): string => {
  if (l.status === 'closed' || l.outstanding_amount <= 0) return 'closed';
  if (l.status === 'defaulted') return 'defaulted';
  const due = parseISO(l.next_due_date);
  if (due && due < t) return 'overdue';
  return 'active';
};

export const remainingMonths = (l: Loan, t = today()): number => {
  const end = parseISO(l.end_date);
  if (end) return Math.max(monthsBetween(t, end), 0);
  if (l.emi_amount) return Math.max(Math.round(l.outstanding_amount / l.emi_amount), 0);
  return 0;
};

export const totalInterestPayable = (l: Loan, t = today()): number => {
  const m = remainingMonths(l, t);
  if (!l.emi_amount || !m) return 0;
  return Math.max(l.emi_amount * m - l.outstanding_amount, 0);
};

export const loanSummary = (userId: string) => {
  const loans = all<Loan>('SELECT * FROM loans WHERE user_id = ?', [userId]);
  const active = loans.filter((l) => loanStatus(l) !== 'closed');
  const total_outstanding = active.reduce((s, l) => s + l.outstanding_amount, 0);
  const total_emi = active.reduce((s, l) => s + l.emi_amount, 0);
  const total_interest = active.reduce((s, l) => s + totalInterestPayable(l), 0);

  const byType = new Map<string, { outstanding: number; original: number; emi: number; count: number }>();
  for (const l of active) {
    const e = byType.get(l.loan_type) || { outstanding: 0, original: 0, emi: 0, count: 0 };
    e.outstanding += l.outstanding_amount;
    e.original += l.original_amount;
    e.emi += l.emi_amount;
    e.count += 1;
    byType.set(l.loan_type, e);
  }
  const distribution = [...byType.entries()]
    .map(([type, v]) => ({
      type,
      label: LOAN_TYPE_LABELS[type] || titleCase(type),
      ...v,
      color: LOAN_TYPE_COLORS[type] || '#9DD1C2',
      pct: pct(v.outstanding, total_outstanding),
    }))
    .sort((a, b) => b.outstanding - a.outstanding);

  return {
    count: loans.length,
    active_count: active.length,
    total_outstanding,
    total_emi,
    total_interest,
    distribution,
    health: loanHealthScore(userId),
  };
};

export const loanHealthScore = (userId: string) => {
  const loans = all<Loan>('SELECT * FROM loans WHERE user_id = ?', [userId]).filter(
    (l) => loanStatus(l) !== 'closed',
  );
  const total_out = loans.reduce((s, l) => s + l.outstanding_amount, 0);
  const total_emi = loans.reduce((s, l) => s + l.emi_amount, 0);
  const fh = financialHealth(userId);
  const monthly_income = fh.monthly_income;
  const total_assets = portfolioSummary(userId).total_value;

  let emi_to_income = 60;
  if (monthly_income) {
    const r = total_emi / monthly_income;
    emi_to_income = Math.max(0, Math.min(100, 100 - Math.max(0, r - 0.3) * 250));
  }
  let debt_to_asset = total_out === 0 ? 60 : 40;
  if (total_assets) {
    const r2 = total_out / total_assets;
    debt_to_asset = Math.max(0, Math.min(100, 100 - Math.max(0, r2 - 0.5) * 100));
  }
  const high_int = loans
    .filter((l) => l.interest_rate > HIGH_INTEREST_PCT)
    .reduce((s, l) => s + l.outstanding_amount, 0);
  const high_int_factor = total_out ? Math.round(100 * (1 - high_int / total_out)) : 100;

  let score = Math.round(emi_to_income * 0.4 + debt_to_asset * 0.3 + high_int_factor * 0.3);
  score = Math.max(0, Math.min(score, 100));
  const rating =
    score >= 75 ? 'Healthy' : score >= 50 ? 'Manageable' : score >= 30 ? 'Stretched' : 'High Risk';
  return {
    score,
    rating,
    components: {
      emi_to_income: Math.round(emi_to_income),
      debt_to_asset: Math.round(debt_to_asset),
      high_interest: high_int_factor,
    },
  };
};

export const debtHealth = (userId: string, riskProfile = 'moderate') => {
  const loans = all<Loan>('SELECT * FROM loans WHERE user_id = ?', [userId]).filter(
    (l) => loanStatus(l) !== 'closed',
  );
  const fh = financialHealth(userId, riskProfile);
  const monthly_income = fh.monthly_income;
  const annual_income = monthly_income * 12;
  const total_out = loans.reduce((s, l) => s + l.outstanding_amount, 0);
  const total_emi = loans.reduce((s, l) => s + l.emi_amount, 0);
  const total_assets = portfolioSummary(userId).total_value;
  const band = (v: number, safe: number, mod: number) =>
    v <= safe ? 'safe' : v <= mod ? 'moderate' : 'high';

  const emi_ratio = monthly_income ? Number(((total_emi / monthly_income) * 100).toFixed(1)) : 0;
  const dti_ratio = annual_income ? Number(((total_out / annual_income) * 100).toFixed(1)) : 0;
  const dta_ratio = total_assets ? Number(((total_out / total_assets) * 100).toFixed(1)) : 0;
  const rows = [
    { label: 'EMI-to-Income', value: emi_ratio, suffix: '%', band: band(emi_ratio, 30, 45), hint: 'Share of monthly income going to EMIs (keep under 30%).' },
    { label: 'Debt-to-Income', value: dti_ratio, suffix: '%', band: band(dti_ratio, 200, 350), hint: 'Total debt vs annual income.' },
    { label: 'Debt-to-Asset', value: dta_ratio, suffix: '%', band: band(dta_ratio, 50, 100), hint: 'How much of your assets are offset by debt.' },
  ];
  const recs: string[] = [];
  if (loans.some((l) => l.interest_rate > HIGH_INTEREST_PCT))
    recs.push('Prioritise repaying high-interest debt (e.g. credit cards, personal loans) first.');
  if (emi_ratio > 45) recs.push('Your EMI burden is high — consider refinancing or extending tenure to ease cash flow.');
  else if (emi_ratio > 30) recs.push('EMIs are moderate — avoid new debt and consider small prepayments.');
  if (dta_ratio > 100) recs.push('Liabilities exceed assets — focus on debt reduction before new investments.');
  if (!recs.length) recs.push('Your debt levels look healthy — keep paying EMIs on time and prepay when you can.');
  return { rows, recommendations: recs.slice(0, 4), annual_income };
};

export const netWorth = (userId: string) => {
  const total_assets = portfolioSummary(userId).total_value;
  const loans = all<Loan>('SELECT * FROM loans WHERE user_id = ?', [userId]);
  const total_liabilities = loans
    .filter((l) => loanStatus(l) !== 'closed')
    .reduce((s, l) => s + l.outstanding_amount, 0);
  return { total_assets, total_liabilities, net_worth: total_assets - total_liabilities };
};

// --- Goals (timeline status) ------------------------------------------------

export interface GoalTimeline {
  status: 'completed' | 'on_track' | 'behind' | 'overdue';
  expected: number;
  expected_pct: number;
  required_monthly: number;
}

export const goalTimeline = (
  start: Date | null,
  targetDate: Date | null,
  targetAmount: number,
  current: number,
  t = today(),
): GoalTimeline => {
  if (current >= targetAmount && targetAmount > 0)
    return { status: 'completed', expected: targetAmount, expected_pct: 100, required_monthly: 0 };

  let frac = 0;
  if (start && targetDate) {
    const totalDays = daysBetween(start, targetDate);
    if (totalDays <= 0) frac = 1;
    else {
      const elapsed = Math.max(0, Math.min(daysBetween(start, t), totalDays));
      frac = elapsed / totalDays;
    }
  }
  const expected = Math.round(frac * targetAmount);

  const remaining = Math.max(targetAmount - current, 0);
  let required_monthly: number;
  if (targetDate && targetDate > t) {
    const remMonths = Math.max(Math.round(daysBetween(t, targetDate) / 30.44), 1);
    required_monthly = Math.round(remaining / remMonths);
  } else {
    required_monthly = remaining;
  }

  let status: GoalTimeline['status'];
  if (targetDate && t >= targetDate) status = 'overdue';
  else if (current >= expected) status = 'on_track';
  else status = 'behind';

  return { status, expected, expected_pct: Number((frac * 100).toFixed(1)), required_monthly };
};

export const GOAL_STATUS_META: Record<GoalTimeline['status'], { label: string; icon: string; tone: 'good' | 'warn' | 'bad' }> = {
  completed: { label: 'Completed', icon: 'check-circle', tone: 'good' },
  on_track: { label: 'On Track', icon: 'circle-slice-8', tone: 'good' },
  behind: { label: 'Behind Schedule', icon: 'alert', tone: 'warn' },
  overdue: { label: 'Overdue', icon: 'alert-circle', tone: 'bad' },
};

export const goalsProgress = (userId: string) => {
  if (__DEV__) console.time('goalsProgress');
  const goals = all<FinancialGoal>('SELECT * FROM financial_goals WHERE user_id = ?', [userId]);
  let total_target = 0;
  let total_current = 0;
  let on_track = 0;
  const out = goals.map((g) => {
    const links = all<{ current_value: number; allocation_pct: number }>(
      `SELECT gal.allocation_pct, a.current_value FROM goal_asset_links gal
       JOIN assets a ON a.id = gal.asset_id WHERE gal.goal_id = ?`,
      [g.id],
    );
    const current = links.reduce((s, l) => s + Math.round((l.current_value * (l.allocation_pct ?? 100)) / 100), 0);
    const p = pct(current, g.target_amount);
    const tl = goalTimeline(parseISO(g.created_at), parseISO(g.target_date), g.target_amount, current);
    const meta = GOAL_STATUS_META[tl.status];
    const tracked = tl.status === 'completed' || tl.status === 'on_track';
    if (tracked) on_track += 1;
    total_target += g.target_amount;
    total_current += current;
    return {
      ...g,
      current,
      pct: Math.min(p, 100),
      linked: links.length,
      status: tl.status,
      status_label: meta.label,
      status_icon: meta.icon,
      status_tone: meta.tone,
      expected: tl.expected,
      expected_pct: tl.expected_pct,
      required_monthly: tl.required_monthly,
    };
  });
  if (__DEV__) console.timeEnd('goalsProgress');
  return {
    goals: out,
    total_target,
    total_current,
    count: goals.length,
    on_track,
    overall_pct: pct(total_current, total_target),
  };
};

// --- Protect ----------------------------------------------------------------

export const annualPremium = (p: InsurancePolicy): number =>
  p.premium_amount * (FREQ_PER_YEAR[p.premium_frequency] ?? 1);

export const policyStatus = (p: InsurancePolicy, t = today()): string => {
  if (p.status === 'lapsed') return 'lapsed';
  const exp = parseISO(p.expiry_date);
  if (exp) {
    if (exp < t) return p.status === 'renewed' ? 'renewed' : 'lapsed';
    if (daysBetween(t, exp) <= 30) return 'expiring';
  }
  return p.status === 'renewed' ? 'renewed' : 'active';
};

export const protectSummary = (userId: string) => {
  const policies = all<InsurancePolicy>('SELECT * FROM insurance_policies WHERE user_id = ?', [userId]);
  const life_cover = policies.filter((p) => p.policy_type === 'life').reduce((s, p) => s + p.coverage_amount, 0);
  const health_cover = policies.filter((p) => p.policy_type === 'health').reduce((s, p) => s + p.coverage_amount, 0);
  const total_cover = policies.reduce((s, p) => s + p.coverage_amount, 0);
  const annual = policies.reduce((s, p) => s + annualPremium(p), 0);

  const byType = new Map<string, { coverage: number; annual: number; count: number }>();
  for (const p of policies) {
    const e = byType.get(p.policy_type) || { coverage: 0, annual: 0, count: 0 };
    e.coverage += p.coverage_amount;
    e.annual += annualPremium(p);
    e.count += 1;
    byType.set(p.policy_type, e);
  }
  const distribution = [...byType.entries()]
    .map(([type, v]) => ({
      type,
      label: POLICY_TYPE_LABELS[type] || titleCase(type),
      ...v,
      color: POLICY_TYPE_COLORS[type] || '#9DD1C2',
      pct: pct(v.coverage, total_cover),
    }))
    .sort((a, b) => b.coverage - a.coverage);

  const t = today();
  let expiring_n = 0;
  for (const p of policies) if (policyStatus(p, t) === 'expiring') expiring_n += 1;

  return { count: policies.length, life_cover, health_cover, total_cover, annual_premium: annual, expiring_count: expiring_n, distribution };
};

// --- Expenses ---------------------------------------------------------------

export const categoryBreakdown = (userId: string, year: number, month: number) => {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-31`;
  const rows = all<{ amount: number; category_id: string; name: string; color_hex: string; budget_amount: number }>(
    `SELECT e.amount, e.category_id, c.name, c.color_hex, c.budget_amount
     FROM expenses e JOIN expense_categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.expense_date >= ? AND e.expense_date <= ?`,
    [userId, start, end],
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCat = new Map<string, { id: string; name: string; color: string; budget: number; amount: number }>();
  for (const r of rows) {
    const e = byCat.get(r.category_id) || { id: r.category_id, name: r.name, color: r.color_hex, budget: r.budget_amount, amount: 0 };
    e.amount += r.amount;
    byCat.set(r.category_id, e);
  }
  const categories = [...byCat.values()]
    .map((c) => ({ ...c, pct: pct(c.amount, total), utilized: c.budget ? Math.round((c.amount / c.budget) * 100) : 0, over_budget: !!c.budget && c.amount > c.budget }))
    .sort((a, b) => b.amount - a.amount);
  return { total, categories };
};

export const incomeExpenseSeries = (userId: string, months = 6) => {
  const t = today();
  const labels: string[] = [];
  const income: number[] = [];
  const expenses: number[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const s = `${y}-${String(m).padStart(2, '0')}-01`;
    const e = `${y}-${String(m).padStart(2, '0')}-31`;
    labels.push(d.toLocaleString('en-US', { month: 'short' }));
    income.push(
      first<{ t: number }>('SELECT COALESCE(SUM(amount),0) AS t FROM income WHERE user_id = ? AND income_date >= ? AND income_date <= ?', [userId, s, e])?.t || 0,
    );
    expenses.push(
      first<{ t: number }>('SELECT COALESCE(SUM(amount),0) AS t FROM expenses WHERE user_id = ? AND expense_date >= ? AND expense_date <= ?', [userId, s, e])?.t || 0,
    );
  }
  return { labels, income, expenses };
};

const getMonthBounds = (year: number, month: number) => {
  const s = `${year}-${String(month).padStart(2, '0')}-01`;
  const e = `${year}-${String(month).padStart(2, '0')}-31`;
  return { start: s, end: e };
};

const _sumExpensesYear = (userId: string, year: number): number => {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const res = first<{ t: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE user_id = ? AND expense_date >= ? AND expense_date <= ?',
    [userId, start, end]
  );
  return res?.t || 0;
};

const _sumExpenses = (userId: string, year: number, month: number): number => {
  const { start, end } = getMonthBounds(year, month);
  const res = first<{ t: number }>(
    'SELECT COALESCE(SUM(amount), 0) AS t FROM expenses WHERE user_id = ? AND expense_date >= ? AND expense_date <= ?',
    [userId, start, end]
  );
  return res?.t || 0;
};

const _categoryRows = (userId: string, start: string, end: string) => {
  const rows = all<{ amount: number; category_id: string; name: string; color_hex: string; budget_amount: number }>(
    `SELECT e.amount, e.category_id, c.name, c.color_hex, c.budget_amount
     FROM expenses e JOIN expense_categories c ON c.id = e.category_id
     WHERE e.user_id = ? AND e.expense_date >= ? AND e.expense_date <= ?`,
    [userId, start, end],
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byCat = new Map<string, { id: string; name: string; color: string; budget: number; amount: number }>();
  for (const r of rows) {
    const e = byCat.get(r.category_id) || { id: r.category_id, name: r.name, color: r.color_hex, budget: r.budget_amount, amount: 0 };
    e.amount += r.amount;
    byCat.set(r.category_id, e);
  }
  const categories = [...byCat.values()]
    .map((c) => ({
      ...c,
      pct: pct(c.amount, total),
      utilized: c.budget ? Math.round((c.amount / c.budget) * 100) : 0,
      over_budget: !!c.budget && c.amount > c.budget,
    }))
    .sort((a, b) => b.amount - a.amount);
  return { expenses: rows, total, categories };
};

export interface ExpenseAnalyticsData {
  trend_type: 'monthly' | 'yearly';
  year: number;
  month: number;
  labels: string[];
  values: number[];
  summary: {
    total: number;
    avg_daily: number;
    count: number;
    highest_category: string;
    highest_category_amount: number;
  };
  trend: {
    change_pct: number;
    period_label: string;
    prev_label: string;
    highest: { label: string; value: number } | null;
    lowest: { label: string; value: number } | null;
    direction: string;
  };
  categories: any[];
  top_categories: any[];
  comparison: {
    cur_total: number;
    prev_total: number;
    change_pct: number;
    prev_label: string;
  };
}

export const expenseAnalytics = (
  userId: string,
  trendType: 'monthly' | 'yearly' = 'monthly',
  year?: number,
  month?: number,
): ExpenseAnalyticsData => {
  const t = new Date();
  const currentYear = t.getFullYear();
  const currentMonth = t.getMonth() + 1;

  const selYear = year || currentYear;
  const selMonth = month || currentMonth;

  let labels: string[] = [];
  let values: number[] = [];
  let pStart = '';
  let pEnd = '';
  let prevStart = '';
  let prevEnd = '';
  let periodLabel = '';
  let prevLabel = '';
  let days = 30;

  if (trendType === 'yearly') {
    const seen = new Set<number>();
    seen.add(currentYear);
    const expDates = all<{ d: string }>('SELECT DISTINCT SUBSTR(expense_date, 1, 4) AS d FROM expenses WHERE user_id = ?', [userId]);
    for (const row of expDates) {
      if (row.d) seen.add(parseInt(row.d, 10));
    }
    const incDates = all<{ d: string }>('SELECT DISTINCT SUBSTR(income_date, 1, 4) AS d FROM income WHERE user_id = ?', [userId]);
    for (const row of incDates) {
      if (row.d) seen.add(parseInt(row.d, 10));
    }
    const sortedYears = Array.from(seen).sort((a, b) => a - b);
    const span = sortedYears.slice(-6);
    labels = span.map((y) => String(y));
    values = span.map((y) => _sumExpensesYear(userId, y));

    pStart = `${selYear}-01-01`;
    pEnd = `${selYear}-12-31`;
    prevStart = `${selYear - 1}-01-01`;
    prevEnd = `${selYear - 1}-12-31`;
    periodLabel = String(selYear);
    prevLabel = String(selYear - 1);

    const isLeap = (selYear % 4 === 0 && selYear % 100 !== 0) || selYear % 400 === 0;
    days = isLeap ? 366 : 365;
  } else {
    const lastMonth = selYear === currentYear ? currentMonth : 12;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    labels = monthNames.slice(0, lastMonth);
    values = Array.from({ length: lastMonth }, (_, idx) => _sumExpenses(userId, selYear, idx + 1));

    const curBounds = getMonthBounds(selYear, selMonth);
    pStart = curBounds.start;
    pEnd = curBounds.end;

    const pm = selMonth === 1 ? 12 : selMonth - 1;
    const py = selMonth === 1 ? selYear - 1 : selYear;
    const prevBounds = getMonthBounds(py, pm);
    prevStart = prevBounds.start;
    prevEnd = prevBounds.end;

    periodLabel = `${monthNames[selMonth - 1]} ${selYear}`;
    prevLabel = `${monthNames[pm - 1]} ${py}`;
    days = new Date(selYear, selMonth, 0).getDate();
  }

  const curData = _categoryRows(userId, pStart, pEnd);
  const prevData = _categoryRows(userId, prevStart, prevEnd);

  const prevByName = new Map<string, number>();
  for (const c of prevData.categories) {
    prevByName.set(c.name, c.amount);
  }

  const categories = curData.categories.map((c) => {
    const prevAmt = prevByName.get(c.name) || 0;
    const diff = c.amount - prevAmt;
    const changePct = prevAmt ? Math.round((diff / prevAmt) * 100) : (c.amount ? 100 : 0);
    return {
      ...c,
      prev: prevAmt,
      change_pct: changePct,
    };
  });

  const changePct = prevData.total ? Number((((curData.total - prevData.total) / prevData.total) * 100).toFixed(1)) : 0;

  const series = labels.map((lbl, idx) => ({ label: lbl, value: values[idx] })).filter((item) => item.value > 0);
  const hi = series.length ? series.reduce((a, b) => (a.value > b.value ? a : b)) : null;
  const lo = series.length ? series.reduce((a, b) => (a.value < b.value ? a : b)) : null;

  const highest = categories[0] || null;

  return {
    trend_type: trendType,
    year: selYear,
    month: selMonth,
    labels,
    values,
    summary: {
      total: curData.total,
      avg_daily: days ? Math.round(curData.total / days) : 0,
      count: curData.expenses.length,
      highest_category: highest ? highest.name : '—',
      highest_category_amount: highest ? highest.amount : 0,
    },
    trend: {
      change_pct: changePct,
      period_label: periodLabel,
      prev_label: prevLabel,
      highest: hi,
      lowest: lo,
      direction: changePct > 5 ? 'Rising Trend' : changePct < -5 ? 'Falling Trend' : 'Stable Trend',
    },
    categories,
    top_categories: categories.slice(0, 3),
    comparison: {
      cur_total: curData.total,
      prev_total: prevData.total,
      change_pct: changePct,
      prev_label: prevLabel,
    },
  };
};

const formatRupees = (paise: number): string => {
  return `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
};

export const generateSpendingInsights = (
  userId: string,
  trendType: 'monthly' | 'yearly' = 'monthly',
  year?: number,
  month?: number,
): string[] => {
  const a = expenseAnalytics(userId, trendType, year, month);
  const cmp = a.comparison;
  const out: string[] = [];

  if (cmp.prev_total && cmp.change_pct >= 5) {
    out.push(`Total spending increased by ${Math.abs(cmp.change_pct)}% vs ${cmp.prev_label}.`);
  } else if (cmp.prev_total && cmp.change_pct <= -5) {
    out.push(`Total spending dropped ${Math.abs(cmp.change_pct)}% vs ${cmp.prev_label} — nice control.`);
  }

  for (const c of a.categories.slice(0, 6)) {
    if (c.prev && c.change_pct >= 20) {
      out.push(`${c.name} spending increased by ${c.change_pct}%.`);
    }
  }

  if (a.top_categories.length > 0) {
    const t = a.top_categories[0];
    out.push(`${t.name} is your highest category at ${formatRupees(t.amount)} (${t.pct}% of spend).`);
  }

  const topThreeTotal = a.top_categories.reduce((sum, c) => sum + c.amount, 0);
  const save = Math.round(topThreeTotal * 0.10);
  if (save > 0) {
    out.push(`You can save about ${formatRupees(save)} by reducing your top categories by 10%.`);
  }

  if (a.top_categories.length >= 3) {
    const names = a.top_categories.slice(0, 3).map((c) => c.name).join(', ');
    out.push(`Top 3 categories: ${names}.`);
  }

  if (out.length === 0) {
    out.push('Spending looks steady — no notable changes this period.');
  }

  return out;
};


// --- Financial health (weighted, rule-based) --------------------------------

export const financialHealth = (userId: string, riskProfile = 'moderate') => {
  const t = today();
  const y = t.getFullYear();
  const m = t.getMonth() + 1;
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const monthEnd = `${y}-${String(m).padStart(2, '0')}-31`;
  const income_total = first<{ s: number }>('SELECT COALESCE(SUM(amount),0) AS s FROM income WHERE user_id=? AND income_date>=? AND income_date<=?', [userId, monthStart, monthEnd])?.s || 0;
  const expense_total = first<{ s: number }>('SELECT COALESCE(SUM(amount),0) AS s FROM expenses WHERE user_id=? AND expense_date>=? AND expense_date<=?', [userId, monthStart, monthEnd])?.s || 0;
  const pf = portfolioSummary(userId);
  const alloc = pf.allocation;
  const total_value = pf.total_value;
  const savings_rate = income_total ? Number((((income_total - expense_total) / income_total) * 100).toFixed(1)) : 0;
  const insights: string[] = [];

  let diversification: number;
  if (!alloc.length) {
    diversification = 40;
    insights.push('Add assets to start measuring diversification.');
  } else {
    const top_pct = Math.max(...alloc.map((a) => a.pct));
    const breadth = Math.min(alloc.length / 5, 1) * 100;
    const balance = Math.max(0, 100 - Math.max(0, top_pct - 40) * 1.5);
    diversification = Number((breadth * 0.6 + balance * 0.4).toFixed(1));
    insights.push(diversification >= 70 ? 'Diversification is strong across asset types.' : 'Spread investments across more asset types to diversify.');
  }

  let risk_balance = 50;
  if (total_value) {
    const eq_pct = (alloc.filter((a) => EQUITY_TYPES.has(a.type)).reduce((s, a) => s + a.value, 0) / total_value) * 100;
    const target = RISK_TARGET[riskProfile] ?? 50;
    risk_balance = Number(Math.max(0, 100 - Math.abs(eq_pct - target) * 1.5).toFixed(1));
    if (risk_balance < 60) insights.push('Asset mix is off your target risk balance — rebalance equity vs safe assets.');
  }

  let liquidity = 50;
  const liquid_val = alloc.filter((a) => LIQUID_TYPES.has(a.type)).reduce((s, a) => s + a.value, 0);
  const monthly_exp = expense_total;
  if (monthly_exp) {
    liquidity = Number(Math.min((liquid_val / monthly_exp / 6) * 100, 100).toFixed(1));
    if (liquidity < 50) insights.push('Liquidity is low — consider increasing your emergency fund.');
  }

  const policyCount = first<{ c: number }>('SELECT COUNT(*) AS c FROM insurance_policies WHERE user_id=?', [userId])?.c || 0;
  const insurance = policyCount > 0 ? 75 : 50;
  if (!policyCount) insights.push('Add insurance details to complete your protection score.');

  let score = Math.round(diversification * 0.3 + risk_balance * 0.3 + liquidity * 0.2 + insurance * 0.2);
  score = Math.max(1, Math.min(score, 100));
  const rating = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Work';
  return {
    score,
    rating,
    status: rating,
    savings_rate,
    monthly_income: income_total,
    monthly_expenses: expense_total,
    components: {
      diversification: Math.round(diversification),
      risk_balance: Math.round(risk_balance),
      liquidity: Math.round(liquidity),
      insurance: Math.round(insurance),
    },
    insights: insights.slice(0, 4),
  };
};

export const passwordHealth = (userId: string) => {
  const creds = all<VaultCredential>('SELECT * FROM vault_credentials WHERE user_id = ?', [userId]);
  const weak = creds.filter((c) => c.password_strength < 50).length;
  const strong = creds.filter((c) => c.password_strength >= 75).length;
  const avg = creds.length ? Math.round(creds.reduce((s, c) => s + c.password_strength, 0) / creds.length) : 0;
  return { total: creds.length, weak, strong, score: avg };
};

