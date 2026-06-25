/**
 * App-wide context: initializes SQLite DB, handles registration state,
 * manages biometric and password authentication gates, stores master passwords
 * in SecureStore (encrypted OS keychain), and triggers background asset price syncs.
 *
 * Security changes vs. v1:
 *  - Master password stored in expo-secure-store (OS keychain), not AsyncStorage.
 *  - Password hashing uses salted v2 format (pbkdf2-lite, 1 000 rounds).
 *    Legacy v1 hashes are transparently upgraded on next successful login.
 *  - Auto-lock: AppState listener triggers logout after the user's configured
 *    inactivity timeout when the app returns from background.
 */
import React, { createContext, useContext, useMemo, useState, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useColorScheme } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { initDb, first, run, all, update, newId, getDb } from '../db';
import { hashPassword, verifyPassword } from '../utils/crypto';
import { seedDemoData, seedInitialMetadata } from '../db/seed';
import { fetchEquityPrice, fetchMutualFundNav, fetchGoldPrice } from '../api/assets/assetsApi';
import { nowISO } from '../utils/date';
import { scheduleSipReminders, setupNotificationChannel } from '../services/sipPushNotifications';

type ThemeMode = 'light' | 'dark' | 'system';
type VaultLockMode = 'biometric' | 'password';

