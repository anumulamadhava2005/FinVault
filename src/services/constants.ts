/** Domain constants ported from services.py (labels, colours, benchmarks). */

export const LOAN_TYPES: [string, string][] = [
  ['home', 'Home Loan'],
  ['personal', 'Personal Loan'],
  ['vehicle', 'Vehicle Loan'],
  ['education', 'Education Loan'],
  ['gold', 'Gold Loan'],
  ['business', 'Business Loan'],
  ['lap', 'Loan Against Property'],
  ['credit_card', 'Credit Card Debt'],
  ['other', 'Other'],
];
export const LOAN_TYPE_LABELS: Record<string, string> = Object.fromEntries(LOAN_TYPES);
export const LOAN_TYPE_COLORS: Record<string, string> = {
  home: '#316357',
  education: '#4A7C6F',
  vehicle: '#D4956A',
  personal: '#F0B429',
  credit_card: '#E05C5C',
  gold: '#C2A14A',
  business: '#52A77E',
  lap: '#7E8AA2',
  other: '#9DD1C2',
};

export const POLICY_TYPES: [string, string][] = [
  ['life', 'Life Insurance'],
  ['health', 'Health Insurance'],
  ['vehicle', 'Vehicle Insurance'],
  ['home', 'Home / Property Insurance'],
  ['accident', 'Personal Accident'],
  ['travel', 'Travel Insurance'],
  ['other', 'Other Insurance'],
];
export const POLICY_TYPE_LABELS: Record<string, string> = Object.fromEntries(POLICY_TYPES);
export const POLICY_TYPE_COLORS: Record<string, string> = {
  life: '#4A7C6F',
  health: '#52A77E',
  vehicle: '#D4956A',
  home: '#316357',
  accident: '#F0B429',
  travel: '#7FB5A8',
  other: '#9DD1C2',
};

export const GOAL_TYPES: [string, string][] = [
  ['retirement', 'Retirement'],
  ['education', 'Education'],
  ['travel', 'Travel'],
  ['emergency', 'Emergency'],
  ['home', 'Home'],
  ['wedding', 'Wedding'],
  ['custom', 'Custom'],
];
export const GOAL_TYPE_LABELS: Record<string, string> = Object.fromEntries(GOAL_TYPES);
export const GOAL_TYPE_COLORS: Record<string, string> = {
  retirement: '#4A90E2',
  education: '#7B68EE',
  travel: '#2FA86B',
  emergency: '#E05C5C',
  home: '#F0B429',
  wedding: '#EC4899',
  custom: '#2F8F6F',
};

export const FREQ_PER_YEAR: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  'half-yearly': 2,
  yearly: 1,
  'one-time': 0,
};

export const RISK_TARGET: Record<string, number> = {
  conservative: 30,
  moderate: 50,
  aggressive: 70,
};

export const EQUITY_TYPES = new Set(['Equity', 'Mutual Funds', 'Mutual Fund', 'Real Estate', 'Crypto', 'Stocks']);
export const LIQUID_TYPES = new Set(['Savings', 'Fixed Deposit', 'Gold', 'Digital Gold', 'Mutual Funds', 'Cash']);

export const HIGH_INTEREST_PCT = 12.0;

export const BENCHMARKS: Record<string, Record<string, number>> = {
  conservative: { Equity: 20, 'Mutual Funds': 20, 'Fixed Deposit': 35, PPF: 15, 'Sovereign Gold Bond': 5, 'Digital/Physical Gold': 5 },
  moderate: { Equity: 35, 'Mutual Funds': 30, 'Fixed Deposit': 15, PPF: 10, 'Sovereign Gold Bond': 5, 'Digital/Physical Gold': 5 },
  aggressive: { Equity: 60, 'Mutual Funds': 20, 'Fixed Deposit': 5, PPF: 5, 'Sovereign Gold Bond': 5, 'Digital/Physical Gold': 5 },
};
export const BENCH_CLASS: Record<string, string> = {
  'Digital Gold': 'Digital/Physical Gold',
  Gold: 'Digital/Physical Gold',
};

export const titleCase = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const SIP_ELIGIBLE_TYPES = new Set(['mutual_fund', 'equity', 'digital_gold', 'ppf']);

export const ASSET_TYPE_KEY_MAP: Record<string, string> = {
  mutual_fund: 'Mutual Funds',
  equity: 'Equity',
  fd: 'Fixed Deposit',
  digital_gold: 'Digital Gold',
  physical_gold: 'Gold',
  sgb: 'Sovereign Gold Bond',
  ppf: 'PPF',
  real_estate: 'Real Estate',
};
