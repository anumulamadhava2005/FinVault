import { all } from '../db';
import type { Asset, HistoryEvent } from '../models/types';
import { todayISO, parseISO, daysBetween } from '../utils/date';
import { fyStartYear, fyStartDate, fyEndDate } from '../utils/financialYear';
import { formatINR } from '../utils/money';

const THRESHOLDS: Record<string, number> = {
  equity: 365,
  mutual_fund: 365,
  real_estate: 730,
  gold: 1095,
  digital_gold: 1095,
  physical_gold: 1095,
  sgb: 1095,
};

const DEFAULT_THRESHOLD = 1095; // 3 years for other assets
const ANNUAL_EXEMPTION_LIMIT = 12500000; // ₹1,25,000 in paise (Section 112A)

export interface RealizedGainRow {
  id: string;
  name: string;
  type_name: string;
  purchase_date: string;
  sale_date: string;
  holding_period_days: number;
  sale_value: number; // paise
  pnl: number; // paise
  is_long_term: boolean;
}

export interface UnrealizedGainRow {
  id: string;
  name: string;
  type_name: string;
  purchase_date: string;
  holding_period_days: number;
  invested_amount: number; // paise
  current_value: number; // paise
  unrealized_gain: number; // paise
  is_long_term: boolean;
}

export interface HarvestAssetRow {
  id: string;
  name: string;
  type_name: string;
  current_value: number; // paise
  unrealized_gain: number; // paise
  harvestable_amount: number; // paise
}

export interface HarvestAlertResult {
  realized_ltcg_this_year: number; // paise
  exemption_limit: number; // paise
  remaining_limit: number; // paise
  eligible_assets: HarvestAssetRow[];
  alert_text: string | null;
}

export interface CapitalGainsSummary {
  realized_stcg: number; // paise
  realized_ltcg: number; // paise
  realized_total: number; // paise
  unrealized_stcg: number; // paise
  unrealized_ltcg: number; // paise
  unrealized_total: number; // paise
  stcg_total: number; // paise
  ltcg_total: number; // paise
  grand_total: number; // paise
  realized_rows: RealizedGainRow[];
  unrealized_rows: UnrealizedGainRow[];
  harvest_alert: HarvestAlertResult;
}

/**
 * Computes realized and unrealized capital gains for the user,
 * classifying them into Short-Term (STCG) and Long-Term (LTCG),
 * and generates tax-saving harvesting recommendations.
 */
