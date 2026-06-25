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

/**
 * Versioned schema migrations.
 *
 * Rules:
 * - Never edit or remove an existing entry — only append new ones.
 * - Versions 1-21 are the original untracked ALTER TABLE statements; they are
 *   run with try/catch for backward compat (existing installs already applied
 *   them silently) and then recorded as applied.
 * - Versions 22+ are new and run exactly once, inside a transaction, with a
 *   hard failure if they error.
 */
const MIGRATIONS: { version: number; sql: string; legacy?: boolean }[] = [
  { version: 1,  legacy: true, sql: 'ALTER TABLE assets ADD COLUMN investment_date TEXT' },
  { version: 2,  legacy: true, sql: 'ALTER TABLE assets ADD COLUMN isin TEXT' },
  { version: 3,  legacy: true, sql: 'ALTER TABLE assets ADD COLUMN ticker TEXT' },
  { version: 4,  legacy: true, sql: 'ALTER TABLE assets ADD COLUMN is_sip INTEGER NOT NULL DEFAULT 0' },
  { version: 5,  legacy: true, sql: 'ALTER TABLE assets ADD COLUMN sip_monthly_amount INTEGER NOT NULL DEFAULT 0' },
  { version: 6,  legacy: true, sql: 'ALTER TABLE assets ADD COLUMN current_nav REAL' },
  { version: 7,  legacy: true, sql: 'ALTER TABLE assets ADD COLUMN price_per_unit REAL' },
  { version: 8,  legacy: true, sql: 'ALTER TABLE assets ADD COLUMN maturity_date TEXT' },
  { version: 9,  legacy: true, sql: 'ALTER TABLE assets ADD COLUMN guaranteed_return_pct REAL' },
  { version: 10, legacy: true, sql: 'ALTER TABLE assets ADD COLUMN details_json TEXT' },
  { version: 11, legacy: true, sql: 'ALTER TABLE sip_schedules ADD COLUMN day_of_month INTEGER' },
  { version: 12, legacy: true, sql: 'ALTER TABLE sip_schedules ADD COLUMN annual_step_up_pct REAL NOT NULL DEFAULT 0' },
  { version: 13, legacy: true, sql: 'ALTER TABLE sip_schedules ADD COLUMN start_date TEXT' },
  { version: 14, legacy: true, sql: 'ALTER TABLE sip_schedules ADD COLUMN end_date TEXT' },
  { version: 15, legacy: true, sql: 'ALTER TABLE sip_schedules ADD COLUMN linked_bank TEXT' },
  { version: 16, legacy: true, sql: 'ALTER TABLE assets ADD COLUMN last_price_updated_at TEXT' },
  { version: 17, legacy: true, sql: "ALTER TABLE user_preferences ADD COLUMN vault_lock_mode TEXT NOT NULL DEFAULT 'password'" },
  { version: 18, legacy: true, sql: 'ALTER TABLE expenses ADD COLUMN bill_uri TEXT' },
  { version: 19, legacy: true, sql: 'ALTER TABLE asset_images ADD COLUMN local_path TEXT' },
  { version: 20, legacy: true, sql: 'ALTER TABLE loans ADD COLUMN details_json TEXT' },
  { version: 21, legacy: true, sql: 'ALTER TABLE assets ADD COLUMN maturity_amount INTEGER' },
  // ── New tracked migrations go here (version 22+) ──────────────────────────
  { version: 22, sql: `CREATE TABLE IF NOT EXISTS sip_payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  scheduled_date TEXT NOT NULL,
  actual_date TEXT,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  created_at TEXT NOT NULL
)` },
  { version: 23, sql: `CREATE TABLE IF NOT EXISTS family_relationships (
  id TEXT PRIMARY KEY,
  primary_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'Family',
  created_at TEXT NOT NULL,
  UNIQUE(primary_user_id, member_user_id)
)` },
];

