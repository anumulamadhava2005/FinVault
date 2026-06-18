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

/** Initialise schema + seed once. Returns the single user's id. */
export const initDb = (): string => {
  const db = getDb();
  db.execSync(SCHEMA);
  const existing = db.getFirstSync<{ id: string }>('SELECT id FROM users LIMIT 1');
  if (existing) return existing.id;
  return seedDemoData(db);
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
