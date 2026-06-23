/**
 * Portfolio lifecycle + history engine.
 *
 * Disposed records (sold/matured/closed/claimed) are written to `history_events`
 * and, where appropriate, removed from their active table — so active portfolio,
 * net-worth, liability and insurance calculations are untouched automatically
 * (no "status" filtering needed across the app). Proceeds can be credited to a
 * single auto-managed "Cash & Money" asset (the Cash/Money Portfolio).
 */
import { all, first, insert, update, remove, run, newId } from '../db';
import type { Asset, InsurancePolicy, Loan, HistoryEvent } from '../models/types';
import { nowISO, todayISO } from '../utils/date';
import { goalsProgress } from './finance';
import { LOAN_TYPE_LABELS, POLICY_TYPE_LABELS, titleCase } from './constants';

type AssetRow = Asset & { type_name: string; slug: string };

const CASH_NAME = 'Cash & Money';

// ─── Cash / Money portfolio ──────────────────────────────────────────────────

/** Credit proceeds to the user's auto-managed Cash & Money asset. */
export const creditCash = (userId: string, amountPaise: number): void => {
  if (!userId || !amountPaise || amountPaise <= 0) return;
  const existing = first<{ id: string; current_value: number; invested_amount: number }>(
    `SELECT a.id, a.current_value, a.invested_amount FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id
     WHERE a.user_id = ? AND t.slug = 'savings' AND a.name = ?`,
    [userId, CASH_NAME],
  );
  if (existing) {
    update('assets', existing.id, {
      current_value: existing.current_value + amountPaise,
      invested_amount: existing.invested_amount + amountPaise,
    });
  } else {
    insert('assets', {
      id: newId(),
      user_id: userId,
      asset_type_id: 'type_savings',
      name: CASH_NAME,
      invested_amount: amountPaise,
      current_value: amountPaise,
      quantity: 0,
      purchase_date: todayISO(),
      investment_date: todayISO(),
      is_sip: 0,
      sip_monthly_amount: 0,
      notes: 'Auto-created to hold sale, maturity, claim and closure proceeds.',
      created_at: nowISO(),
    });
  }
};

// ─── History recording ───────────────────────────────────────────────────────

interface RecordArgs {
  category: HistoryEvent['category'];
  event_type: HistoryEvent['event_type'];
  ref_id?: string | null;
  name: string;
  subtype?: string | null;
  event_date: string;
  amount?: number | null;
  pnl?: number | null;
  status?: string | null;
  notes?: string | null;
  details?: Record<string, unknown> | null;
}

const recordHistory = (userId: string, a: RecordArgs): void => {
  insert('history_events', {
    id: newId(),
    user_id: userId,
    category: a.category,
    event_type: a.event_type,
    ref_id: a.ref_id ?? null,
    name: a.name,
    subtype: a.subtype ?? null,
    event_date: a.event_date,
    amount: a.amount ?? null,
    pnl: a.pnl ?? null,
    status: a.status ?? null,
    notes: a.notes ?? null,
    details_json: a.details ? JSON.stringify(a.details) : null,
    created_at: nowISO(),
  });
};

const hasHistory = (userId: string, refId: string, eventType: string): boolean =>
  (first<{ c: number }>(
    'SELECT COUNT(*) AS c FROM history_events WHERE user_id = ? AND ref_id = ? AND event_type = ?',
    [userId, refId, eventType],
  )?.c ?? 0) > 0;

export const QUANTITY_SELL_SLUGS = new Set(['equity', 'mutual_fund', 'digital_gold']);
export const MATURITY_SLUGS = new Set(['fd', 'sgb', 'ppf']);

// ─── Asset sale / disposal ───────────────────────────────────────────────────

export interface SellParams {
  saleDate: string;
  notes?: string;
  toCash: boolean;
  charges: number;          // paise
  // quantity-based:
  qtyToSell?: number;
  pricePerUnit?: number;    // paise per unit
  // non-quantity:
  saleValue?: number;       // paise
}

