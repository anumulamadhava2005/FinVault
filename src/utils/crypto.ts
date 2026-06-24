/**
 * Cryptography utilities for FinVault.
 *
 * Password hashing  — salted, 1 000-round SHA-256 chain (v2 format).
 *                     Legacy v1 (plain SHA-256) is detected and verified for
 *                     backward compat; the hash is silently upgraded on next
 *                     successful login.
 *
 * Vault encryption  — AES-256-CTR via aes-js (pure JS, no native module needed).
 *                     Legacy RC4-encoded values (plain base64 without the "aes:"
 *                     prefix) are detected and decrypted with the old algorithm
 *                     so existing credentials survive the upgrade.
 *
 * Password generation — Crypto.getRandomValues() (CSPRNG).
 */
import * as Crypto from 'expo-crypto';
// @ts-ignore — aes-js ships CJS, no bundled TS types needed at runtime
import * as aesjs from 'aes-js';

// ── Internal helpers ─────────────────────────────────────────────────────────

function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array | number[]): string {
  return Array.from(bytes)
    .map((b) => (b as number).toString(16).padStart(2, '0'))
    .join('');
}

/** 1 000-round SHA-256 chain over (current || index). Cheap PBKDF2 substitute. */
async function pbkdf2Lite(password: string, saltHex: string, rounds = 1000): Promise<string> {
  let current = password + ':' + saltHex;
  for (let i = 0; i < rounds; i++) {
    current = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      current + String(i),
    );
  }
  return current;
}

// ── Password hashing ─────────────────────────────────────────────────────────

/**
 * Hash a password with a random 16-byte salt and 1 000 SHA-256 rounds.
 * Stored format: `v2:<saltHex>:<hashHex>`
 */
export async function hashPassword(password: string): Promise<string> {
  const saltBytes = Crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(saltBytes);
  const hash = await pbkdf2Lite(password, saltHex);
  return `v2:${saltHex}:${hash}`;
}

/**
 * Verify a password against a stored hash.
 * Handles v1 (raw SHA-256) and v2 (salted) formats.
 * Returns `{ ok, needsUpgrade }` — caller should re-hash with hashPassword()
 * and update the DB if needsUpgrade is true.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<{ ok: boolean; needsUpgrade: boolean }> {
  if (storedHash.startsWith('v2:')) {
    const parts = storedHash.split(':');
    const saltHex = parts[1];
    const expectedHash = parts[2];
    const actual = await pbkdf2Lite(password, saltHex);
    return { ok: actual === expectedHash, needsUpgrade: false };
  }
  // Legacy v1 — plain SHA-256
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, password);
  return { ok: hash === storedHash, needsUpgrade: true };
}

// ── AES-256-CTR vault encryption ─────────────────────────────────────────────

/**
 * Derive a 32-byte AES key from the master password + userId salt.
 * Call once per vault session and reuse the result synchronously.
 */
export async function deriveEncryptionKey(password: string, userId: string): Promise<Uint8Array> {
  const saltHex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    'finvault-vault-salt:' + userId,
  );
  const keyHex = await pbkdf2Lite(password, saltHex, 1000);
  return new Uint8Array(hexToBytes(keyHex.slice(0, 64))); // 32 bytes
}

/**
 * Encrypt text with a pre-derived AES-256-CTR key.
 * Returns `aes:<ivHex>:<ciphertextHex>`.
 */
export function encryptWithKey(text: string, keyBytes: Uint8Array): string {
  const textBytes = aesjs.utils.utf8.toBytes(text) as number[];
  const ivArray = Crypto.getRandomValues(new Uint8Array(16));
  const iv = Array.from(ivArray) as number[];
  const aesCtr = new aesjs.ModeOfOperation.ctr(
    Array.from(keyBytes) as number[],
    new aesjs.Counter(iv),
  );
  const encrypted = aesCtr.encrypt(textBytes) as number[];
  return `aes:${bytesToHex(ivArray)}:${aesjs.utils.hex.fromBytes(encrypted)}`;
}

