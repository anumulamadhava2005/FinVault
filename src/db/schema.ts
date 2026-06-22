/**
 * SQLite schema mirroring the web app's tables (app/app/models.py).
 * Money columns are INTEGER paise; dates are ISO "YYYY-MM-DD" TEXT.
 */
export const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  date_of_birth TEXT,
  risk_profile TEXT NOT NULL DEFAULT 'moderate',
  phone TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  monthly_income INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system',
  sip_reminder_days INTEGER NOT NULL DEFAULT 3,
  auto_lock_minutes INTEGER NOT NULL DEFAULT 15
);

CREATE TABLE IF NOT EXISTS asset_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type_id TEXT NOT NULL REFERENCES asset_types(id),
  name TEXT NOT NULL,
  invested_amount INTEGER NOT NULL DEFAULT 0,
  current_value INTEGER NOT NULL DEFAULT 0,
  quantity REAL NOT NULL DEFAULT 0,
  purchase_date TEXT,
  investment_date TEXT,
  notes TEXT,
  isin TEXT,
  ticker TEXT,
  is_sip INTEGER NOT NULL DEFAULT 0,
  sip_monthly_amount INTEGER NOT NULL DEFAULT 0,
  current_nav REAL,
  price_per_unit REAL,
  maturity_date TEXT,
  guaranteed_return_pct REAL,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sip_schedules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  next_due_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  day_of_month INTEGER,
  annual_step_up_pct REAL NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  linked_bank TEXT
);

CREATE TABLE IF NOT EXISTS asset_images (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uri TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  local_path TEXT
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 0,
  budget_amount INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color_hex TEXT NOT NULL DEFAULT '#6B7280'
);

CREATE TABLE IF NOT EXISTS household_members (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES expense_categories(id),
  amount INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  expense_date TEXT NOT NULL,
  spent_by_id TEXT REFERENCES household_members(id) ON DELETE SET NULL,
  notes TEXT,
  bill_uri TEXT
);

CREATE TABLE IF NOT EXISTS income (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'Salary',
  income_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal_type TEXT NOT NULL DEFAULT 'custom',
  target_amount INTEGER NOT NULL,
  monthly_needed INTEGER NOT NULL DEFAULT 0,
  target_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  icon TEXT,
  color_hex TEXT NOT NULL DEFAULT '#2F8F6F',
  notes TEXT,
  is_completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goal_asset_links (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  allocation_pct REAL NOT NULL DEFAULT 100,
  UNIQUE (goal_id, asset_id)
);

CREATE TABLE IF NOT EXISTS insurance_policies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_type TEXT NOT NULL DEFAULT 'life',
  policy_name TEXT NOT NULL,
  provider TEXT,
  policy_number TEXT,
  holder_name TEXT,
  coverage_amount INTEGER NOT NULL DEFAULT 0,
  premium_amount INTEGER NOT NULL DEFAULT 0,
  premium_frequency TEXT NOT NULL DEFAULT 'yearly',
  start_date TEXT,
  expiry_date TEXT,
  next_due_date TEXT,
  nominee_name TEXT,
  nominee_relationship TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  claim_ratio REAL,
  riders TEXT,
  tax_benefit TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loan_type TEXT NOT NULL DEFAULT 'home',
  provider TEXT,
  account_number TEXT,
  borrower_name TEXT,
  original_amount INTEGER NOT NULL DEFAULT 0,
  outstanding_amount INTEGER NOT NULL DEFAULT 0,
  interest_rate REAL NOT NULL DEFAULT 0,
  emi_amount INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  next_due_date TEXT,
  prepayment_total INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  interest_type TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loan_payments (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL DEFAULT 'emi',
  amount INTEGER NOT NULL DEFAULT 0,
  principal_component INTEGER NOT NULL DEFAULT 0,
  interest_component INTEGER NOT NULL DEFAULT 0,
  payment_date TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS vault_credential_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS vault_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES vault_credential_categories(id) ON DELETE SET NULL,
  service TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  password_enc TEXT NOT NULL DEFAULT '',
  url TEXT,
  notes TEXT,
  password_strength INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  kind TEXT NOT NULL DEFAULT 'info',
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`;
