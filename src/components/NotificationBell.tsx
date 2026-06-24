/**
 * Notification bell icon with badge. Tapping it navigates to the
 * dedicated Notifications screen rather than opening a modal.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Badge, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import { useApp } from '../context/AppContext';
import { getUnreadCount } from '../services/notificationService';

interface NotificationBellProps {
  /** Optional filter to only show notifications of these kinds. */
  kinds?: string[];
  /** Called after generating notifications so screens can re-query. (Kept for compatibility) */
  onGenerate?: () => void;
  color?: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ kinds, color }) => {
  const { userId, refreshKey } = useApp();
  const theme = useTheme();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    if (userId) {
      setUnread(getUnreadCount(userId));
    }
  }, [userId, refreshKey]);

  useFocusEffect(load);

  const handlePress = () => {
    router.push({
      pathname: '/notifications',
      params: kinds ? { kinds: JSON.stringify(kinds) } : {},
    } as any);
  };

  const iconColor = color ?? theme.colors.onSurface;

  return (
    <Pressable onPress={handlePress} style={styles.bellWrap}>
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
});

export default NotificationBell;
