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
