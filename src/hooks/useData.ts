import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useApp } from '../context/AppContext';

/**
 * Runs a synchronous query function and re-runs it whenever the screen gains
 * focus or the global refresh signal changes (after a create/update/delete).
 */
export function useData<T>(fn: () => T): T {
  const { refreshKey } = useApp();
  const [value, setValue] = useState<T>(fn);
  useFocusEffect(
    useCallback(() => {
      setValue(fn());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]),
  );
  return value;
}

/**
 * Same as useData but wraps the query in try/catch and exposes { data, error }
 * so callers can render error states instead of silently showing empty content.
 */
export function useDataSafe<T>(fn: () => T): { data: T | null; error: string | null } {
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
    }, [refreshKey]),
  );

  return { data, error };
}
