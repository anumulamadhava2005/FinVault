/**
 * App-wide context: initialises the SQLite DB (synchronously, since expo-sqlite
 * exposes a sync API), exposes the single user's id, the active theme mode, and
 * a `refresh` signal that screens read to re-query after a mutation.
 */
import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { initDb, first, run } from '../db';

type ThemeMode = 'light' | 'dark' | 'system';

interface AppState {
  ready: boolean;
  userId: string;
  /** Bump this to tell screens to re-query. */
  refreshKey: number;
  refresh: () => void;
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;
  /** Resolved dark flag after applying system preference. */
  isDark: boolean;
}

const Ctx = createContext<AppState | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const system = useColorScheme();
  const [refreshKey, setRefreshKey] = useState(0);

  // Initialise the DB once, synchronously, before the first paint.
  const [init] = useState(() => {
    const id = initDb();
    const prefs = first<{ theme: ThemeMode }>('SELECT theme FROM user_preferences WHERE user_id = ?', [id]);
    return { userId: id, theme: (prefs?.theme as ThemeMode) || 'system' };
  });
  const [themeMode, setThemeModeState] = useState<ThemeMode>(init.theme);

  const setThemeMode = (m: ThemeMode) => {
    setThemeModeState(m);
    run('UPDATE user_preferences SET theme = ? WHERE user_id = ?', [m, init.userId]);
  };

  const isDark = themeMode === 'system' ? system === 'dark' : themeMode === 'dark';

  const value = useMemo<AppState>(
    () => ({
      ready: true,
      userId: init.userId,
      refreshKey,
      refresh: () => setRefreshKey((k) => k + 1),
      themeMode,
      setThemeMode,
      isDark,
    }),
    [init.userId, refreshKey, themeMode, isDark],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useApp = (): AppState => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