// SecureStore keys are limited to alphanumeric + . _ -
const secureKey = (userId: string) => `finvault_pw_${userId.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

const lockoutKey = (uid: string) => `@finvault_lockout_${uid}`;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

interface AppState_ {
  ready: boolean;
  userId: string | null;
  isAuthenticated: boolean;
  isRegistered: boolean;
  isRegistering: boolean;
  setIsRegistering: (val: boolean) => void;
  profiles: Array<{ id: string; name: string; email: string }>;
  switchUser: (id: string) => Promise<void>;
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;
  isDark: boolean;
  refreshKey: number;
  refresh: () => void;
  vaultLockMode: VaultLockMode;
  setVaultLockMode: (mode: VaultLockMode) => void;
  masterPassword: string | null;
  signUp: (
    name: string,
    email: string,
    password: string,
    income: number,
    riskProfile: string,
    lockMode: VaultLockMode,
    seedDemo: boolean,
    dob?: string,
  ) => Promise<boolean>;
  loginWithPassword: (password: string) => Promise<boolean>;
  loginWithBiometrics: () => Promise<boolean>;
  logout: () => Promise<void>;
  logoutAndReset: () => Promise<void>;
  syncPricesSilently: () => Promise<void>;
  isSyncing: boolean;
}

const Ctx = createContext<AppState_ | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const system = useColorScheme();
  const [refreshKey, setRefreshKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [vaultLockMode, setVaultLockModeState] = useState<VaultLockMode>('password');
  const [masterPassword, setMasterPassword] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Tracks when the app moved to background for auto-lock calculation
  const backgroundedAt = useRef<number | null>(null);

  // Tracks the last successful price sync timestamp for rate-limiting
  const lastSyncAt = useRef<number>(0);

  // ── DB init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const setup = async () => {
      initDb();
      const dbUsers = all<{ id: string; name: string; email: string }>(
        'SELECT id, full_name as name, email FROM users',
      );
      setProfiles(dbUsers);
      setIsRegistered(dbUsers.length > 0);

      if (dbUsers.length > 0) {
        const savedActiveId = await AsyncStorage.getItem('@finvault_active_user_id');
        const activeExists = savedActiveId ? dbUsers.some((u) => u.id === savedActiveId) : false;
        const currentActiveId = activeExists ? savedActiveId! : dbUsers[0].id;

        setUserId(currentActiveId);
        await AsyncStorage.setItem('@finvault_active_user_id', currentActiveId);

        const prefs = first<{ theme: ThemeMode; vault_lock_mode: VaultLockMode }>(
          'SELECT theme, vault_lock_mode FROM user_preferences WHERE user_id = ?',
          [currentActiveId],
        );
        if (prefs) {
          setThemeModeState(prefs.theme || 'system');
          setVaultLockModeState(prefs.vault_lock_mode || 'password');
        }
        setIsRegistering(false);
      } else {
        setIsRegistering(true);
      }
      setReady(true);
    };
    setup();
  }, [refreshKey]);

  // ── Auto-lock on background / foreground ─────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundedAt.current = Date.now();
      } else if (nextState === 'active') {
        if (backgroundedAt.current !== null) {
          const elapsedMs = Date.now() - backgroundedAt.current;
          backgroundedAt.current = null;

          const prefs = first<{ auto_lock_minutes: number }>(
            'SELECT auto_lock_minutes FROM user_preferences WHERE user_id = ?',
            [userId],
          );
          const limitMs = (prefs?.auto_lock_minutes ?? 15) * 60 * 1000;
          if (elapsedMs >= limitMs) {
            setMasterPassword(null);
            setIsAuthenticated(false);
          }
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [isAuthenticated, userId]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const setThemeMode = (m: ThemeMode) => {
    setThemeModeState(m);
    if (userId) run('UPDATE user_preferences SET theme = ? WHERE user_id = ?', [m, userId]);
  };

  const setVaultLockMode = (mode: VaultLockMode) => {
    setVaultLockModeState(mode);
    if (userId)
      run('UPDATE user_preferences SET vault_lock_mode = ? WHERE user_id = ?', [mode, userId]);
  };

  const switchUser = async (targetId: string) => {
    await AsyncStorage.setItem('@finvault_active_user_id', targetId);
    setUserId(targetId);
    setMasterPassword(null);
    setIsAuthenticated(false);

    const prefs = first<{ theme: ThemeMode; vault_lock_mode: VaultLockMode }>(
      'SELECT theme, vault_lock_mode FROM user_preferences WHERE user_id = ?',
      [targetId],
    );
    if (prefs) {
      setThemeModeState(prefs.theme || 'system');
      setVaultLockModeState(prefs.vault_lock_mode || 'password');
    } else {
      setThemeModeState('system');
      setVaultLockModeState('password');
    }
  };

  const isDark = themeMode === 'system' ? system === 'dark' : themeMode === 'dark';

  // ── Sign-up ──────────────────────────────────────────────────────────────
  const signUp = async (
    name: string,
    email: string,
    password: string,
    income: number,
    riskProfile: string,
    lockMode: VaultLockMode,
    seedDemo: boolean,
    dob?: string,
  ): Promise<boolean> => {
    const newUid = newId();
    const hashedPassword = await hashPassword(password); // salted v2
    const dateStr = nowISO();

    try {
      run(
        `INSERT INTO users (id, full_name, email, password_hash, risk_profile, monthly_income, date_of_birth, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [newUid, name, email, hashedPassword, riskProfile, income * 100, dob ?? null, dateStr],
      );
      run(
        `INSERT INTO user_preferences (user_id, theme, vault_lock_mode) VALUES (?, ?, ?)`,
        [newUid, 'system', lockMode],
      );

      if (seedDemo) {
        seedDemoData(getDb(), newUid, password);
      } else {
        seedInitialMetadata(getDb(), newUid);
      }

      // Store master password in the OS secure keychain
      await SecureStore.setItemAsync(secureKey(newUid), password);
      await AsyncStorage.setItem('@finvault_active_user_id', newUid);

      setUserId(newUid);
      setMasterPassword(password);
      setVaultLockModeState(lockMode);

      const dbUsers = all<{ id: string; name: string; email: string }>(
        'SELECT id, full_name as name, email FROM users',
      );
      setProfiles(dbUsers);
      setIsRegistered(true);
      setIsRegistering(false);
      setIsAuthenticated(true);
      refresh();

      if (seedDemo) setTimeout(() => syncPricesSilentlyInternal(newUid), 1000);
      setTimeout(() => {
        setupNotificationChannel().catch(() => {});
        scheduleSipReminders(newUid).catch(() => {});
      }, 2500);
      return true;
    } catch (err) {
      if (__DEV__) console.error('Sign up failed', err);
      return false;
    }
  };

  // ── Login with password ──────────────────────────────────────────────────
  const loginWithPassword = async (password: string): Promise<boolean> => {
    if (!userId) return false;

    // Check persisted lockout
    const lockoutRaw = await AsyncStorage.getItem(lockoutKey(userId));
    if (lockoutRaw) {
      const { attempts, lockedUntil } = JSON.parse(lockoutRaw);
      if (lockedUntil && Date.now() < lockedUntil) {
        return false; // still locked
      }
    }

    const user = first<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!user) return false;

    const { ok, needsUpgrade } = await verifyPassword(password, user.password_hash);

    if (!ok) {
      // Increment failed attempts
      const existing = lockoutRaw ? JSON.parse(lockoutRaw) : { attempts: 0, lockedUntil: null };
      const newAttempts = (existing.attempts || 0) + 1;
      const newLockout = newAttempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
      await AsyncStorage.setItem(lockoutKey(userId), JSON.stringify({ attempts: newAttempts, lockedUntil: newLockout }));
      return false;
    }

    // Successful login — clear lockout
    await AsyncStorage.removeItem(lockoutKey(userId));

    if (needsUpgrade) {
      const newHash = await hashPassword(password);
      run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, userId]);
    }

    await SecureStore.setItemAsync(secureKey(userId), password);
    setMasterPassword(password);
    setIsAuthenticated(true);

    setTimeout(() => syncPricesSilentlyInternal(userId), 1000);
    setTimeout(() => {
      setupNotificationChannel().catch(() => {});
      scheduleSipReminders(userId).catch(() => {});
    }, 2000);
    return true;
  };

  // ── Login with biometrics ────────────────────────────────────────────────
  const loginWithBiometrics = async (): Promise<boolean> => {
    if (!userId) return false;

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) return false;

    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock FinVault',
      fallbackLabel: 'Use Master Password',
    });
    if (!res.success) return false;

    const storedPassword = await SecureStore.getItemAsync(secureKey(userId));
    if (storedPassword) setMasterPassword(storedPassword);
    setIsAuthenticated(true);

    setTimeout(() => syncPricesSilentlyInternal(userId), 1000);
    setTimeout(() => {
      setupNotificationChannel().catch(() => {});
      scheduleSipReminders(userId).catch(() => {});
    }, 2000);
    return true;
  };

  // ── Logout ───────────────────────────────────────────────────────────────
  const logout = async () => {
    setMasterPassword(null);
    setIsAuthenticated(false);
  };

  const logoutAndReset = async () => {
    if (!userId) return;
    try {
      run('DELETE FROM users WHERE id = ?', [userId]);
    } catch (e) {
      if (__DEV__) console.error('Failed to delete user during logoutAndReset', e);
    }

    await SecureStore.deleteItemAsync(secureKey(userId));

    const dbUsers = all<{ id: string; name: string; email: string }>(
      'SELECT id, full_name as name, email FROM users',
    );
    setProfiles(dbUsers);

    if (dbUsers.length > 0) {
      await switchUser(dbUsers[0].id);
    } else {
      await AsyncStorage.removeItem('@finvault_active_user_id');
      setUserId(null);
      setIsRegistered(false);
      setIsRegistering(true);
      setMasterPassword(null);
      setThemeModeState('system');
      setVaultLockModeState('password');
    }
    setIsAuthenticated(false);
    refresh();
  };

  // ── Silent price sync ────────────────────────────────────────────────────
  const syncPricesSilentlyInternal = async (activeUserId: string) => {
    const MIN_SYNC_GAP_MS = 5 * 60 * 1000;
    if (Date.now() - lastSyncAt.current < MIN_SYNC_GAP_MS) return;
    if (isSyncing) return;
    setIsSyncing(true);
    lastSyncAt.current = Date.now();
    if (__DEV__) console.log('Starting silent background price sync…');

    try {
      const assets = all<{
        id: string;
        name: string;
        quantity: number;
        slug: string;
        ticker: string | null;
        isin: string | null;
        details_json: string | null;
      }>(
        `SELECT a.id, a.name, a.quantity, a.ticker, a.isin, a.details_json, t.slug
         FROM assets a JOIN asset_types t ON t.id = a.asset_type_id WHERE a.user_id = ?`,
        [activeUserId],
      );

      const timestamp = nowISO();
      const goldTypes = new Set(['digital_gold', 'physical_gold', 'sgb', 'gold']);
      let goldPricePerGram: number | null = null;
      let goldFetchFailed = false;

      for (const asset of assets) {
        try {
          if (asset.slug === 'equity' && asset.ticker) {
            const res = await fetchEquityPrice(asset.ticker);
            if (res.data) {
              update('assets', asset.id, {
                current_value: Math.round(res.data.price * asset.quantity * 100),
                price_per_unit: res.data.price,
                last_price_updated_at: timestamp,
              });
            }
          } else if (asset.slug === 'mutual_fund' && (asset.name || asset.isin)) {
            let cachedCode: number | undefined;
            if (asset.details_json) {
              try {
                const details = JSON.parse(asset.details_json);
                if (details._mfapi_scheme_code) cachedCode = details._mfapi_scheme_code;
              } catch { /* ignore */ }
            }
            const res = await fetchMutualFundNav(
              asset.name || asset.isin || '',
              undefined,
              undefined,
              cachedCode,
            );
            if (res.data) {
              const updatePayload: Record<string, unknown> = {
                current_value: Math.round(res.data.nav * asset.quantity * 100),
                current_nav: res.data.nav,
                last_price_updated_at: timestamp,
              };
              if (res.schemeCode && !cachedCode) {
                let existing: Record<string, unknown> = {};
                if (asset.details_json) {
                  try { existing = JSON.parse(asset.details_json); } catch { /* ignore */ }
                }
                existing._mfapi_scheme_code = res.schemeCode;
                updatePayload.details_json = JSON.stringify(existing);
              }
              update('assets', asset.id, updatePayload);
            }
          } else if (goldTypes.has(asset.slug)) {
            if (!goldPricePerGram && !goldFetchFailed) {
              const res = await fetchGoldPrice();
              if (res.data) goldPricePerGram = res.data.price_per_gram_inr;
              else goldFetchFailed = true;
            }
            if (goldPricePerGram && asset.quantity) {
              update('assets', asset.id, {
                current_value: Math.round(goldPricePerGram * asset.quantity * 100),
                price_per_unit: goldPricePerGram,
                last_price_updated_at: timestamp,
              });
            }
          }
        } catch { /* Individual asset sync failure doesn't block others */ }
      }
      if (__DEV__) console.log('Silent background price sync completed.');
      refresh();
    } catch (err) {
      if (__DEV__) console.error('Silent sync failed', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncPricesSilently = async () => {
    if (userId) await syncPricesSilentlyInternal(userId);
  };

  const value = useMemo<AppState_>(
    () => ({
      ready,
      userId,
      isAuthenticated,
      isRegistered,
      isRegistering,
      setIsRegistering,
      profiles,
      switchUser,
      themeMode,
      setThemeMode,
      isDark,
      refreshKey,
      refresh,
      vaultLockMode,
      setVaultLockMode,
      masterPassword,
      signUp,
      loginWithPassword,
      loginWithBiometrics,
      logout,
      logoutAndReset,
      syncPricesSilently,
      isSyncing,
    }),
    [
      ready,
      userId,
      isAuthenticated,
      isRegistered,
      isRegistering,
      profiles,
      themeMode,
      isDark,
      refreshKey,
      vaultLockMode,
      masterPassword,
      isSyncing,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useApp = (): AppState_ => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