// Idempotent data fixes that run on every startup to correct existing databases.
const DATA_FIXES = [
  // 1. Re-point any assets that used the old standalone 'gold' type to 'digital_gold'
  `UPDATE assets
   SET asset_type_id = (SELECT id FROM asset_types WHERE slug = 'digital_gold' LIMIT 1)
   WHERE asset_type_id IN (SELECT id FROM asset_types WHERE slug = 'gold')`,
  // 2. Delete the standalone 'Gold' asset type so it no longer appears in dropdowns
  `DELETE FROM asset_types WHERE slug = 'gold'`,
  // 3. Ensure 'digital_gold' is named 'Gold'
  `UPDATE asset_types SET name = 'Gold' WHERE slug = 'digital_gold' AND name != 'Gold'`,
  // 4. Ensure 'physical_gold' is named 'Physical Gold'
  `UPDATE asset_types SET name = 'Physical Gold' WHERE slug = 'physical_gold' AND name != 'Physical Gold'`,
  // 5. Ensure NPS and Bank Account asset types exist (fixed ids → idempotent).
  `INSERT OR IGNORE INTO asset_types (id, name, slug, sort_order) VALUES ('type_nps', 'NPS', 'nps', 8)`,
  `INSERT OR IGNORE INTO asset_types (id, name, slug, sort_order) VALUES ('type_savings', 'Bank Account', 'savings', 9)`,
  // 6. Add sip_reminders_enabled preference column (idempotent — try/catch already wraps all fixes)
  `ALTER TABLE user_preferences ADD COLUMN sip_reminders_enabled INTEGER NOT NULL DEFAULT 1`,
];

const nowIso = () => new Date().toISOString();

/** Initialise schema + run pending migrations + apply data fixes. */
export const initDb = (): string | null => {
  const db = getDb();

  // 1. Apply base schema (all CREATE TABLE IF NOT EXISTS — safe to re-run).
  db.execSync(SCHEMA);

  // 2. Ensure the migration tracking table exists.
  db.runSync(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    INTEGER PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );

  // 3. Find the highest version already recorded.
  const row = db.getFirstSync<{ max_v: number | null }>(
    'SELECT MAX(version) AS max_v FROM schema_migrations',
  );
  const appliedMax = row?.max_v ?? 0;

  // 4. Run pending migrations.
  for (const m of MIGRATIONS) {
    if (m.version <= appliedMax) continue; // already applied

    if (m.legacy) {
      // Legacy migrations: best-effort (column may already exist from the old
      // untracked startup loop). Record as applied regardless of outcome.
      try { db.runSync(m.sql); } catch { /* column already exists — expected */ }
    } else {
      // New migrations: run inside a transaction; hard-fail on error.
      db.withTransactionSync(() => {
        db.runSync(m.sql);
      });
    }

    db.runSync(
      'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      [m.version, nowIso()],
    );
  }

  // 5. Idempotent data fixes (always run — safe by design).
  for (const sql of DATA_FIXES) {
    try { db.runSync(sql); } catch { /* safe to ignore */ }
  }

  const existing = db.getFirstSync<{ id: string }>('SELECT id FROM users LIMIT 1');
  return existing?.id ?? null;
};

// --- Thin query helpers -----------------------------------------------------

export const all = <T = any>(sql: string, params: SQLite.SQLiteBindParams = []): T[] => {
  try {
    return getDb().getAllSync<T>(sql, params);
  } catch (err) {
    if (__DEV__) console.error('[DB] all() failed:', sql, err);
    return [];
  }
};

export const first = <T = any>(
  sql: string,
  params: SQLite.SQLiteBindParams = [],
): T | null => {
  try {
    return getDb().getFirstSync<T>(sql, params);
  } catch (err) {
    if (__DEV__) console.error('[DB] first() failed:', sql, err);
    return null;
  }
};

export const run = (sql: string, params: SQLite.SQLiteBindParams = []): void => {
  try {
    getDb().runSync(sql, params);
  } catch (err) {
    if (__DEV__) console.error('[DB] run() failed:', sql, err);
    throw err; // re-throw so write operations can handle failures
  }
};

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
