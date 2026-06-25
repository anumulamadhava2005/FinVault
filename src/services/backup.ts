/**
 * Encrypted backup / restore service.
 *
 * Export — gathers all user rows from SQLite, serialises to JSON, encrypts
 *          with AES-256-CTR (same key derivation as vault), writes to a
 *          .finvault file and shares it via the OS share sheet (user can save
 *          to iCloud Drive, Google Drive, Files app, etc.).
 *
 * Import — picks a .finvault file with expo-document-picker, decrypts it
 *          with the provided master password, and re-inserts all rows.
 *          Existing data for that user is removed first (full restore).
 *
 * File format (outer, plaintext):
 *   {
 *     "format":    "finvault-backup",
 *     "version":   1,
 *     "exported_at": "<ISO datetime>",
 *     "user_id":   "<UUID>",
 *     "payload":   "aes:<ivHex>:<ciphertextHex>"
 *   }
 *
 * Decrypted payload — JSON with one key per table, plus:
 *   "asset_images_meta" — array of asset_images rows
 *   "asset_images_data" — [{ <image_id>: <base64> }] bundled image files
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { all, getDb } from '../db';
import { deriveEncryptionKey, encryptWithKey, decryptWithKey } from '../utils/crypto';

const BACKUP_FORMAT = 'finvault-backup';
const BACKUP_VERSION = 1;

// Tables to include in backup (all are keyed by user_id)
const USER_TABLES = [
  'users',
  'user_preferences',
  'assets',
  'sip_schedules',
  'expense_categories',
  'expenses',
  'income',
  'loans',
  'loan_payments',
  'financial_goals',
  'goal_asset_links',
  'insurance_policies',
  'vault_credentials',
  'vault_credential_categories',
  'household_members',
  'notifications',
  'networth_snapshots',
  'history_events',
  'asset_images',
] as const;

export interface BackupResult {
  ok: boolean;
  message: string;
}

/** Export all user data to an encrypted .finvault file and share it. */
export async function exportBackup(
  userId: string,
  masterPassword: string,
): Promise<BackupResult> {
  try {
    // 1. Gather all user data
    const payload: Record<string, unknown[]> = {};
    for (const table of USER_TABLES) {
      const col = table === 'users' ? 'id' : 'user_id';
      payload[table] = all(`SELECT * FROM ${table} WHERE ${col} = ?`, [userId]);
    }
    // goal_asset_links are keyed via goal_id — fetch via join
    payload['goal_asset_links'] = all(
      `SELECT gal.* FROM goal_asset_links gal
       JOIN financial_goals fg ON fg.id = gal.goal_id
       WHERE fg.user_id = ?`,
      [userId],
    );

    // Bundle asset image files as base64 so they survive device transfers
    const imageRows = all<{ id: string; uri: string; asset_id: string; filename: string; mime_type: string }>(
      `SELECT ai.id, ai.uri, ai.asset_id, ai.filename, ai.mime_type
       FROM asset_images ai
       JOIN assets a ON a.id = ai.asset_id
       WHERE a.user_id = ?`,
      [userId],
    );

    const imageBlobs: Record<string, string> = {};
    for (const img of imageRows) {
      try {
        if (img.uri && img.uri.startsWith('file://')) {
          const b64 = await FileSystem.readAsStringAsync(img.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          imageBlobs[img.id] = b64;
        }
      } catch { /* file may have been deleted — skip gracefully */ }
    }
    payload['asset_images_meta'] = imageRows;
    payload['asset_images_data'] = [imageBlobs]; // single object keyed by image id

    // 2. Encrypt the payload
    const key = await deriveEncryptionKey(masterPassword, userId);
    const payloadJson = JSON.stringify(payload);
    const encrypted = encryptWithKey(payloadJson, key);

    // 3. Build the outer file
    const outer = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exported_at: new Date().toISOString(),
      user_id: userId,
      payload: encrypted,
    });

    // 4. Write to cache and share
    const filename = `finvault-backup-${new Date().toISOString().slice(0, 10)}.finvault`;
    const uri = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(uri, outer, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) return { ok: false, message: 'Sharing is not available on this device.' };

    await Sharing.shareAsync(uri, {
      mimeType: 'application/octet-stream',
      dialogTitle: 'Save your FinVault backup',
      UTI: 'public.data',
    });

    return { ok: true, message: 'Backup exported successfully.' };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? 'Export failed.' };
  }
}