export const sellAsset = (userId: string, asset: AssetRow, p: SellParams): void => {
  const charges = Math.max(0, Math.round(p.charges || 0));
  const isQuantity = QUANTITY_SELL_SLUGS.has(asset.slug) && p.qtyToSell != null;

  let saleValue: number;
  let pnl: number;
  let eventType: HistoryEvent['event_type'] = 'sold';
  let status = 'Sold';

  if (isQuantity) {
    const qty = p.qtyToSell!;
    const pricePer = Math.round(p.pricePerUnit || 0);
    saleValue = Math.round(qty * pricePer);
    const costBasisSold = asset.quantity ? Math.round((asset.invested_amount * qty) / asset.quantity) : 0;
    pnl = saleValue - costBasisSold - charges;

    if (qty < asset.quantity) {
      // Partial sale — keep the remainder active.
      const remaining = asset.quantity - qty;
      update('assets', asset.id, {
        quantity: remaining,
        invested_amount: asset.invested_amount - costBasisSold,
        current_value: Math.round((asset.current_value * remaining) / asset.quantity),
      });
      eventType = 'partial_sale';
      status = 'Partial Sale';
    } else {
      remove('assets', asset.id);
    }
  } else {
    // Non-quantity full sale (real estate, physical gold, etc.).
    saleValue = Math.round(p.saleValue || 0);
    pnl = saleValue - asset.invested_amount - charges;
    remove('assets', asset.id);
  }

  const proceeds = saleValue - charges;
  if (p.toCash) creditCash(userId, proceeds);

  recordHistory(userId, {
    category: 'asset',
    event_type: eventType,
    ref_id: asset.id,
    name: asset.name,
    subtype: asset.type_name,
    event_date: p.saleDate,
    amount: proceeds,
    pnl,
    status,
    notes: p.notes ?? null,
    details: { sale_value: saleValue, charges, qty_sold: p.qtyToSell ?? null },
  });
};

// ─── Premature closure ───────────────────────────────────────────────────────

export const prematureClosure = (
  userId: string,
  asset: AssetRow,
  p: { closureDate: string; redemptionAmount: number; notes?: string; toCash: boolean },
): void => {
  const redemption = Math.max(0, Math.round(p.redemptionAmount || 0));
  const pnl = redemption - asset.invested_amount;
  remove('assets', asset.id);
  if (p.toCash) creditCash(userId, redemption);
  recordHistory(userId, {
    category: 'asset',
    event_type: 'premature_closure',
    ref_id: asset.id,
    name: asset.name,
    subtype: asset.type_name,
    event_date: p.closureDate,
    amount: redemption,
    pnl,
    status: 'Prematurely Closed',
    notes: p.notes ?? null,
  });
};

// ─── Automatic maturity sweep ────────────────────────────────────────────────

/** Mature any FD/SGB/PPF whose maturity date has arrived. Returns # processed. */
export const processMaturities = (userId: string): number => {
  const today = todayISO();
  const due = all<AssetRow>(
    `SELECT a.*, t.name AS type_name, t.slug AS slug FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id
     WHERE a.user_id = ? AND a.maturity_date IS NOT NULL AND a.maturity_date <= ?
       AND t.slug IN ('fd','sgb','ppf')`,
    [userId, today],
  );
  let n = 0;
  for (const a of due) {
    const maturityVal = a.maturity_amount ?? a.current_value ?? 0;
    const pnl = maturityVal - a.invested_amount;
    remove('assets', a.id);
    creditCash(userId, maturityVal); // maturity value always sweeps to cash
    recordHistory(userId, {
      category: 'asset',
      event_type: 'matured',
      ref_id: a.id,
      name: a.name,
      subtype: a.type_name,
      event_date: a.maturity_date!,
      amount: maturityVal,
      pnl,
      status: 'Matured',
    });
    n += 1;
  }
  return n;
};

// ─── Insurance ───────────────────────────────────────────────────────────────

export const recordInsuranceClaim = (
  userId: string,
  policy: InsurancePolicy,
  p: { claimDate: string; amount: number; notes?: string; toCash: boolean },
): void => {
  const amount = Math.max(0, Math.round(p.amount || 0));
  if (p.toCash) creditCash(userId, amount);
  recordHistory(userId, {
    category: 'insurance',
    event_type: 'insurance_claim',
    ref_id: policy.id,
    name: policy.policy_name,
    subtype: POLICY_TYPE_LABELS[policy.policy_type] ?? titleCase(policy.policy_type),
    event_date: p.claimDate,
    amount,
    status: 'Claim Recorded',
    notes: p.notes ?? null,
  });
  // Policy stays active — do not close on claim.
};

