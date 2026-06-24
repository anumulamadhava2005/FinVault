/**
 * In-app notification generator and manager.
 * Creates notifications stored in the `notifications` table
 * based on asset milestones, SIP due dates, and goal status.
 */
import { all, first, insert, newId, run } from '../db';
import type { Asset, FinancialGoal, SIPSchedule, Loan, InsurancePolicy } from '../models/types';
import { goalsProgress, GOAL_STATUS_META } from './finance';
import { daysBetween, nowISO, parseISO, todayISO } from '../utils/date';
import { formatINR } from '../utils/money';
import { getMarketSnapshot } from './marketFeeds';

// ─── Query helpers ──────────────────────────────────────────────────────────

export const getUnreadCount = (userId: string): number =>
  first<{ c: number }>(
    'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId],
  )?.c ?? 0;

export const getNotifications = (userId: string, limit = 50) =>
  all<{
    id: string;
    title: string;
    body: string | null;
    kind: string;
    is_read: number;
    created_at: string;
  }>(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, limit],
  );

export const markAsRead = (notificationId: string) =>
  run('UPDATE notifications SET is_read = 1 WHERE id = ?', [notificationId]);

export const markAllRead = (userId: string) =>
  run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', [userId]);

// ─── Idempotency check ─────────────────────────────────────────────────────

/** Returns true if we already created a notification with this title+kind today. */
const alreadyNotifiedToday = (userId: string, title: string, kind: string): boolean => {
  const today = todayISO();
  const row = first<{ c: number }>(
    `SELECT COUNT(*) AS c FROM notifications
     WHERE user_id = ? AND title = ? AND kind = ? AND created_at >= ?`,
    [userId, title, kind, today],
  );
  return (row?.c ?? 0) > 0;
};

const notify = (userId: string, title: string, body: string, kind: string) => {
  if (alreadyNotifiedToday(userId, title, kind)) return;
  insert('notifications', {
    id: newId(),
    user_id: userId,
    title,
    body,
    kind,
    is_read: false,
    created_at: nowISO(),
  });
};

// ─── Asset-related notifications ────────────────────────────────────────────

export const generateAssetNotifications = (userId: string): void => {
  const today = new Date(todayISO() + 'T00:00:00');

  // 1. SIP due dates within 3 days
  const sips = all<SIPSchedule & { asset_name: string }>(
    `SELECT s.*, a.name AS asset_name FROM sip_schedules s
     JOIN assets a ON a.id = s.asset_id
     WHERE s.user_id = ? AND s.status = 'active' AND s.next_due_date IS NOT NULL`,
    [userId],
  );
  for (const sip of sips) {
    const due = parseISO(sip.next_due_date);
    if (!due) continue;
    const daysUntil = daysBetween(today, due);
    if (daysUntil >= 0 && daysUntil <= 3) {
      const label = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
      notify(
        userId,
        `SIP due ${label}`,
        `${sip.asset_name} SIP of ${formatINR(sip.amount)} is due ${label}.`,
        'sip_due',
      );
    }
  }

  // 2. Significant P&L changes (>10% gain or loss)
  const assets = all<Asset & { type_name: string }>(
    `SELECT a.*, t.name AS type_name FROM assets a
     JOIN asset_types t ON t.id = a.asset_type_id
     WHERE a.user_id = ? AND a.invested_amount > 0`,
    [userId],
  );
  for (const a of assets) {
    const pnlPct = ((a.current_value - a.invested_amount) / a.invested_amount) * 100;
    if (pnlPct >= 25) {
      notify(
        userId,
        `${a.name} up ${Math.round(pnlPct)}%`,
        `${a.name} has gained ${Math.round(pnlPct)}% — consider booking profits.`,
        'asset_gain',
      );
    } else if (pnlPct <= -15) {
      notify(
        userId,
        `${a.name} down ${Math.abs(Math.round(pnlPct))}%`,
        `${a.name} is down ${Math.abs(Math.round(pnlPct))}% from invested value.`,
        'asset_loss',
      );
    }
  }

  // 3. Stale prices (no update in 7+ days for assets that have a ticker/ISIN)
  const priceableAssets = all<Asset>(
    `SELECT * FROM assets WHERE user_id = ? AND (ticker IS NOT NULL OR isin IS NOT NULL)`,
    [userId],
  );
  for (const a of priceableAssets) {
    if (!a.last_price_updated_at) {
      notify(
        userId,
        `${a.name} price never updated`,
        `Tap Refresh on the Assets screen to fetch the latest price for ${a.name}.`,
        'stale_price',
      );
    } else {
      const lastUpdate = parseISO(a.last_price_updated_at);
      if (lastUpdate && daysBetween(lastUpdate, today) >= 7) {
        notify(
          userId,
          `${a.name} price is stale`,
          `Price hasn't been updated in over a week. Tap Refresh to update.`,
          'stale_price',
        );
      }
    }
  }
};

// ─── Expense budget notifications ───────────────────────────────────────────