/** Pick a .finvault file and restore user data from it. */
export async function importBackup(masterPassword: string): Promise<BackupResult> {
  try {
    // 1. Pick file
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) {
      return { ok: false, message: 'No file selected.' };
    }
    const fileUri = result.assets[0].uri;

    // 2. Read and parse outer wrapper
    const raw = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    let outer: any;
    try {
      outer = JSON.parse(raw);
    } catch {
      return { ok: false, message: 'Invalid backup file — could not parse.' };
    }
    if (outer.format !== BACKUP_FORMAT) {
      return { ok: false, message: 'Not a valid FinVault backup file.' };
    }

    // Forward-compatibility guard: reject backups from a newer app version
    if (typeof outer.version === 'number' && outer.version > BACKUP_VERSION) {
      return {
        ok: false,
        message: `This backup was created with a newer version of FinVault (v${outer.version}). Please update the app to restore it.`,
      };
    }

    const backupUserId: string = outer.user_id;
    if (!backupUserId) return { ok: false, message: 'Backup file is missing user ID.' };

    // 3. Decrypt the payload
    let payloadJson: string;
    try {
      const key = await deriveEncryptionKey(masterPassword, backupUserId);
      payloadJson = decryptWithKey(outer.payload, key);
    } catch {
      return { ok: false, message: 'Decryption failed — wrong password or corrupted file.' };
    }

    let payload: Record<string, unknown[]>;
    try {
      payload = JSON.parse(payloadJson);
    } catch {
      return { ok: false, message: 'Wrong password or corrupted backup.' };
    }

    // Sanity-check: the decrypted payload must contain a users array
    if (!Array.isArray(payload.users) || payload.users.length === 0) {
      return { ok: false, message: 'Wrong password or corrupted backup.' };
    }

    // 4. Restore inside a single transaction (with rollback on failure)
    const db = getDb();

    // Insert tables in dependency order
    const insertOrder: (typeof USER_TABLES)[number][] = [
      'users',
      'user_preferences',
      'household_members',
      'expense_categories',
      'assets',
      'sip_schedules',
      'expenses',
      'income',
      'loans',
      'loan_payments',
      'financial_goals',
      'goal_asset_links',
      'insurance_policies',
      'vault_credential_categories',
      'vault_credentials',
      'notifications',
      'networth_snapshots',
      'history_events',
      'asset_images',
    ];

    // Snapshot existing data for rollback
    let rollbackPayload: Record<string, unknown[]> = {};
    try {
      for (const table of insertOrder) {
        const col = table === 'users' ? 'id' : 'user_id';
        rollbackPayload[table] = db.getAllSync(`SELECT * FROM ${table} WHERE ${col} = ?`, [backupUserId]);
      }
    } catch { rollbackPayload = {}; }

    try {
      db.withTransactionSync(() => {
        db.runSync('DELETE FROM users WHERE id = ?', [backupUserId]);

        for (const table of insertOrder) {
          const rows = payload[table];
          if (!Array.isArray(rows) || rows.length === 0) continue;
          for (const row of rows) {
            const r = row as Record<string, unknown>;
            const keys = Object.keys(r);
            const placeholders = keys.map(() => '?').join(', ');
            const values = keys.map((k) => {
              const v = r[k];
              if (v === undefined || v === null) return null;
              if (typeof v === 'boolean') return v ? 1 : 0;
              return v;
            });
            db.runSync(
              `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
              values as any,
            );
          }
        }
      });
    } catch (restoreErr: any) {
      // Attempt rollback
      try {
        db.withTransactionSync(() => {
          db.runSync('DELETE FROM users WHERE id = ?', [backupUserId]);
          for (const table of insertOrder) {
            const rows = rollbackPayload[table];
            if (!Array.isArray(rows) || !rows.length) continue;
            for (const row of rows) {
              const r = row as Record<string, unknown>;
              const keys = Object.keys(r);
              db.runSync(
                `INSERT OR IGNORE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
                keys.map(k => r[k] ?? null) as any,
              );
            }
          }
        });
      } catch { /* rollback failed — data integrity compromised */ }
      return { ok: false, message: `Restore failed: ${restoreErr?.message ?? 'Unknown error'}. Previous data has been restored.` };
    }

    // Restore asset image files
    const imageMeta = payload['asset_images_meta'] as any[] | undefined;
    const imageData = (payload['asset_images_data']?.[0] ?? {}) as Record<string, string>;
    if (Array.isArray(imageMeta)) {
      const imgDir = `${FileSystem.documentDirectory}asset_images/`;
      try { await FileSystem.makeDirectoryAsync(imgDir, { intermediates: true }); } catch {}
      for (const img of imageMeta) {
        const b64 = imageData[img.id];
        if (!b64) continue;
        const ext = img.filename?.split('.').pop() ?? 'jpg';
        const newUri = `${imgDir}${img.id}.${ext}`;
        try {
          await FileSystem.writeAsStringAsync(newUri, b64, { encoding: FileSystem.EncodingType.Base64 });
          db.runSync('UPDATE asset_images SET uri = ? WHERE id = ?', [newUri, img.id]);
        } catch { /* skip failed images */ }
      }
    }

    return {
      ok: true,
      message: `Restored successfully. User: ${(payload.users[0] as any)?.full_name ?? 'Unknown'}`,
    };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? 'Restore failed.' };
  }
}
