import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useApp } from '../context/AppContext';

/**
 * Runs a synchronous query function and re-runs it whenever the screen gains
 * focus, the global refresh signal changes, or any of the dependencies change.
 */
export function useData<T>(fn: () => T, deps: any[] = []): T {
  const { refreshKey } = useApp();
  const [value, setValue] = useState<T>(fn);
  useFocusEffect(
    useCallback(() => {
      setValue(fn());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey, ...deps]),
  );
  return value;
}

/**
 * Same as useData but wraps the query in try/catch and exposes { data, error }
 * so callers can render error states instead of silently showing empty content.
 */
export function useDataSafe<T>(fn: () => T, deps: any[] = []): { data: T | null; error: string | null } {
  const { refreshKey } = useApp();
  const [data, setData] = useState<T | null>(() => {
    try { return fn(); } catch { return null; }
  });
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      try {
        setData(fn());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Query failed');
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey, ...deps]),
  );

  return { data, error };
}