export const generateExpenseNotifications = (
  userId: string,
  year: number,
  month: number,
): void => {
  const categories = all<{ id: string; name: string; budget_amount: number }>(
    'SELECT id, name, budget_amount FROM expense_categories WHERE (user_id = ? OR (is_system = 1 AND user_id IS NULL)) AND budget_amount > 0',
    [userId],
  );

  if (!categories.length) return;

  const monthStr = String(month).padStart(2, '0');
  const prefix = `${year}-${monthStr}`;

  const totals = all<{ category_id: string; total: number }>(
    `SELECT category_id, SUM(amount) AS total
     FROM expenses
     WHERE user_id = ? AND expense_date LIKE ?
     GROUP BY category_id`,
    [userId, `${prefix}%`],
  );

  const totalMap = new Map(totals.map((t) => [t.category_id, t.total]));

  for (const cat of categories) {
    const spent = totalMap.get(cat.id) ?? 0;
    if (spent <= cat.budget_amount) continue;
    const excess = spent - cat.budget_amount;
    notify(
      userId,
      `${cat.name} budget exceeded`,
      `${cat.name} budget exceeded by ${formatINR(excess)} this month.`,
      'budget_exceeded',
    );
  }
};

// ─── Goal-related notifications ─────────────────────────────────────────────

export const generateGoalNotifications = (userId: string): void => {
  const today = new Date(todayISO() + 'T00:00:00');
  const progress = goalsProgress(userId);

  for (const g of progress.goals) {
    // 1. Goal completed
    if (g.status === 'completed') {
      notify(
        userId,
        `🎉 "${g.name}" goal reached!`,
        `Congratulations! You've achieved your target of ${formatINR(g.target_amount)}.`,
        'goal_completed',
      );
    }

    // 2. Goal approaching target date (within 30 days)
    if (g.target_date && g.status !== 'completed') {
      const target = parseISO(g.target_date);
      if (target) {
        const daysLeft = daysBetween(today, target);
        if (daysLeft >= 0 && daysLeft <= 30 && g.pct < 90) {
          notify(
            userId,
            `"${g.name}" deadline approaching`,
            `Only ${daysLeft} days left, ${g.pct}% achieved. Need ~${formatINR(g.required_monthly)}/mo to finish.`,
            'goal_deadline',
          );
        }
      }
    }

    // 3. Goal falling behind schedule
    if (g.status === 'behind' && g.pct < g.expected_pct - 10) {
      notify(
        userId,
        `"${g.name}" falling behind`,
        `Expected ${g.expected_pct}% by now but only ${g.pct}% achieved. Increase contributions to stay on track.`,
        'goal_behind',
      );
    }

    // 4. Goal overdue
    if (g.status === 'overdue') {
      const shortfall = g.target_amount - g.current;
      notify(
        userId,
        `"${g.name}" is overdue`,
        `Target date has passed with a shortfall of ${formatINR(shortfall)}. Consider extending the deadline.`,
        'goal_overdue',
      );
    }
  }
};

// ─── Loan EMI notifications ─────────────────────────────────────────────────

const LOAN_TYPE_LABELS: Record<string, string> = {
  home: 'Home loan',
  education: 'Education loan',
  vehicle: 'Vehicle loan',
  personal: 'Personal loan',
  credit_card: 'Credit card',
  gold: 'Gold loan',
  business: 'Business loan',
  lap: 'Loan against property',
  other: 'Loan',
};

const loanLabel = (l: Loan): string => {
  const base = LOAN_TYPE_LABELS[l.loan_type] ?? 'Loan';
  return l.provider ? `${l.provider} ${base.toLowerCase()}` : base;
};

export const generateLoanNotifications = (userId: string): void => {
  const today = new Date(todayISO() + 'T00:00:00');

  const loans = all<Loan>(
    `SELECT * FROM loans
     WHERE user_id = ? AND status != 'closed' AND next_due_date IS NOT NULL AND emi_amount > 0`,
    [userId],
  );

  for (const loan of loans) {
    const due = parseISO(loan.next_due_date);
    if (!due) continue;
    const daysUntil = daysBetween(today, due);
    const label = loanLabel(loan);
    const emi = formatINR(loan.emi_amount);

    if (daysUntil < 0) {
      notify(
        userId,
        `${label} EMI overdue`,
        `Your EMI of ${emi} was due on ${loan.next_due_date}. Please pay to avoid penalties.`,
        'emi_overdue',
      );
    } else if (daysUntil === 0) {
      notify(userId, `${label} EMI due today`, `Your EMI of ${emi} is due today.`, 'emi_due');
    } else if (daysUntil === 1) {
      notify(userId, `${label} EMI due tomorrow`, `Your EMI of ${emi} is due tomorrow.`, 'emi_due');
    } else if (daysUntil === 3) {
      notify(userId, `${label} EMI due in 3 days`, `Your EMI of ${emi} is due in 3 days.`, 'emi_due');
    } else if (daysUntil === 7) {
      notify(userId, `${label} EMI due in 7 days`, `Your EMI of ${emi} is due in 7 days.`, 'emi_due');
    }
  }
};

