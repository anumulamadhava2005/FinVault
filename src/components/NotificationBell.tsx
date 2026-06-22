/**
 * Notification bell icon with badge, plus a dialog listing notifications.
 * Self-contained — queries unread count from the DB directly.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { Badge, Button, Dialog, Divider, Portal, Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

import { useApp } from '../context/AppContext';
import {
  getUnreadCount,
  getNotifications,
  markAsRead,
  markAllRead,
} from '../services/notificationService';
import { timeAgo } from '../utils/date';
import { palette } from '../theme';

const KIND_ICONS: Record<string, string> = {
  sip_due: 'autorenew',
  asset_gain: 'trending-up',
  asset_loss: 'trending-down',
  stale_price: 'clock-alert-outline',
  goal_completed: 'flag-checkered',
  goal_deadline: 'calendar-alert',
  goal_behind: 'alert',
  goal_overdue: 'alert-circle',
  info: 'information-outline',
};

const KIND_COLORS: Record<string, string> = {
  sip_due: palette.lime,
  asset_gain: palette.good,
  asset_loss: palette.danger,
  stale_price: palette.warn,
  goal_completed: palette.good,
  goal_deadline: palette.warn,
  goal_behind: palette.warn,
  goal_overdue: palette.danger,
  info: palette.muted,
};

interface NotificationBellProps {
  /** Optional filter to only show notifications of these kinds. */
  kinds?: string[];
  /** Called after generating notifications so screens can re-query. */
  onGenerate?: () => void;
  color?: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ kinds, color, onGenerate }) => {
  const { userId, refreshKey } = useApp();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<ReturnType<typeof getNotifications>>([]);

  const load = useCallback(() => {
    setUnread(getUnreadCount(userId));
  }, [userId, refreshKey]);

  useFocusEffect(load);

  const handleOpen = () => {
    const all = getNotifications(userId);
    const filtered = kinds ? all.filter((n) => kinds.includes(n.kind)) : all;
    setNotifications(filtered);
    setOpen(true);
  };

  const handleMarkAllRead = () => {
    markAllRead(userId);
    setUnread(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    onGenerate?.();
  };

  const handleTapNotification = (id: string) => {
    markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)),
    );
    setUnread((u) => Math.max(0, u - 1));
  };

  const iconColor = color ?? theme.colors.onSurface;

  return (
    <>
      <Pressable onPress={handleOpen} style={styles.bellWrap}>
        <MaterialCommunityIcons
          name={unread > 0 ? 'bell-ring' : 'bell-outline'}
          size={22}
          color={iconColor}
        />
        {unread > 0 && (
          <Badge size={16} style={styles.badge}>
            {unread > 9 ? '9+' : unread}
          </Badge>
        )}
      </Pressable>

      <Portal>
        <Dialog visible={open} onDismiss={() => setOpen(false)} style={{ maxHeight: '85%' }}>
          <Dialog.Title>Notifications</Dialog.Title>
          <Dialog.ScrollArea style={{ maxHeight: 420 }}>
            <ScrollView>
              {notifications.length === 0 ? (
                <View style={styles.empty}>
                  <MaterialCommunityIcons
                    name="bell-sleep-outline"
                    size={40}
                    color={theme.colors.onSurfaceVariant}
                  />
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}
                  >
                    No notifications yet
                  </Text>
                </View>
              ) : (
                notifications.map((n, i) => {
                  const iconName = KIND_ICONS[n.kind] ?? 'information-outline';
                  const iconClr = KIND_COLORS[n.kind] ?? palette.muted;
                  return (
                    <React.Fragment key={n.id}>
                      <Pressable
                        onPress={() => handleTapNotification(n.id)}
                        style={[
                          styles.notifRow,
                          !n.is_read && { backgroundColor: theme.dark ? '#1E2028' : '#F0F7FF' },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={iconName as any}
                          size={20}
                          color={iconClr}
                          style={{ marginTop: 2 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            variant="bodyMedium"
                            style={{ fontWeight: n.is_read ? '400' : '700' }}
                            numberOfLines={2}
                          >
                            {n.title}
                          </Text>
                          {n.body ? (
                            <Text
                              variant="bodySmall"
                              style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
                              numberOfLines={3}
                            >
                              {n.body}
                            </Text>
                          ) : null}
                          <Text
                            variant="labelSmall"
                            style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
                          >
                            {timeAgo(n.created_at)}
                          </Text>
                        </View>
                        {!n.is_read && (
                          <View style={[styles.unreadDot, { backgroundColor: palette.good }]} />
                        )}
                      </Pressable>
                      {i < notifications.length - 1 && <Divider />}
                    </React.Fragment>
                  );
                })
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            {notifications.length > 0 && unread > 0 && (
              <Button onPress={handleMarkAllRead}>Mark all read</Button>
            )}
            <Button onPress={() => setOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

const styles = StyleSheet.create({
  bellWrap: {
    padding: 8,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 36,
  },
  notifRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'flex-start',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
});

export default NotificationBell;
