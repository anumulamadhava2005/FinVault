import { apiGet } from '../client';

export interface EquityPriceResult {
  symbol: string;
  price: number; // INR
  currency: string;
}

export interface MutualFundNavResult {
  isin: string;
  nav: number;
  scheme_name: string;
}

export interface GoldPriceResult {
  price_per_gram_inr: number;
  gc_usd: number;
  usd_inr: number;
}

/** Fetch latest price for a single NSE/BSE ticker via backend proxy. */
export const fetchEquityPrice = (ticker: string, token?: string, signal?: AbortSignal) =>
  apiGet<EquityPriceResult>(`/api/prices/equity/${encodeURIComponent(ticker)}`, token, signal);

/** Fetch NAV for a mutual fund by ISIN via AMFI proxy. */
export const fetchMutualFundNav = (isin: string, token?: string, signal?: AbortSignal) =>
  apiGet<MutualFundNavResult>(`/api/prices/mutual-fund/${encodeURIComponent(isin)}`, token, signal);

/** Fetch current gold price in INR/gram via backend proxy. */
export const fetchGoldPrice = (token?: string, signal?: AbortSignal) =>
  apiGet<GoldPriceResult>('/api/prices/gold', token, signal);
