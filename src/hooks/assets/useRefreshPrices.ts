/**
 * Hook that refreshes current_value for all holdings by fetching live prices
 * from Yahoo Finance / MFAPI.in, then writes updates to SQLite.
 * Stores `last_price_updated_at` on each updated asset.
 */
import { useEffect, useRef, useState } from 'react';

import { all, first, update } from '../../db';
import type { Asset } from '../../models/types';
import { fetchEquityPrice, fetchMutualFundNav, fetchGoldPrice } from '../../api/assets/assetsApi';
import { nowISO } from '../../utils/date';

type Status = 'idle' | 'loading' | 'done' | 'error';

const goldPurityFactor = (asset: { name: string; details_json?: string | null; slug: string }): number => {
  if (asset.slug !== 'physical_gold') return 1.0;
  try {
    const dj = asset.details_json ? JSON.parse(asset.details_json) : null;
    if (dj?.purity != null) {
      if (typeof dj.purity === 'number') return Math.min(dj.purity, 24) / 24;
      // String format from form: '24K', '22K', '18K', '14K' or just '24', '22'
      const m = String(dj.purity).match(/^(\d+)/);
      if (m) return Math.min(Number(m[1]), 24) / 24;
    }
  } catch { /* ignore */ }
  const m = asset.name.match(/\b(\d{2})K\b/i);
  if (m) return Math.min(Number(m[1]), 24) / 24;
  return 1.0;
};

interface RefreshResult {
  updated: number;
  failed: string[];
  timestamp: string;
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
    const timestamp = nowISO();

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
            update('assets', asset.id, {
              current_value: newValue,
              last_price_updated_at: timestamp,
            });
            updated++;
          } else {
            failed.push(asset.name);
          }
        } else if (asset.slug === 'mutual_fund' && (asset.name || asset.isin)) {
          // Try to get cached scheme code from details_json
          let cachedCode: number | undefined;
          if (asset.details_json) {
            try {
              const details = JSON.parse(asset.details_json);
              if (details._mfapi_scheme_code) cachedCode = details._mfapi_scheme_code;
            } catch { /* ignore */ }
          }

          const searchTerm = asset.name || asset.isin || '';
          const res = await fetchMutualFundNav(searchTerm, undefined, signal, cachedCode);
          if (signal.aborted) break;
          if (res.data) {
            const newValue = Math.round(res.data.nav * asset.quantity * 100);
            const updatePayload: Record<string, unknown> = {
              current_value: newValue,
              current_nav: res.data.nav,
              last_price_updated_at: timestamp,
            };
            // Cache the scheme code for faster future lookups
            if (res.schemeCode && !cachedCode) {
              let existing: Record<string, unknown> = {};
              if (asset.details_json) {
                try { existing = JSON.parse(asset.details_json); } catch { /* ignore */ }
              }
              existing._mfapi_scheme_code = res.schemeCode;
              updatePayload.details_json = JSON.stringify(existing);
            }
            update('assets', asset.id, updatePayload);
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
            const purityFactor = goldPurityFactor(asset);
            const effectivePrice = goldPricePerGram * purityFactor;
            const newValue = Math.round(effectivePrice * asset.quantity * 100);
            update('assets', asset.id, {
              current_value: newValue,
              last_price_updated_at: timestamp,
            });
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

    const res = { updated, failed, timestamp };
    setResult(res);
    setStatus(failed.length > 0 && updated === 0 ? 'error' : 'done');
    onDone?.();
    return res;
  };

  // Query the most recent update timestamp across all assets
  const lastUpdated = first<{ ts: string | null }>(
    'SELECT MAX(last_price_updated_at) AS ts FROM assets WHERE user_id = ?',
    [userId],
  )?.ts ?? null;

  return { status, result, errorMsg, refresh, lastUpdated };
};
