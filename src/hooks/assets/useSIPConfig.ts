import { useApp } from '../../context/AppContext';
import { useData } from '../useData';
import { first, newId, tx } from '../../db';
import type { SIPSchedule } from '../../models/types';
import { todayISO } from '../../utils/date';

export interface SIPConfigValues {
  amount: number;            // paise
  frequency: string;        // monthly|quarterly|half-yearly|yearly
  day_of_month: number;
  annual_step_up_pct: number;
  start_date: string | null;
  end_date: string | null;
  linked_bank: string | null;
  status: string;            // active|paused
}

export const useSIPConfig = (userId: string, assetId: string) => {
  const { refresh } = useApp();

  const sip = useData<SIPSchedule | null>(() =>
    first<SIPSchedule>(
      'SELECT * FROM sip_schedules WHERE user_id = ? AND asset_id = ? LIMIT 1',
      [userId, assetId],
    ),
  );

  const save = (values: SIPConfigValues): void => {
    const today = todayISO();
    const dayTarget = Math.max(1, Math.min(28, values.day_of_month));
    const todayDate = new Date(today);
    const candidate = new Date(todayDate.getFullYear(), todayDate.getMonth(), dayTarget);
    if (candidate <= todayDate) candidate.setMonth(candidate.getMonth() + 1);
    const nextDueDate = candidate.toISOString().slice(0, 10);
    const existingSipId = sip?.id ?? null;

    tx((db) => {
      if (existingSipId) {
        db.runSync(
          `UPDATE sip_schedules SET amount=?, frequency=?, day_of_month=?, annual_step_up_pct=?,
           start_date=?, end_date=?, linked_bank=?, status=?, next_due_date=? WHERE id=?`,
          [values.amount, values.frequency, dayTarget, values.annual_step_up_pct,
           values.start_date ?? null, values.end_date ?? null, values.linked_bank ?? null,
           values.status, nextDueDate, existingSipId],
        );
      } else {
        db.runSync(
          `INSERT INTO sip_schedules (id, user_id, asset_id, amount, frequency, day_of_month,
           annual_step_up_pct, start_date, end_date, linked_bank, status, next_due_date)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [newId(), userId, assetId, values.amount, values.frequency, dayTarget,
           values.annual_step_up_pct, values.start_date ?? null, values.end_date ?? null,
           values.linked_bank ?? null, values.status, nextDueDate],
        );
      }
      const isActive = values.status === 'active' ? 1 : 0;
      db.runSync(
        'UPDATE assets SET is_sip=?, sip_monthly_amount=? WHERE id=?',
        [isActive, isActive ? values.amount : 0, assetId],
      );
    });

    refresh();
  };

  return { sip, save };
};
