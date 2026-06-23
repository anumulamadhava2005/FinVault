/**
 * Compact icon-only light/dark theme toggle for the app header.
 *
 * Uses the same `themeMode` state + persistence as the appearance control in
 * the navigation drawer (via AppContext.setThemeMode), so the two stay in sync
 * automatically. Placed immediately to the left of the NotificationBell.
 */
import React from 'react';
import { Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from 'react-native-paper';
import { useApp } from '../context/AppContext';

const ThemeToggle: React.FC<{ color?: string }> = ({ color }) => {
  const { isDark, setThemeMode } = useApp();
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => setThemeMode(isDark ? 'light' : 'dark')}
      hitSlop={6}
      style={{ padding: 8 }}
      accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <MaterialCommunityIcons
        name={isDark ? 'weather-night' : 'white-balance-sunny'}
        size={22}
        color={color ?? theme.colors.onSurface}
      />
    </Pressable>
  );
};

export default ThemeToggle;
