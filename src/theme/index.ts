/**
 * FinVault Mobile theme — mirrors the web app's palette (static/css/main.css)
 * mapped onto a React Native Paper MD3 theme, with light + dark variants.
 */
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/** Raw brand palette, lifted from the web app's CSS custom properties. */
export const palette = {
  lime: '#C2E033',
  limeDeep: '#A9CF3A',
  ink: '#14161B',
  ink2: '#2B2F38',
  muted: '#6B7177',
  bg: '#ECECEE',
  surface: '#F3F3F4',
  card: '#FFFFFF',
  border: '#E7E8EB',
  danger: '#E05C5C',
  dangerStrong: '#BA1A1A',
  dangerSoft: '#FBEAEA',
  warn: '#E0922B',
  warnSoft: '#FFF8F1',
  good: '#2FA86B', // --bar-good
  gold: '#D4956A',
  // Dark surfaces
  darkBg: '#0E0F12',
  darkSurface: '#1A1C22',
  darkCard: '#23262D',
} as const;

/**
 * Shared chart colour/order convention — the RN equivalent of the web app's
 * `FV_CHART_COLORS`. The reference series (original / target / recommended) is
 * ALWAYS first; the actual series (outstanding / achieved / yours) is second.
 */
export const chartColors = {
  original: '#316357', // initial / original / sum-assured — first
  current: '#D4956A', // outstanding / current / used — second
  income: '#4A7C6F',
  expense: '#E05C5C',
  achieved: '#2FA86B',
  target: '#9DD1C2',
  recommended: '#D4956A',
  yours: '#4A7C6F',
};

/** Status → semantic colour, used by progress bars and badges (status, not item). */
export const statusColor = (tone: 'good' | 'warn' | 'bad') =>
  tone === 'good' ? palette.good : tone === 'warn' ? palette.warn : palette.danger;

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: 3,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.ink,
    onPrimary: '#FFFFFF',
    primaryContainer: palette.lime,
    onPrimaryContainer: palette.ink,
    secondary: palette.good,
    tertiary: palette.gold,
    background: palette.bg,
    surface: palette.card,
    surfaceVariant: palette.surface,
    onSurfaceVariant: palette.muted,
    outline: palette.border,
    outlineVariant: '#F1F2F4',
    error: palette.danger,
    errorContainer: palette.dangerSoft,
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level1: '#FFFFFF',
      level2: '#FBFBFC',
    },
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  roundness: 3,
  colors: {
    ...MD3DarkTheme.colors,
    primary: palette.lime,
    onPrimary: palette.ink,
    primaryContainer: palette.ink2,
    onPrimaryContainer: palette.lime,
    secondary: palette.good,
    tertiary: palette.gold,
    background: palette.darkBg,
    surface: palette.darkCard,
    surfaceVariant: palette.darkSurface,
    onSurfaceVariant: '#9AA0A6',
    outline: '#3A3D44',
    error: palette.danger,
    errorContainer: '#4A2222',
  },
};
