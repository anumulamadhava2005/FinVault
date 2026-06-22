/**
 * In-app notification generator and manager.
 * Creates notifications stored in the `notifications` table
 * based on asset milestones, SIP due dates, and goal status.
 */
import { all, first, insert, newId, run } from '../db';
import type { Asset, FinancialGoal, SIPSchedule } from '../models/types';
import { goalsProgress, GOAL_STATUS_META } from './finance';
import { daysBetween, nowISO, parseISO, todayISO } from '../utils/date';
import { formatINR } from '../utils/money';

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
