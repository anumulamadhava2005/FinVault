/**
 * App-wide context: initializes SQLite DB, handles registration state,
 * manages biometric and password authentication gates, stores master passwords
 * in-memory for secure vault decryption, and triggers background asset price syncs.
 */
import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initDb, first, run, all, update, newId, getDb } from '../db';
import { hashPassword } from '../utils/crypto';
import { seedDemoData, seedInitialMetadata } from '../db/seed';
import { fetchEquityPrice, fetchMutualFundNav, fetchGoldPrice } from '../api/assets/assetsApi';
import { nowISO } from '../utils/date';

type ThemeMode = 'light' | 'dark' | 'system';
type VaultLockMode = 'biometric' | 'password';

interface AppState {
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
    seedDemo: boolean
  ) => Promise<boolean>;
  loginWithPassword: (password: string) => Promise<boolean>;
  loginWithBiometrics: () => Promise<boolean>;
  logout: () => Promise<void>;
  logoutAndReset: () => Promise<void>;
  syncPricesSilently: () => Promise<void>;
  isSyncing: boolean;
}

const Ctx = createContext<AppState | null>(null);

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

  // Initialize the database on mount
  useEffect(() => {
    const setup = async () => {
      const activeId = initDb();
      const dbUsers = all<{ id: string; name: string; email: string }>('SELECT id, full_name as name, email FROM users');
      setProfiles(dbUsers);
      setIsRegistered(dbUsers.length > 0);

      if (dbUsers.length > 0) {
        const savedActiveId = await AsyncStorage.getItem('@finvault_active_user_id');
        const activeExists = savedActiveId ? dbUsers.some(u => u.id === savedActiveId) : false;
        const currentActiveId = activeExists ? savedActiveId! : dbUsers[0].id;
        
        setUserId(currentActiveId);
        await AsyncStorage.setItem('@finvault_active_user_id', currentActiveId);

        // Fetch user preferences
        const prefs = first<{ theme: ThemeMode; vault_lock_mode: VaultLockMode }>(
          'SELECT theme, vault_lock_mode FROM user_preferences WHERE user_id = ?',
          [currentActiveId]
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

  const refresh = () => setRefreshKey((k) => k + 1);

  const setThemeMode = (m: ThemeMode) => {
    setThemeModeState(m);
    if (userId) {
      run('UPDATE user_preferences SET theme = ? WHERE user_id = ?', [m, userId]);
    }
  };

  const setVaultLockMode = (mode: VaultLockMode) => {
    setVaultLockModeState(mode);
    if (userId) {
      run('UPDATE user_preferences SET vault_lock_mode = ? WHERE user_id = ?', [mode, userId]);
    }
  };

  const switchUser = async (targetId: string) => {
    await AsyncStorage.setItem('@finvault_active_user_id', targetId);
    setUserId(targetId);
    setMasterPassword(null);
    setIsAuthenticated(false);

    const prefs = first<{ theme: ThemeMode; vault_lock_mode: VaultLockMode }>(
      'SELECT theme, vault_lock_mode FROM user_preferences WHERE user_id = ?',
      [targetId]
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

  const signUp = async (
    name: string,
    email: string,
    password: string,
    income: number,
    riskProfile: string,
    lockMode: VaultLockMode,
    seedDemo: boolean
  ): Promise<boolean> => {
    const newUid = newId();
    const hashedPassword = await hashPassword(password);
    const dateStr = nowISO();

    try {
      // 1. Insert User
      run(
        `INSERT INTO users (id, full_name, email, password_hash, risk_profile, monthly_income, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newUid, name, email, hashedPassword, riskProfile, income * 100, dateStr]
      );

      // 2. Insert User Preferences
      run(
        `INSERT INTO user_preferences (user_id, theme, vault_lock_mode)
         VALUES (?, ?, ?)`,
        [newUid, 'system', lockMode]
      );

      // 3. Seed appropriate data
      if (seedDemo) {
        seedDemoData(getDb(), newUid, password);
      } else {
        seedInitialMetadata(getDb(), newUid);
      }

      // 4. Save Master Password securely in local storage
      await AsyncStorage.setItem('@finvault_master_password_' + newUid, password);
      await AsyncStorage.setItem('@finvault_active_user_id', newUid);

      // 5. Update state
      setUserId(newUid);
      setMasterPassword(password);
      setVaultLockModeState(lockMode);
      
      const dbUsers = all<{ id: string; name: string; email: string }>('SELECT id, full_name as name, email FROM users');
      setProfiles(dbUsers);
      setIsRegistered(true);
      setIsRegistering(false);
      setIsAuthenticated(true);
      refresh();
      
      // Trigger background price sync immediately on signup if seeding demo data
      if (seedDemo) {
        setTimeout(() => syncPricesSilentlyInternal(newUid), 1000);
      }

      return true;
    } catch (err) {
      console.error('Sign up failed', err);
      return false;
    }
  };

  const loginWithPassword = async (password: string): Promise<boolean> => {
    if (!userId) return false;
    const user = first<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!user) return false;

    const hashed = await hashPassword(password);
    if (hashed === user.password_hash) {
      setMasterPassword(password);
      await AsyncStorage.setItem('@finvault_master_password_' + userId, password);
      setIsAuthenticated(true);
      
      // Start background price sync silently
      setTimeout(() => syncPricesSilentlyInternal(userId), 1000);
      
      return true;
    }
    return false;
  };

  const loginWithBiometrics = async (): Promise<boolean> => {
    if (!userId) return false;

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      console.log('Biometrics not available or not set up on device.');
      return false;
    }

    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock FinVault',
      fallbackLabel: 'Use Master Password',
    });

    if (res.success) {
      const storedPassword = await AsyncStorage.getItem('@finvault_master_password_' + userId);
      if (storedPassword) {
        setMasterPassword(storedPassword);
      }
      setIsAuthenticated(true);

      // Start background price sync silently
      setTimeout(() => syncPricesSilentlyInternal(userId), 1000);

      return true;
    }
    return false;
  };

  const logout = async () => {
    setMasterPassword(null);
    setIsAuthenticated(false);
  };

  const logoutAndReset = async () => {
    if (!userId) return;

    try {
      run('DELETE FROM users WHERE id = ?', [userId]);
    } catch (e) {
      console.error('Failed to clear database tables during logoutAndReset', e);
    }
    
    await AsyncStorage.removeItem('@finvault_master_password_' + userId);
    
    const dbUsers = all<{ id: string; name: string; email: string }>('SELECT id, full_name as name, email FROM users');
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

  const syncPricesSilentlyInternal = async (activeUserId: string) => {
    if (isSyncing) return;
    setIsSyncing(true);
    console.log('Starting silent background price sync...');

    try {
      const assets = all<{ id: string; name: string; quantity: number; slug: string; ticker: string | null; isin: string | null; details_json: string | null }>(
        `SELECT a.id, a.name, a.quantity, a.ticker, a.isin, a.details_json, t.slug 
         FROM assets a JOIN asset_types t ON t.id = a.asset_type_id WHERE a.user_id = ?`,
        [activeUserId]
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

            const res = await fetchMutualFundNav(asset.name || asset.isin || '', undefined, undefined, cachedCode);
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
              if (res.data) {
                goldPricePerGram = res.data.price_per_gram_inr;
              } else {
                goldFetchFailed = true;
              }
            }
            if (goldPricePerGram && asset.quantity) {
              update('assets', asset.id, {
                current_value: Math.round(goldPricePerGram * asset.quantity * 100),
                price_per_unit: goldPricePerGram,
                last_price_updated_at: timestamp,
              });
            }
          }
        } catch { /* Ignore individual errors to ensure other assets sync */ }
      }
      console.log('Silent background price sync completed.');
      refresh();
    } catch (err) {
      console.error('Silent sync failed', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncPricesSilently = async () => {
    if (userId) {
      await syncPricesSilentlyInternal(userId);
    }
  };

  const value = useMemo<AppState>(
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
      switchUser,
      themeMode,
      isDark,
      refreshKey,
      vaultLockMode,
      masterPassword,
      isSyncing,
      logoutAndReset,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useApp = (): AppState => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
