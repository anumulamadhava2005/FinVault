import { all } from '../db';
import type { Asset, HistoryEvent } from '../models/types';
import { parseISO, todayISO, daysBetween, monthsBetween } from '../utils/date';
import { fyStartYear, fyStartDate, fyEndDate } from '../utils/financialYear';
import { formatINR } from '../utils/money';

const today = () => new Date(todayISO() + 'T00:00:00');

function toLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface PassiveIncomeReceived {
  id: string;
  name: string;
  type: 'dividend' | 'fd_interest' | 'sgb_interest' | 'ppf_interest' | 'savings_interest' | 'other';
  type_label: string;
  amount: number; // paise
  date: string;
}

export interface PassiveIncomeForecast {
  date: string;
  amount: number; // paise
  asset_name: string;
  type: 'dividend' | 'fd_interest' | 'sgb_interest' | 'ppf_interest' | 'savings_interest' | 'other';
  type_label: string;
}

export interface PassiveIncomeSummary {
  received_this_year: number; // paise
  forecasted_12m: number; // paise
  next_payout: PassiveIncomeForecast | null;
  received_by_source: {
    dividends: number;
    fd_interest: number;
    sgb_interest: number;
    ppf_interest: number;
    savings_interest: number;
  };
  forecast_by_source: {
    dividends: number;
    fd_interest: number;
    sgb_interest: number;
    ppf_interest: number;
    savings_interest: number;
  };
  received_list: PassiveIncomeReceived[];
  forecast_timeline: PassiveIncomeForecast[];
}

/**
 * Classifies the subtype string from history_events into passive income category.
 */
const classifyIncomeType = (subtype: string, slug: string): PassiveIncomeReceived['type'] => {
  const s = (subtype || '').toLowerCase();
  const sl = (slug || '').toLowerCase();
  
  if (s.includes('dividend') || sl === 'equity' || sl === 'mutual_fund') return 'dividend';
  if (s.includes('fd') || s.includes('fixed') || sl === 'fd') return 'fd_interest';
  if (s.includes('sgb') || s.includes('sovereign') || s.includes('gold bond') || sl === 'sgb') return 'sgb_interest';
  if (s.includes('ppf') || sl === 'ppf') return 'ppf_interest';
  if (s.includes('savings') || s.includes('cash') || sl === 'savings') return 'savings_interest';
  return 'other';
};

const getIncomeTypeLabel = (type: PassiveIncomeReceived['type']): string => {
  const labels: Record<PassiveIncomeReceived['type'], string> = {
    dividend: 'Stock Dividend',
    fd_interest: 'FD Interest',
    sgb_interest: 'SGB Interest',
    ppf_interest: 'PPF Interest',
    savings_interest: 'Savings Interest',
    other: 'Other Passive Income',
  };
  return labels[type];
};

/**
 * Calculates received and forecasted passive income for the user.
 */
