import { all, run } from '../db';
import type { Asset } from '../models/types';
import { fetchMutualFundNav } from '../api/assets/assetsApi';
import { fetchYahooChart } from '../utils/yahoo';
import { calcCAGR } from '../utils/cagr';

export interface PerSipXirrItem {
  id: string;
  paymentDate: string; // YYYY-MM-DD
  amountPaid: number; // in rupees
  purchaseNav: number; // NAV or price at purchase date
  unitsBought: number; // quantity acquired
  currentNav: number; // latest NAV or price
  currentValue: number; // value of this installment today in rupees
  daysElapsed: number;
  cagr: number; // CAGR percentage (e.g. 12.5)
}

/** Helper to search backward for NAV/price when a date falls on a weekend/holiday. */
const getHistoricalPriceForDate = (
  dateStr: string,
  priceMap: Map<string, number>
): number | null => {
  let date = new Date(dateStr + 'T00:00:00');
  for (let i = 0; i < 10; i++) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const checkKey = `${y}-${m}-${d}`;
    const val = priceMap.get(checkKey);
    if (val != null) return val;
    // Go back 1 day
    date.setDate(date.getDate() - 1);
  }
  return null;
};

interface SqlSipPayment {
  id: string;
  actual_date: string;
  amount: number; // paise
}

/** Calculates the returns for every paid SIP installment of an asset separately. */
export const getPerSipReturns = async (
  asset: Asset,
  slug: string
): Promise<PerSipXirrItem[]> => {
  // 1. Fetch paid installments for this asset
  const payments = all<SqlSipPayment>(
    `SELECT id, actual_date, amount FROM sip_payments
     WHERE asset_id = ? AND status = 'paid' AND actual_date IS NOT NULL
     ORDER BY actual_date DESC`,
    [asset.id]
  );

  if (!payments.length) return [];

  const priceMap = new Map<string, number>();
  let currentNav = asset.current_nav || 0;

  if (slug === 'mutual_fund') {
    // 2. Resolve scheme code for mutual fund
    let schemeCode: number | undefined;
    if (asset.details_json) {
      try {
        const details = JSON.parse(asset.details_json);
        if (details._mfapi_scheme_code) schemeCode = details._mfapi_scheme_code;
      } catch { /* ignore */ }
    }

    const searchTerm = asset.isin || asset.name || '';
    const res = await fetchMutualFundNav(searchTerm, undefined, undefined, schemeCode);
    
    if (res.data) {
      if (!currentNav) currentNav = res.data.nav;
      
      // Cache scheme code back to asset if it wasn't already cached
      if (res.schemeCode && !schemeCode) {
        try {
          let existing: Record<string, any> = {};
          if (asset.details_json) existing = JSON.parse(asset.details_json);
          existing._mfapi_scheme_code = res.schemeCode;
          run('UPDATE assets SET details_json = ? WHERE id = ?', [
            JSON.stringify(existing),
            asset.id,
          ]);
        } catch { /* ignore */ }
      }

      // 3. Fetch historical series from AMFI
      const code = res.schemeCode || schemeCode;
      if (code) {
        try {
          const navUrl = `https://api.mfapi.in/mf/${code}`;
          const navRes = await fetch(navUrl);
          if (navRes.ok) {
            const navJson = await navRes.json();
            const dataSeries = navJson.data ?? [];
            dataSeries.forEach((item: { date: string; nav: string }) => {
              const [d, m, y] = item.date.split('-');
              priceMap.set(`${y}-${m}-${d}`, parseFloat(item.nav));
            });
            if (!currentNav && dataSeries.length) {
              currentNav = parseFloat(dataSeries[0].nav);
            }
          }
        } catch (err) {
          console.warn('[sipXirr] Failed to fetch MF historical series:', err);
        }
      }
    }
  } else if (slug === 'equity' && asset.ticker) {
    // 4. Fetch historical series for stock from Yahoo Finance
    const res = await fetchYahooChart(asset.ticker, '1y');
    if (res) {
      if (!currentNav) currentNav = res.price;
      for (let i = 0; i < res.timestamps.length; i++) {
        const d = new Date(res.timestamps[i] * 1000);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        priceMap.set(`${y}-${m}-${day}`, res.closes[i]);
      }
    }
  }

  if (!priceMap.size) return [];
  if (!currentNav && asset.quantity > 0) {
    currentNav = (asset.current_value / 100) / asset.quantity;
  }
  if (!currentNav) return [];

  const todayMs = Date.now();
  const results: PerSipXirrItem[] = [];

  for (const p of payments) {
    const purchaseNav = getHistoricalPriceForDate(p.actual_date, priceMap);
    if (!purchaseNav || purchaseNav <= 0) continue;

    const amountPaidINR = p.amount / 100;
    const unitsBought = amountPaidINR / purchaseNav;
    const currentValueINR = unitsBought * currentNav;
    const paymentMs = new Date(p.actual_date + 'T00:00:00').getTime();
    const daysElapsed = (todayMs - paymentMs) / 86_400_000;

    // CAGR represents the annualized return of this single cash flow
    const cagr = calcCAGR(Math.round(currentValueINR * 100), p.amount, p.actual_date);

    results.push({
      id: p.id,
      paymentDate: p.actual_date,
      amountPaid: amountPaidINR,
      purchaseNav,
      unitsBought,
      currentNav,
      currentValue: currentValueINR,
      daysElapsed,
      cagr,
    });
  }

  return results;
};