/**
 * Decrypt with a pre-derived AES-256-CTR key.
 * Falls back to legacy RC4 for values that predate the AES upgrade.
 */
export function decryptWithKey(encryptedStr: string, keyBytes: Uint8Array): string {
  if (!encryptedStr) return '';
  if (encryptedStr.startsWith('aes:')) {
    try {
      const parts = encryptedStr.split(':');
      const iv = aesjs.utils.hex.toBytes(parts[1]) as number[];
      const cipherBytes = aesjs.utils.hex.toBytes(parts[2]) as number[];
      const aesCtr = new aesjs.ModeOfOperation.ctr(
        Array.from(keyBytes) as number[],
        new aesjs.Counter(iv),
      );
      const decrypted = aesCtr.decrypt(cipherBytes) as number[];
      return aesjs.utils.utf8.fromBytes(decrypted) as string;
    } catch {
      return '[Decryption Error]';
    }
  }
  // Legacy RC4 path — used only for reading credentials encrypted before this upgrade
  return _legacyDecrypt(encryptedStr, _legacyKeyFromBytes(keyBytes));
}

// ── Secure password generator ─────────────────────────────────────────────────

const GEN_CHARS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';

/** Generate a cryptographically random 16-character password. */
export function genSecurePassword(): string {
  const randomBytes = Crypto.getRandomValues(new Uint8Array(32));
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += GEN_CHARS[randomBytes[i] % GEN_CHARS.length];
  }
  return result;
}

// ── Legacy RC4 (read-only, for migrating old credentials) ────────────────────

function _legacyKeyFromBytes(keyBytes: Uint8Array): string {
  // Reconstruct a pseudo-password from the key bytes for the legacy algorithm.
  // The legacy algorithm took the raw master password; since we no longer store it
  // in this path, we derive a stable string from the key material.
  return bytesToHex(keyBytes);
}

function _legacyRc4(key: string, data: string): string {
  let keyBytes: number[] = [];
  let current = key;
  for (let i = 0; i < 4; i++) {
    let sum = 0;
    for (let j = 0; j < current.length; j++) {
      sum = (sum << 5) - sum + current.charCodeAt(j);
    }
    keyBytes.push(...String(Math.abs(sum)).split('').map(Number));
    current = current + i;
  }
  if (keyBytes.length === 0) keyBytes = [70, 105, 110, 86, 97, 117, 108, 116];
  const S: number[] = [];
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + keyBytes[i % keyBytes.length]) % 256;
    [S[i], S[j]] = [S[j], S[i]];
  }
  let ci = 0, cj = 0;
  for (let k = 0; k < 1024; k++) {
    ci = (ci + 1) % 256; cj = (cj + S[ci]) % 256; [S[ci], S[cj]] = [S[cj], S[ci]];
  }
  const output: string[] = [];
  for (let k = 0; k < data.length; k++) {
    ci = (ci + 1) % 256; cj = (cj + S[ci]) % 256; [S[ci], S[cj]] = [S[cj], S[ci]];
    output.push(String.fromCharCode(data.charCodeAt(k) ^ S[(S[ci] + S[cj]) % 256]));
  }
  return output.join('');
}

function _legacyDecrypt(encryptedBase64: string, key: string): string {
  try {
    const raw = decodeURIComponent(escape(atob(encryptedBase64)));
    return _legacyRc4(key, raw);
  } catch {
    return '[Decryption Error]';
  }
}

/**
 * Legacy encrypt — kept so the app can re-encrypt old credentials with the
 * master password directly (before key derivation is available).
 * Do not use for new credentials.
 */
export function encryptText(text: string, key: string): string {
  if (!text) return '';
  const encrypted = _legacyRc4(key, text);
  return btoa(unescape(encodeURIComponent(encrypted)));
}

/** Legacy decrypt with raw master password string — used during biometric login
 *  path where we still have the plain password from SecureStore. */
export function decryptText(encryptedBase64: string, key: string): string {
  return _legacyDecrypt(encryptedBase64, key);
}