export const getPassiveIncomeSummary = (userId: string): PassiveIncomeSummary => {
  const t = today();
  const tISO = todayISO();

  // 1. Determine Financial Year bounds for received income
  const currentFy = fyStartYear(t);
  const fyStart = fyStartDate(currentFy);
  const fyEnd = fyEndDate(currentFy);

  // 2. Fetch Received Passive Income from history_events
  // Supported types: 'income', 'dividend', 'interest'
  const historyEvents = all<HistoryEvent & { slug?: string }>(
    `SELECT h.*, t.slug FROM history_events h
     LEFT JOIN assets a ON a.id = h.ref_id
     LEFT JOIN asset_types t ON t.id = a.asset_type_id
     WHERE h.user_id = ? AND h.category = 'asset'
       AND h.event_type IN ('income', 'dividend', 'interest')
     ORDER BY h.event_date DESC`,
    [userId],
  );

  let received_this_year = 0;
  const received_list: PassiveIncomeReceived[] = [];
  const received_by_source = {
    dividends: 0,
    fd_interest: 0,
    sgb_interest: 0,
    ppf_interest: 0,
    savings_interest: 0,
  };

  for (const h of historyEvents) {
    const amount = h.amount || 0;
    const type = classifyIncomeType(h.subtype || '', h.slug || '');
    const inCurrentFy = h.event_date >= fyStart && h.event_date <= fyEnd;

    if (inCurrentFy) {
      received_this_year += amount;
      if (type === 'dividend') received_by_source.dividends += amount;
      else if (type === 'fd_interest') received_by_source.fd_interest += amount;
      else if (type === 'sgb_interest') received_by_source.sgb_interest += amount;
      else if (type === 'ppf_interest') received_by_source.ppf_interest += amount;
      else if (type === 'savings_interest') received_by_source.savings_interest += amount;
    }

    received_list.push({
      id: h.id,
      name: h.name,
      type,
      type_label: getIncomeTypeLabel(type),
      amount,
      date: h.event_date,
    });
  }

  // 3. Project Future Passive Income (Next 12 Months)
  const activeAssets = all<Asset & { slug: string; type_name: string }>(
    `SELECT a.*, t.slug, t.name AS type_name FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id
     WHERE a.user_id = ?`,
    [userId],
  );

  const forecast_timeline: PassiveIncomeForecast[] = [];
  const forecast_by_source = {
    dividends: 0,
    fd_interest: 0,
    sgb_interest: 0,
    ppf_interest: 0,
    savings_interest: 0,
  };

  const endForecastDate = new Date(t.getTime() + 365 * 86400000);

  for (const a of activeAssets) {
    if (a.invested_amount <= 0 || a.current_value <= 0) continue;

    const purchaseDate = parseISO(a.purchase_date || a.investment_date) || t;

    // A. FIXED DEPOSITS (FD) - maturity payouts
    if (a.slug === 'fd' && a.maturity_date) {
      const maturity = parseISO(a.maturity_date);
      if (maturity && maturity >= t && maturity <= endForecastDate) {
        // Calculate compounded maturity interest
        const rate = a.guaranteed_return_pct || 7.0;
        const tenureDays = Math.max(1, daysBetween(purchaseDate, maturity));
        const tenureYears = tenureDays / 365;
        
        // Compound quarterly: A = P * (1 + r/4)^(4*t)
        const maturityValue = a.invested_amount * Math.pow(1 + (rate / 100) / 4, 4 * tenureYears);
        let interest = Math.round(maturityValue - a.invested_amount);
        
        // Fallback checks
        if (interest <= 0) {
          interest = a.current_value - a.invested_amount;
        }
        if (interest <= 0) {
          interest = Math.round(a.invested_amount * (rate / 100) * tenureYears);
        }

        forecast_timeline.push({
          date: a.maturity_date,
          amount: interest,
          asset_name: a.name,
          type: 'fd_interest',
          type_label: 'FD Maturity Interest',
        });
        forecast_by_source.fd_interest += interest;
      }
    }

    // B. SOVEREIGN GOLD BONDS (SGB) - semi-annual coupon payouts
    else if (a.slug === 'sgb') {
      const rate = a.guaranteed_return_pct || 2.5;
      const payoutAmount = Math.round((a.invested_amount * (rate / 100)) / 2);
      const maturity = a.maturity_date ? parseISO(a.maturity_date) : null;

      // Project semi-annual payouts for the next 8 years (16 cycles)
      for (let i = 1; i <= 16; i++) {
        // Calculate payout date: 6 months increments
        const payoutDate = new Date(purchaseDate);
        payoutDate.setMonth(purchaseDate.getMonth() + i * 6);

        if (payoutDate >= t && payoutDate <= endForecastDate) {
          if (!maturity || payoutDate <= maturity) {
            const dateStr = toLocalYmd(payoutDate);
            forecast_timeline.push({
              date: dateStr,
              amount: payoutAmount,
              asset_name: a.name,
              type: 'sgb_interest',
              type_label: 'SGB Semi-Annual Interest',
            });
            forecast_by_source.sgb_interest += payoutAmount;
          }
        }
      }
    }

    // C. PUBLIC PROVIDENT FUND (PPF) - annual interest credited on March 31
    else if (a.slug === 'ppf') {
      const rate = a.guaranteed_return_pct || 7.1;
      const nextMarch31 = new Date(t.getFullYear() + (t.getMonth() >= 3 ? 1 : 0), 2, 31);
      
      if (nextMarch31 <= endForecastDate) {
        const interest = Math.round(a.current_value * (rate / 100));
        const dateStr = toLocalYmd(nextMarch31);

        forecast_timeline.push({
          date: dateStr,
          amount: interest,
          asset_name: a.name,
          type: 'ppf_interest',
          type_label: 'PPF Annual Interest',
        });
        forecast_by_source.ppf_interest += interest;
      }
    }

    // D. SAVINGS ACCOUNTS - quarterly interest credited
    else if (a.slug === 'savings') {
      const rate = a.guaranteed_return_pct || 3.5;
      const currentYear = t.getFullYear();

      // Interest credit dates (end of March, June, September, December)
      const quarters = [
        new Date(currentYear, 2, 31),  // Q1 - Mar 31
        new Date(currentYear, 5, 30),  // Q2 - Jun 30
        new Date(currentYear, 8, 30),  // Q3 - Sep 30
        new Date(currentYear, 11, 31), // Q4 - Dec 31
        // Also add next year's dates to cover full 12 months
        new Date(currentYear + 1, 2, 31),
        new Date(currentYear + 1, 5, 30),
        new Date(currentYear + 1, 8, 30),
        new Date(currentYear + 1, 11, 31),
      ];

      for (const qDate of quarters) {
        if (qDate >= t && qDate <= endForecastDate) {
          const payout = Math.round((a.current_value * (rate / 100)) / 4);
          const dateStr = toLocalYmd(qDate);

          forecast_timeline.push({
            date: dateStr,
            amount: payout,
            asset_name: a.name,
            type: 'savings_interest',
            type_label: 'Savings Quarterly Interest',
          });
          forecast_by_source.savings_interest += payout;
        }
      }
    }

    // E. STOCKS & MUTUAL FUNDS (EQUITY) - historical/yield-based dividend projection
    else if (a.slug === 'equity' || a.slug === 'mutual_fund') {
      // Look up if they have historical dividends logged for this asset
      const assetHistory = historyEvents.filter(
        (h) => h.ref_id === a.id && classifyIncomeType(h.subtype || '', a.slug) === 'dividend'
      );

      if (assetHistory.length > 0) {
        // Project a dividend at the same time next year
        for (const prev of assetHistory) {
          const prevDate = parseISO(prev.event_date);
          if (prevDate) {
            const nextDate = new Date(prevDate);
            nextDate.setFullYear(t.getFullYear() + (t > nextDate ? 1 : 0));
            
            if (nextDate >= t && nextDate <= endForecastDate) {
              const dateStr = toLocalYmd(nextDate);
              forecast_timeline.push({
                date: dateStr,
                amount: prev.amount || 0,
                asset_name: a.name,
                type: 'dividend',
                type_label: 'Expected Stock Dividend',
              });
              forecast_by_source.dividends += prev.amount || 0;
            }
          }
        }
      } else {
        // Yield fallback: Project a single annual dividend in July/August (typical in India)
        // Assume dividend yield of ~1.2%
        const dividend = Math.round(a.current_value * 0.012);
        if (dividend > 1000) { // Only project if dividend is greater than ₹10 (1000 paise)
          const nextAugust15 = new Date(t.getFullYear() + (t.getMonth() >= 7 ? 1 : 0), 7, 15);
          if (nextAugust15 <= endForecastDate) {
            const dateStr = toLocalYmd(nextAugust15);
            forecast_timeline.push({
              date: dateStr,
              amount: dividend,
              asset_name: a.name,
              type: 'dividend',
              type_label: 'Estimated Stock Dividend',
            });
            forecast_by_source.dividends += dividend;
          }
        }
      }
    }
  }

  // Sort timeline chronologically (earliest first)
  forecast_timeline.sort((a, b) => a.date.localeCompare(b.date));

  // Determine total forecasted amount and the next expected payout
  const forecasted_12m = forecast_timeline.reduce((sum, item) => sum + item.amount, 0);
  const next_payout = forecast_timeline.length > 0 ? forecast_timeline[0] : null;

  return {
    received_this_year,
    forecasted_12m,
    next_payout,
    received_by_source,
    forecast_by_source,
    received_list,
    forecast_timeline,
  };
};