export const closePolicy = (
  userId: string,
  policy: InsurancePolicy,
  p: { closureDate: string; surrenderValue: number; notes?: string; toCash: boolean },
): void => {
  const surrender = Math.max(0, Math.round(p.surrenderValue || 0));
  remove('insurance_policies', policy.id);
  if (p.toCash && surrender > 0) creditCash(userId, surrender);
  recordHistory(userId, {
    category: 'insurance',
    event_type: 'policy_closed',
    ref_id: policy.id,
    name: policy.policy_name,
    subtype: POLICY_TYPE_LABELS[policy.policy_type] ?? titleCase(policy.policy_type),
    event_date: p.closureDate,
    amount: surrender,
    status: 'Closed',
    notes: p.notes ?? null,
  });
};

// ─── Loan auto-closure on full prepayment ────────────────────────────────────

/** Close (and archive) any loan whose outstanding has hit zero. Returns # closed. */
export const processLoanClosures = (userId: string): number => {
  const loans = all<Loan>('SELECT * FROM loans WHERE user_id = ?', [userId]);
  let changed = 0;
  for (const l of loans) {
    const isClosed = l.status === 'closed' || l.outstanding_amount <= 0;
    if (!isClosed) continue;
    if (l.status !== 'closed') {
      run('UPDATE loans SET status = ?, outstanding_amount = 0 WHERE id = ?', ['closed', l.id]);
      changed += 1;
    }
    if (!hasHistory(userId, l.id, 'loan_closed')) {
      recordHistory(userId, {
        category: 'loan',
        event_type: 'loan_closed',
        ref_id: l.id,
        name: l.provider || (LOAN_TYPE_LABELS[l.loan_type] ?? titleCase(l.loan_type)),
        subtype: LOAN_TYPE_LABELS[l.loan_type] ?? titleCase(l.loan_type),
        event_date: l.next_due_date || todayISO(),
        amount: l.original_amount,
        status: 'Closed',
        notes: 'Fully repaid / closed.',
      });
    }
  }
  return changed;
};

// ─── Goals ───────────────────────────────────────────────────────────────────

/** Record any newly-completed goals (does not remove them). */
export const processGoalCompletions = (userId: string): void => {
  const prog = goalsProgress(userId);
  for (const g of prog.goals) {
    if (g.status === 'completed' && !hasHistory(userId, g.id, 'goal_completed')) {
      recordHistory(userId, {
        category: 'goal',
        event_type: 'goal_completed',
        ref_id: g.id,
        name: g.name,
        subtype: g.goal_type,
        event_date: todayISO(),
        amount: g.target_amount,
        status: 'Completed',
      });
    }
  }
};

export const archiveGoal = (
  userId: string,
  goal: { id: string; name: string; goal_type: string; target_amount: number },
  p: { cancelled?: boolean; notes?: string },
): void => {
  recordHistory(userId, {
    category: 'goal',
    event_type: p.cancelled ? 'goal_cancelled' : 'goal_archived',
    ref_id: goal.id,
    name: goal.name,
    subtype: goal.goal_type,
    event_date: todayISO(),
    amount: goal.target_amount,
    status: p.cancelled ? 'Cancelled' : 'Archived',
    notes: p.notes ?? null,
  });
  remove('financial_goals', goal.id);
};

// ─── Queries ─────────────────────────────────────────────────────────────────

export const historyEvents = (userId: string, category?: HistoryEvent['category']): HistoryEvent[] => {
  if (category) {
    return all<HistoryEvent>(
      'SELECT * FROM history_events WHERE user_id = ? AND category = ? ORDER BY event_date DESC, created_at DESC',
      [userId, category],
    );
  }
  return all<HistoryEvent>(
    'SELECT * FROM history_events WHERE user_id = ? ORDER BY event_date DESC, created_at DESC',
    [userId],
  );
};

/** Run all idempotent lifecycle sweeps; returns true if active data changed. */
export const runLifecycleSweeps = (userId: string): boolean => {
  let changed = 0;
  try { changed += processMaturities(userId); } catch { /* non-critical */ }
  try { changed += processLoanClosures(userId); } catch { /* non-critical */ }
  try { processGoalCompletions(userId); } catch { /* non-critical */ }
  return changed > 0;
};
