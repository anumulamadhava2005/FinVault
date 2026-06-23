/**
 * SQLite data layer (expo-sqlite, synchronous API). Opens a single shared
 * connection, applies the schema, and seeds demo data on first run.
 */
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { SCHEMA } from './schema';
import { seedDemoData } from './seed';

let _db: SQLite.SQLiteDatabase | null = null;

export const getDb = (): SQLite.SQLiteDatabase => {
  if (!_db) _db = SQLite.openDatabaseSync('finvault.db');
  return _db;
};

/** UUID generator (expo-crypto). */
export const newId = (): string => Crypto.randomUUID();

const COLUMN_MIGRATIONS = [
  'ALTER TABLE assets ADD COLUMN investment_date TEXT',
  'ALTER TABLE assets ADD COLUMN isin TEXT',
  'ALTER TABLE assets ADD COLUMN ticker TEXT',
  'ALTER TABLE assets ADD COLUMN is_sip INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE assets ADD COLUMN sip_monthly_amount INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE assets ADD COLUMN current_nav REAL',
  'ALTER TABLE assets ADD COLUMN price_per_unit REAL',
  'ALTER TABLE assets ADD COLUMN maturity_date TEXT',
  'ALTER TABLE assets ADD COLUMN guaranteed_return_pct REAL',
  'ALTER TABLE assets ADD COLUMN details_json TEXT',
  'ALTER TABLE sip_schedules ADD COLUMN day_of_month INTEGER',
  'ALTER TABLE sip_schedules ADD COLUMN annual_step_up_pct REAL NOT NULL DEFAULT 0',
  'ALTER TABLE sip_schedules ADD COLUMN start_date TEXT',
  'ALTER TABLE sip_schedules ADD COLUMN end_date TEXT',
  'ALTER TABLE sip_schedules ADD COLUMN linked_bank TEXT',
  'ALTER TABLE assets ADD COLUMN last_price_updated_at TEXT',
  "ALTER TABLE user_preferences ADD COLUMN vault_lock_mode TEXT NOT NULL DEFAULT 'password'",
  'ALTER TABLE expenses ADD COLUMN bill_uri TEXT',
  'ALTER TABLE asset_images ADD COLUMN local_path TEXT',
  'ALTER TABLE loans ADD COLUMN details_json TEXT',
  'ALTER TABLE assets ADD COLUMN maturity_amount INTEGER',
];

// Idempotent data fixes that run on every startup to correct existing databases.
const DATA_FIXES = [
  // 1. Re-point any assets that used the old standalone 'gold' type to 'digital_gold'
  `UPDATE assets
   SET asset_type_id = (SELECT id FROM asset_types WHERE slug = 'digital_gold' LIMIT 1)
   WHERE asset_type_id IN (SELECT id FROM asset_types WHERE slug = 'gold')`,
  // 2. Delete the standalone 'Gold' asset type so it no longer appears in dropdowns
  `DELETE FROM asset_types WHERE slug = 'gold'`,
  // 3. Ensure 'digital_gold' is named 'Digital Gold'
  `UPDATE asset_types SET name = 'Digital Gold' WHERE slug = 'digital_gold' AND name != 'Digital Gold'`,
  // 4. Rename 'Physical Gold' to 'Gold'
  `UPDATE asset_types SET name = 'Gold' WHERE slug = 'physical_gold' AND name != 'Gold'`,
  // 5. Ensure NPS and Bank Account asset types exist (fixed ids → idempotent).
  `INSERT OR IGNORE INTO asset_types (id, name, slug, sort_order) VALUES ('type_nps', 'NPS', 'nps', 8)`,
  `INSERT OR IGNORE INTO asset_types (id, name, slug, sort_order) VALUES ('type_savings', 'Bank Account', 'savings', 9)`,
];

/** Initialise schema + seed once. Returns the single user's id or null. */
export const initDb = (): string | null => {
  const db = getDb();
  db.execSync(SCHEMA);
  for (const sql of COLUMN_MIGRATIONS) {
    try { db.runSync(sql); } catch { /* column already exists */ }
  }
  for (const sql of DATA_FIXES) {
    try { db.runSync(sql); } catch { /* safe to ignore */ }
  }
  const existing = db.getFirstSync<{ id: string }>('SELECT id FROM users LIMIT 1');
  if (existing) return existing.id;
  return null;
};

// --- Thin query helpers -----------------------------------------------------

export const all = <T = any>(sql: string, params: SQLite.SQLiteBindParams = []): T[] =>
  getDb().getAllSync<T>(sql, params);

export const first = <T = any>(
  sql: string,
  params: SQLite.SQLiteBindParams = [],
): T | null => getDb().getFirstSync<T>(sql, params);

export const run = (sql: string, params: SQLite.SQLiteBindParams = []) =>
  getDb().runSync(sql, params);

/** Run a function inside a transaction (sync). */
export const tx = (fn: (db: SQLite.SQLiteDatabase) => void): void => {
  const db = getDb();
  db.withTransactionSync(() => fn(db));
};

/**
 * Insert a row from a plain object. Booleans are coerced to 0/1, undefined to
 * null. Returns the inserted id (caller should include `id`).
 */
export const insert = (table: string, row: Record<string, unknown>): void => {
  const keys = Object.keys(row);
  const placeholders = keys.map(() => '?').join(', ');
  const values = keys.map((k) => coerce(row[k]));
  run(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
    values as SQLite.SQLiteBindParams,
  );
};

export const update = (
  table: string,
  id: string,
  row: Record<string, unknown>,
): void => {
  const keys = Object.keys(row);
  if (!keys.length) return;
  const assignments = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => coerce(row[k]));
  run(`UPDATE ${table} SET ${assignments} WHERE id = ?`, [
    ...(values as any[]),
    id,
  ] as SQLite.SQLiteBindParams);
};

export const remove = (table: string, id: string): void =>
  void run(`DELETE FROM ${table} WHERE id = ?`, [id]);

const coerce = (v: unknown): SQLite.SQLiteBindValue => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v as SQLite.SQLiteBindValue;
};
