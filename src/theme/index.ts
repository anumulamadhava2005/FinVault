/**
 * FinVault Mobile theme — customized premium Charcoal Monochromatic theme
 * mapped onto a React Native Paper MD3 theme, with light + dark variants.
 */
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/** Raw brand palette */
export const palette = {
  // Charcoal Monochromatic Dark Theme Colors
  darkBg: '#181818',       // Charcoal background
  darkSurface: '#1F1F1F',  // Card/surface
  darkVariant: '#2A2A2A',  // Lighter separator/panel
  darkInk: '#FAFAFA',      // Bright off-white text
  darkInkMuted: '#A1A1AA', // Gray muted text
  darkBorder: '#2E2E2E',   // Borders

  // Soft Monochromatic Light Theme Colors
  lightBg: '#F5F5F5',      // Soft light background
  lightSurface: '#FFFFFF', // Pure white card/surface
  lightVariant: '#ECECEC', // Lighter panel/separator
  lightInk: '#181818',     // Deep charcoal text
  lightInkMuted: '#71717A',// Gray muted text
  lightBorder: '#E0E0E0',  // Light grey borders

  // Standard Semantic States (clean & vibrant)
  good: '#10B981',         // Emerald 500
  warn: '#F59E0B',         // Amber 500
  danger: '#EF4444',       // Rose 500
  dangerSoft: '#FEF2F2',
  dangerSoftDark: '#7F1D1D',
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
  goalTarget: '#C2E033',
  recommended: '#D4956A',
  yours: '#4A7C6F',
};

/** Status → semantic color */
export const statusColor = (tone: 'good' | 'warn' | 'bad') =>
  tone === 'good' ? palette.good : tone === 'warn' ? palette.warn : palette.danger;

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: 18, // Premium rounded edges
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.lightInk,
    onPrimary: '#FFFFFF',
    primaryContainer: palette.lightVariant,
    onPrimaryContainer: palette.lightInk,
    secondary: palette.lightInkMuted,
    tertiary: palette.good,
    background: palette.lightBg,
    surface: palette.lightSurface,
    surfaceVariant: palette.lightVariant,
    onSurfaceVariant: palette.lightInkMuted,
    outline: palette.lightBorder,
    outlineVariant: palette.lightBorder,
    error: palette.danger,
    errorContainer: palette.dangerSoft,
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level1: palette.lightSurface,
      level2: palette.lightVariant,
      level3: palette.lightSurface,
      level4: palette.lightSurface,
      level5: palette.lightSurface,
    },
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  roundness: 18, // Premium rounded edges
  colors: {
    ...MD3DarkTheme.colors,
    primary: palette.darkInk,
    onPrimary: palette.darkBg,
    primaryContainer: palette.darkVariant,
    onPrimaryContainer: palette.darkInk,
    secondary: palette.darkInkMuted,
    tertiary: palette.good,
    background: palette.darkBg,
    surface: palette.darkSurface,
    surfaceVariant: palette.darkVariant,
    onSurfaceVariant: palette.darkInkMuted,
    outline: palette.darkBorder,
    outlineVariant: palette.darkBorder,
    error: palette.danger,
    errorContainer: palette.dangerSoftDark,
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      level1: palette.darkSurface,
      level2: palette.darkVariant,
      level3: palette.darkSurface,
      level4: palette.darkSurface,
      level5: palette.darkSurface,
    },
  },
};