// ─── Insurance premium & expiry notifications ───────────────────────────────

export const generateInsuranceNotifications = (userId: string): void => {
  const today = new Date(todayISO() + 'T00:00:00');

  const policies = all<InsurancePolicy>(
    `SELECT * FROM insurance_policies WHERE user_id = ? AND status != 'lapsed'`,
    [userId],
  );

  for (const p of policies) {
    const name = p.policy_name || p.provider || 'Policy';

    // Premium due reminders
    if (p.next_due_date && p.premium_amount > 0) {
      const due = parseISO(p.next_due_date);
      if (due) {
        const daysUntil = daysBetween(today, due);
        const premium = formatINR(p.premium_amount);
        if (daysUntil === 0) {
          notify(userId, `${name} premium due today`, `Premium of ${premium} is due today.`, 'premium_due');
        } else if (daysUntil === 1) {
          notify(userId, `${name} premium due tomorrow`, `Premium of ${premium} is due tomorrow.`, 'premium_due');
        } else if (daysUntil === 3) {
          notify(userId, `${name} premium due in 3 days`, `Premium of ${premium} is due in 3 days.`, 'premium_due');
        } else if (daysUntil === 7) {
          notify(userId, `${name} premium due in 7 days`, `Premium of ${premium} is due in 7 days.`, 'premium_due');
        }
      }
    }

    // Policy expiry reminders
    if (p.expiry_date) {
      const expiry = parseISO(p.expiry_date);
      if (expiry) {
        const daysUntil = daysBetween(today, expiry);
        if (daysUntil < 0) {
          notify(
            userId,
            `${name} policy expired`,
            `This policy expired on ${p.expiry_date}. Renew to stay covered.`,
            'policy_expired',
          );
        } else if (daysUntil >= 0 && daysUntil <= 30) {
          const when = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
          notify(
            userId,
            `${name} policy expiring soon`,
            `This policy expires ${when} (${p.expiry_date}). Renew to stay covered.`,
            'policy_expiring',
          );
        }
      }
    }
  }
};

// ─── Market opening and closing notifications ───────────────────────────────

export const generateMarketNotifications = (userId: string): void => {
  const snap = getMarketSnapshot();
  if (!snap) return;

  const nifty = snap.indices.find((i) => i.symbol === '^NSEI');
  const sensex = snap.indices.find((i) => i.symbol === '^BSESN');
  if (!nifty || !sensex) return;

  const now = new Date();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  if (isWeekend) return; // Stock market is closed on weekends

  const formatPrice = (val: number) => Math.round(val).toLocaleString('en-IN');

  // 1. Market Open notification (Past 9:15 AM local time)
  const openTime = new Date();
  openTime.setHours(9, 15, 0, 0);
  if (now >= openTime) {
    // Back out the open price from current price and day change percent:
    // price = open * (1 + changePct/100) => open = price / (1 + changePct/100)
    const niftyOpen = nifty.price / (1 + nifty.changePct / 100);
    const sensexOpen = sensex.price / (1 + sensex.changePct / 100);

    notify(
      userId,
      'NSE/BSE Market Open',
      `Nifty 50 opened today at ${formatPrice(niftyOpen)} (currently ${formatPrice(nifty.price)}). Sensex opened at ${formatPrice(sensexOpen)} (currently ${formatPrice(sensex.price)}).`,
      'market_open',
    );
  }

  // 2. Market Close notification (Past 3:30 PM local time)
  const closeTime = new Date();
  closeTime.setHours(15, 30, 0, 0);
  if (now >= closeTime) {
    notify(
      userId,
      'NSE/BSE Market Close',
      `Nifty 50 closed at ${formatPrice(nifty.price)} (${nifty.changePct >= 0 ? '+' : ''}${nifty.changePct.toFixed(2)}%). Sensex closed at ${formatPrice(sensex.price)} (${sensex.changePct >= 0 ? '+' : ''}${sensex.changePct.toFixed(2)}%).`,
      'market_close',
    );
  }
};

// ─── Aggregate generator (Dashboard notification hub) ───────────────────────

/**
 * Runs every notification generator. Used by the Dashboard, which acts as the
 * unified notification center aggregating alerts from all modules.
 */
export const generateAllNotifications = (userId: string, year: number, month: number): void => {
  try { generateAssetNotifications(userId); } catch { /* non-critical */ }
  try { generateExpenseNotifications(userId, year, month); } catch { /* non-critical */ }
  try { generateGoalNotifications(userId); } catch { /* non-critical */ }
  try { generateLoanNotifications(userId); } catch { /* non-critical */ }
  try { generateInsuranceNotifications(userId); } catch { /* non-critical */ }
  try { generateMarketNotifications(userId); } catch { /* non-critical */ }
};
