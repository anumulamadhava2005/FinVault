/**
 * TypeScript models mirroring the web app's SQLAlchemy tables (app/app/models.py).
 * All money fields are INTEGER paise. Dates are ISO "YYYY-MM-DD" strings.
 */

export interface User {
  id: string;
  full_name: string;
  email: string;
  password_hash: string; // local-only; not security-critical in standalone mode
  date_of_birth: string | null;
  risk_profile: string; // conservative|moderate|aggressive
  phone: string | null;
  currency: string; // INR
  monthly_income: number; // paise
  created_at: string;
}

export interface UserPreferences {
  user_id: string;
  theme: string; // light|dark|system
  sip_reminder_days: number;
  auto_lock_minutes: number;
}

export interface AssetType {
  id: string;
  name: string;
  slug: string; // mutual_fund|equity|fd|gold|real_estate|crypto|other
  sort_order: number;
}

export interface Asset {
  id: string;
  user_id: string;
  asset_type_id: string;
  name: string;
  invested_amount: number; // paise
  current_value: number; // paise
  quantity: number;
  purchase_date: string | null;
  investment_date: string | null;
  notes: string | null;
  isin: string | null;
  ticker: string | null;
  is_sip: boolean;
  sip_monthly_amount: number; // paise
  current_nav: number | null;
  price_per_unit: number | null;
  maturity_date: string | null;
  guaranteed_return_pct: number | null;
  details_json: string | null;
  created_at: string;
}

export interface AssetImage {
  id: string;
  asset_id: string;
  user_id: string;
  uri: string;
  label: string | null;
  created_at: string;
}

export interface SIPSchedule {
  id: string;
  user_id: string;
  asset_id: string;
  amount: number; // paise
  frequency: string; // monthly|quarterly
  next_due_date: string | null;
  status: string; // active|paused
  day_of_month: number | null;
  annual_step_up_pct: number;
  start_date: string | null;
  end_date: string | null;
  linked_bank: string | null;
}

export interface ExpenseCategory {
  id: string;
  user_id: string | null;
  name: string;
  is_system: boolean;
  budget_amount: number; // paise
  sort_order: number;
  color_hex: string;
}

export interface HouseholdMember {
  id: string;
  user_id: string;
  name: string;
  relationship: string | null;
  is_active: boolean;
}

export interface Expense {
  id: string;
  user_id: string;
  category_id: string;
  amount: number; // paise
  description: string;
  expense_date: string;
  spent_by_id: string | null;
  notes: string | null;
}

export interface Income {
  id: string;
  user_id: string;
  amount: number; // paise
  source: string;
  income_date: string;
}

export interface FinancialGoal {
  id: string;
  user_id: string;
  name: string;
  goal_type: string; // retirement|education|travel|emergency|home|wedding|custom
  target_amount: number; // paise
  monthly_needed: number; // paise
  target_date: string | null;
  priority: string; // low|medium|high
  icon: string | null;
  color_hex: string;
  notes: string | null;
  is_completed: boolean;
  created_at: string;
}

export interface GoalAssetLink {
  id: string;
  goal_id: string;
  asset_id: string;
  allocation_pct: number;
}

export interface InsurancePolicy {
  id: string;
  user_id: string;
  policy_type: string; // life|health|vehicle|home|accident|travel|other
  policy_name: string;
  provider: string | null;
  policy_number: string | null;
  holder_name: string | null;
  coverage_amount: number; // paise
  premium_amount: number; // paise
  premium_frequency: string; // monthly|quarterly|half-yearly|yearly|one-time
  start_date: string | null;
  expiry_date: string | null;
  next_due_date: string | null;
  nominee_name: string | null;
  nominee_relationship: string | null;
  notes: string | null;
  status: string; // active|renewed|lapsed
  claim_ratio: number | null;
  riders: string | null;
  tax_benefit: string | null;
  created_at: string;
}

export interface Loan {
  id: string;
  user_id: string;
  loan_type: string; // home|education|vehicle|personal|credit_card|gold|business|other
  provider: string | null;
  account_number: string | null;
  borrower_name: string | null;
  original_amount: number; // paise
  outstanding_amount: number; // paise
  interest_rate: number;
  emi_amount: number; // paise
  start_date: string | null;
  end_date: string | null;
  next_due_date: string | null;
  prepayment_total: number; // paise
  notes: string | null;
  status: string; // active|closed|defaulted
  interest_type: string | null;
  created_at: string;
}

export interface LoanPayment {
  id: string;
  loan_id: string;
  user_id: string;
  payment_type: string; // emi|prepayment
  amount: number; // paise
  principal_component: number;
  interest_component: number;
  payment_date: string;
  note: string | null;
}

export interface VaultCredentialCategory {
  id: string;
  user_id: string;
  name: string;
  icon: string | null;
}

export interface VaultCredential {
  id: string;
  user_id: string;
  category_id: string | null;
  service: string;
  username: string;
  password_enc: string; // stored value (standalone: lightly obfuscated)
  url: string | null;
  notes: string | null;
  password_strength: number;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  kind: string;
  is_read: boolean;
  created_at: string;
}

export interface PortfolioAllocationRow {
  type: string;
  value: number;
  invested: number;
  count: number;
  pct: number;
}

export interface PortfolioSummaryResult {
  total_invested: number;
  total_value: number;
  total_pnl: number;
  pnl_pct: number;
  asset_count: number;
  monthly_sip: number;
  active_sips: number;
  allocation: PortfolioAllocationRow[];
}
