/**
 * Hook that refreshes current_value for all holdings by fetching live prices
 * from the backend proxy, then writes updates to SQLite.
 */
import { useEffect, useRef, useState } from 'react';

import { all, update } from '../../db';
import type { Asset } from '../../models/types';
import { fetchEquityPrice, fetchMutualFundNav, fetchGoldPrice } from '../../api/assets/assetsApi';

type Status = 'idle' | 'loading' | 'done' | 'error';

interface RefreshResult {
  updated: number;
  failed: string[];
}

export const useRefreshPrices = (userId: string, onDone?: () => void) => {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const refresh = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setStatus('loading');
    setErrorMsg(null);

    const assets = all<Asset & { slug: string }>(
      `SELECT a.*, t.slug FROM assets a JOIN asset_types t ON t.id = a.asset_type_id WHERE a.user_id = ?`,
      [userId],
    );

    let updated = 0;
    const failed: string[] = [];

    const goldTypes = new Set(['digital_gold', 'physical_gold', 'sgb', 'gold']);
    let goldPricePerGram: number | null = null;
    let goldFetchFailed = false;

    for (const asset of assets) {
      if (signal.aborted) break;
      try {
        if (asset.slug === 'equity' && asset.ticker) {
          const res = await fetchEquityPrice(asset.ticker, undefined, signal);
          if (signal.aborted) break;
          if (res.data) {
            const newValue = Math.round(res.data.price * asset.quantity * 100);
            update('assets', asset.id, { current_value: newValue, price_per_unit: res.data.price });
            updated++;
          } else {
            failed.push(asset.name);
          }
        } else if (asset.slug === 'mutual_fund' && asset.isin) {
          const res = await fetchMutualFundNav(asset.isin, undefined, signal);
          if (signal.aborted) break;
          if (res.data) {
            const newValue = Math.round(res.data.nav * asset.quantity * 100);
            update('assets', asset.id, { current_value: newValue, current_nav: res.data.nav });
            updated++;
          } else {
            failed.push(asset.name);
          }
        } else if (goldTypes.has(asset.slug)) {
          if (!goldPricePerGram && !goldFetchFailed) {
            const res = await fetchGoldPrice(undefined, signal);
            if (signal.aborted) break;
            if (res.data) {
              goldPricePerGram = res.data.price_per_gram_inr;
            } else {
              goldFetchFailed = true;
            }
          }
          if (goldPricePerGram && asset.quantity) {
            const newValue = Math.round(goldPricePerGram * asset.quantity * 100);
            update('assets', asset.id, { current_value: newValue, price_per_unit: goldPricePerGram });
            updated++;
          } else if (goldFetchFailed) {
            failed.push(asset.name);
          }
        }
      } catch (err) {
        if (signal.aborted) break;
        failed.push(asset.name);
      }
    }

    if (signal.aborted) return null;

    const res = { updated, failed };
    setResult(res);
    setStatus(failed.length > 0 && updated === 0 ? 'error' : 'done');
    onDone?.();
    return res;
  };

  return { status, result, errorMsg, refresh };
};
