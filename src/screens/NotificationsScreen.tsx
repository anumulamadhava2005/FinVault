/**
 * NotificationsScreen — displays a list of all system, portfolio, budget,
 * and market notifications. Replaces the old modal-based notifications UI.
 */
import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Divider, Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import { useApp } from '../context/AppContext';
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markAsRead,
} from '../services/notificationService';
import { timeAgo } from '../utils/date';
import { palette } from '../theme';
import { Screen, SectionCard, EmptyState } from '../components/ui';

const KIND_ICONS: Record<string, string> = {
  sip_due: 'autorenew',
  asset_gain: 'trending-up',
  asset_loss: 'trending-down',
  stale_price: 'clock-alert-outline',
  goal_completed: 'flag-checkered',
  goal_deadline: 'calendar-alert',
  goal_behind: 'alert',
  goal_overdue: 'alert-circle',
  budget_exceeded: 'cash-remove',
  emi_due: 'calendar-clock',
  emi_overdue: 'alert-circle',
  premium_due: 'shield-alert-outline',
  policy_expiring: 'shield-sync-outline',
  policy_expired: 'shield-off-outline',
  reminder: 'bell-outline',
  info: 'information-outline',
  market_open: 'chart-line',
  market_close: 'chart-line-variant',
};

const KIND_COLORS: Record<string, string> = {
  sip_due: palette.good,
  asset_gain: palette.good,
  asset_loss: palette.danger,
  stale_price: palette.warn,
  goal_completed: palette.good,
  goal_deadline: palette.warn,
  goal_behind: palette.warn,
  goal_overdue: palette.danger,
  budget_exceeded: palette.danger,
  emi_due: palette.warn,
  emi_overdue: palette.danger,
  premium_due: palette.warn,
  policy_expiring: palette.warn,
  policy_expired: palette.danger,
  reminder: palette.warn,
  info: '#71717A',
  market_open: palette.good,
  market_close: '#71717A',
};

const NotificationsScreen: React.FC = () => {
  const { userId, refreshKey, refresh } = useApp();
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ kinds?: string }>();

  const [notifications, setNotifications] = useState<ReturnType<typeof getNotifications>>([]);
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const kindsFilter = React.useMemo<string[] | null>(() => {
    try {
      return params.kinds ? JSON.parse(params.kinds) : null;
    } catch {
      return null;
    }
  }, [params.kinds]);

  const load = useCallback(() => {
    if (!userId) return;
    const all = getNotifications(userId);
    const filtered = kindsFilter ? all.filter((n) => kindsFilter.includes(n.kind)) : all;
    setNotifications(filtered);
    setUnread(getUnreadCount(userId));
  }, [userId, kindsFilter, refreshKey]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    refresh(); // triggers reload and context refresh
    load();
    setRefreshing(false);
  };

  const handleMarkAllRead = () => {
    if (!userId) return;
    markAllRead(userId);
    setUnread(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    refresh();
  };

  const handleTapNotification = (id: string) => {
    markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)),
    );
    setUnread((u) => Math.max(0, u - 1));
    refresh();
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Notifications',
      headerRight: () =>
        notifications.length > 0 && unread > 0 ? (
          <Button onPress={handleMarkAllRead} compact style={{ marginRight: 8 }}>
            Mark All Read
          </Button>
        ) : null,
    });
  }, [navigation, notifications, unread]);

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme.colors.primary]} />
      }
    >
      <SectionCard style={{ padding: 4 }}>
        {notifications.length === 0 ? (
          <EmptyState
            icon="bell-sleep-outline"
            title="No notifications"
            message={
              kindsFilter
                ? 'No alerts matching this filter found.'
                : 'All clear! We will alert you here for SIPs, budgets, market updates, and goals.'
            }
          />
        ) : (
          <View style={{ gap: 2 }}>
            {notifications.map((n, i) => {
              const iconName = KIND_ICONS[n.kind] ?? 'information-outline';
              const iconClr = KIND_COLORS[n.kind] ?? '#71717A';
              const isUnread = !n.is_read;

              return (
                <View key={n.id}>
                  <Pressable
                    onPress={() => handleTapNotification(n.id)}
                    style={[
                      styles.row,
                      isUnread && {
                        backgroundColor: theme.dark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.05)',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.iconContainer,
                        {
                          backgroundColor: iconClr + '15',
                        },
                      ]}
                    >
                      <MaterialCommunityIcons name={iconName as any} size={22} color={iconClr} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        variant="bodyMedium"
                        style={{
                          fontWeight: isUnread ? '700' : '500',
                          color: theme.colors.onSurface,
                        }}
                      >
                        {n.title}
                      </Text>
                      {n.body ? (
                        <Text
                          variant="bodySmall"
                          style={{
                            color: theme.colors.onSurfaceVariant,
                            lineHeight: 18,
                          }}
                        >
                          {n.body}
                        </Text>
                      ) : null}
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                        {timeAgo(n.created_at)}
                      </Text>
                    </View>
                    {isUnread && <View style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]} />}
                  </Pressable>
                  {i < notifications.length - 1 && <Divider />}
                </View>
              );
            })}
          </View>
        )}
      </SectionCard>
    </Screen>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 8,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    alignSelf: 'center',
    marginRight: 4,
  },
});

export default NotificationsScreen;