export const capitalGains = (userId: string): CapitalGainsSummary => {
  const today = todayISO();
  const tDate = parseISO(today) || new Date();

  // 1. Compute Unrealized Gains from active assets
  const activeAssets = all<Asset & { slug: string; type_name: string }>(
    `SELECT a.*, t.slug, t.name AS type_name FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id
     WHERE a.user_id = ?`,
    [userId],
  );

  let unrealized_stcg = 0;
  let unrealized_ltcg = 0;
  let unrealized_total = 0;
  const unrealized_rows: UnrealizedGainRow[] = [];
  const eligible_assets: HarvestAssetRow[] = [];

  for (const a of activeAssets) {
    // FDs do not attract capital gains (they are taxed as regular income).
    // Savings accounts are also excluded.
    if (a.slug === 'fd' || a.slug === 'savings') {
      continue;
    }

    const gain = a.current_value - a.invested_amount;
    const purchaseDate = a.purchase_date || a.investment_date || today;
    const pDate = parseISO(purchaseDate) || tDate;
    const days = Math.max(0, daysBetween(pDate, tDate));

    const threshold = THRESHOLDS[a.slug] ?? DEFAULT_THRESHOLD;
    const isLongTerm = days > threshold;

    if (isLongTerm) {
      unrealized_ltcg += gain;
    } else {
      unrealized_stcg += gain;
    }
    unrealized_total += gain;

    const isEquityOrMf = a.slug === 'equity' || a.slug === 'mutual_fund';
    if (isLongTerm && isEquityOrMf && gain > 0) {
      eligible_assets.push({
        id: a.id,
        name: a.name,
        type_name: a.type_name,
        current_value: a.current_value,
        unrealized_gain: gain,
        harvestable_amount: 0, // calculated later based on limits
      });
    }

    unrealized_rows.push({
      id: a.id,
      name: a.name,
      type_name: a.type_name,
      purchase_date: purchaseDate,
      holding_period_days: days,
      invested_amount: a.invested_amount,
      current_value: a.current_value,
      unrealized_gain: gain,
      is_long_term: isLongTerm,
    });
  }

  // 2. Compute Realized Gains from history_events
  const historyEvents = all<HistoryEvent>(
    `SELECT * FROM history_events
     WHERE user_id = ? AND category = 'asset'
       AND event_type IN ('sold', 'partial_sale', 'matured', 'premature_closure')
     ORDER BY event_date DESC`,
    [userId],
  );

  let realized_stcg = 0;
  let realized_ltcg = 0;
  let realized_total = 0;
  const realized_rows: RealizedGainRow[] = [];

  // Determine current financial year bounds to count this year's realized LTCG
  const currentFy = fyStartYear(tDate);
  const fyStart = fyStartDate(currentFy);
  const fyEnd = fyEndDate(currentFy);
  let realizedEquityLtcgThisYear = 0;

  for (const h of historyEvents) {
    const pnl = h.pnl ?? 0;
    const saleDate = h.event_date;
    const sDate = parseISO(saleDate) || tDate;

    // Parse purchase date from details_json metadata
    let purchaseDate: string | null = null;
    if (h.details_json) {
      try {
        const details = JSON.parse(h.details_json);
        purchaseDate = details.purchase_date;
      } catch {}
    }

    const pDate = purchaseDate ? parseISO(purchaseDate) : null;
    const days = pDate ? Math.max(0, daysBetween(pDate, sDate)) : -1;

    // Classify using subtype/type name to identify asset class threshold
    const subtypeLower = (h.subtype ?? '').toLowerCase();
    let slug = 'other';
    if (subtypeLower.includes('fund') || subtypeLower.includes('equity') || subtypeLower.includes('stock')) {
      slug = 'equity';
    } else if (subtypeLower.includes('estate') || subtypeLower.includes('property')) {
      slug = 'real_estate';
    } else if (subtypeLower.includes('gold') || subtypeLower.includes('sgb')) {
      slug = 'gold';
    } else if (subtypeLower.includes('fixed') || subtypeLower.includes('fd')) {
      continue;
    }

    const threshold = THRESHOLDS[slug] ?? DEFAULT_THRESHOLD;
    const isLongTerm = days !== -1 && days > threshold;

    if (isLongTerm) {
      realized_ltcg += pnl;
    } else {
      realized_stcg += pnl;
    }
    realized_total += pnl;

    // Accumulate realized equity/mutual fund LTCG within the current Financial Year
    const inCurrentFy = saleDate >= fyStart && saleDate <= fyEnd;
    if (isLongTerm && slug === 'equity' && inCurrentFy) {
      realizedEquityLtcgThisYear += pnl;
    }

    realized_rows.push({
      id: h.id,
      name: h.name,
      type_name: h.subtype || 'Asset',
      purchase_date: purchaseDate || 'Unknown',
      sale_date: saleDate,
      holding_period_days: days,
      sale_value: h.amount ?? 0,
      pnl: pnl,
      is_long_term: isLongTerm,
    });
  }

  // 3. Compute Tax Harvesting Alert (Section 112A)
  const remainingLimit = Math.max(0, ANNUAL_EXEMPTION_LIMIT - realizedEquityLtcgThisYear);
  
  // Sort eligible assets by unrealized gain descending to prioritize largest tax-saving opportunities
  eligible_assets.sort((a, b) => b.unrealized_gain - a.unrealized_gain);
  
  let limitLeft = remainingLimit;
  for (const asset of eligible_assets) {
    const harvestable = Math.min(limitLeft, asset.unrealized_gain);
    asset.harvestable_amount = harvestable;
    limitLeft -= harvestable;
  }

  let alert_text: string | null = null;
  if (remainingLimit <= 0) {
    alert_text = `You have fully utilized your ₹1.25 Lakhs tax-free LTCG limit for the current financial year.`;
  } else if (eligible_assets.length > 0) {
    const totalHarvestable = eligible_assets.reduce((sum, item) => sum + item.harvestable_amount, 0);
    // Only recommend if total harvestable gain is greater than ₹100 (10000 paise) to avoid noise
    if (totalHarvestable > 10000) {
      const topAsset = eligible_assets[0];
      alert_text = `You have ${formatINR(remainingLimit)} of tax-free LTCG exemption remaining this financial year. Consider selling and immediately repurchasing eligible long-term holdings (like "${topAsset.name}") to lock in up to ${formatINR(topAsset.harvestable_amount)} of gains tax-free and permanently raise your cost basis.`;
    }
  }

  return {
    realized_stcg,
    realized_ltcg,
    realized_total,
    unrealized_stcg,
    unrealized_ltcg,
    unrealized_total,
    stcg_total: realized_stcg + unrealized_stcg,
    ltcg_total: realized_ltcg + unrealized_ltcg,
    grand_total: realized_total + unrealized_total,
    realized_rows,
    unrealized_rows,
    harvest_alert: {
      realized_ltcg_this_year: realizedEquityLtcgThisYear,
      exemption_limit: ANNUAL_EXEMPTION_LIMIT,
      remaining_limit: remainingLimit,
      eligible_assets,
      alert_text,
    },
  };
};
