/**
 * OS-level push notification scheduling for SIP reminders.
 * Uses expo-notifications (local triggers only — no server required).
 * Notification content never includes account numbers, passwords, or ISIN.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { all, first } from '../db';
import { daysBetween, parseISO, todayISO } from '../utils/date';
import { formatINR } from '../utils/money';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const CHANNEL_ID = 'sip_reminders';
const IDENTIFIER_PREFIX = 'sip_reminder_';

export const setupNotificationChannel = async (): Promise<void> => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'SIP Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
    });
  }
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
};

export const scheduleSipReminders = async (userId: string): Promise<void> => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    const pref = first<{ sip_reminders_enabled: number }>(
      `SELECT sip_reminders_enabled FROM user_preferences WHERE user_id = ?`,
      [userId],
    );
    if (pref && pref.sip_reminders_enabled === 0) return;

    await cancelSipReminders();

    const sips = all<{ id: string; asset_name: string; amount: number; next_due_date: string }>(
      `SELECT s.id, a.name AS asset_name, s.amount, s.next_due_date
       FROM sip_schedules s
       JOIN assets a ON a.id = s.asset_id
       WHERE s.user_id = ? AND s.status = 'active' AND s.next_due_date IS NOT NULL`,
      [userId],
    );

    const now = new Date(todayISO() + 'T00:00:00');

    for (const sip of sips) {
      const due = parseISO(sip.next_due_date);
      if (!due) continue;
      const daysUntil = daysBetween(now, due);
      if (daysUntil < 1 || daysUntil > 7) continue;

      const triggerDate = new Date(due);
      triggerDate.setDate(triggerDate.getDate() - 1);
      triggerDate.setHours(9, 0, 0, 0);

      if (triggerDate <= new Date()) continue;

      await Notifications.scheduleNotificationAsync({
        identifier: `${IDENTIFIER_PREFIX}${sip.id}`,
        content: {
          title: 'SIP due tomorrow',
          body: `${sip.asset_name} — ${formatINR(sip.amount)}`,
          data: { sipId: sip.id },
          categoryIdentifier: CHANNEL_ID,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
          channelId: CHANNEL_ID,
        },
      });
    }
  } catch {
    // Non-critical — silently fail
  }
};

export const cancelSipReminders = async (): Promise<void> => {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier.startsWith(IDENTIFIER_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch { /* silently fail */ }
};
