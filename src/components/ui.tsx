/** Shared presentational components used across screens. */
import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View, Animated, type ViewStyle } from 'react-native';
import { Card, Chip, Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { palette, statusColor } from '../theme';
import { formatINR } from '../utils/money';
import BouncePressable from './BouncePressable';

export const Screen: React.FC<{
  children: React.ReactNode;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}> = ({
  children,
  refreshControl,
}) => {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.screen}
      refreshControl={refreshControl}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
};

export const Row: React.FC<{ children: React.ReactNode; style?: ViewStyle; gap?: number }> = ({
  children,
  style,
  gap = 16,
}) => <View style={[styles.row, { gap }, style]}>{children}</View>;

export const SectionCard: React.FC<{
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}> = ({ title, right, children, style, onPress }) => {
  const theme = useTheme();

  const cardContent = (
    <Card
      style={[
        styles.card,
        {
          borderColor: theme.colors.outline,
          borderWidth: 1,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.roundness,
          elevation: 0,
        },
        style,
      ]}
      mode="contained"
    >
      <Card.Content style={{ padding: 18 }}>
        {(title || right) && (
          <View style={styles.cardHead}>
            {title ? (
              <Text variant="titleMedium" style={[styles.cardTitle, { color: theme.colors.onSurface }]}>
                {title}
              </Text>
            ) : (
              <View />
            )}
            {right}
          </View>
        )}
        {children}
      </Card.Content>
    </Card>
  );

  if (onPress) {
    return (
      <BouncePressable onPress={onPress} activeScale={0.98}>
        {cardContent}
      </BouncePressable>
    );
  }

  return cardContent;
};

export const Kpi: React.FC<{ label: string; value: string; sub?: string; subTone?: 'good' | 'bad' | 'muted' | 'warn'; flex?: boolean }> = ({
  label,
  value,
  sub,
  subTone = 'muted',
  flex = true,
}) => {
  const theme = useTheme();
  const subColor =
    subTone === 'good'
      ? palette.good
      : subTone === 'bad'
      ? palette.danger
      : subTone === 'warn'
      ? palette.warn
      : theme.dark
      ? '#B3B3B3'
      : theme.colors.onSurfaceVariant;
  return (
    <View
      style={[
        styles.kpi,
        flex && { flex: 1 },
        {
          borderColor: theme.colors.outline,
          borderWidth: 1,
          backgroundColor: theme.colors.surfaceVariant,
          borderRadius: theme.roundness - 4,
          padding: 14,
        },
      ]}
    >
      <Text
        variant="labelSmall"
        style={{
          color: theme.dark ? '#B3B3B3' : theme.colors.onSurfaceVariant,
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
      <Text
        variant="titleLarge"
        style={{
          fontWeight: '700',
          marginTop: 6,
          fontVariant: ['tabular-nums'],
          fontSize: 18,
          color: theme.colors.onSurface,
          letterSpacing: -0.3,
        }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? (
        <Text
          variant="bodySmall"
          style={{
            color: subColor,
            marginTop: 4,
            fontVariant: ['tabular-nums'],
            fontSize: 12,
            fontWeight: '600',
          }}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
};

/** Money text helper. */
export const Money: React.FC<{ paise: number; style?: any; variant?: any }> = ({ paise, style, variant }) => (
  <Text variant={variant} style={style}>
    {formatINR(paise)}
  </Text>
);

export const StatusChip: React.FC<{ label: string; tone: 'good' | 'warn' | 'bad'; icon?: string }> = ({
  label,
  tone,
  icon,
}) => {
  const color = statusColor(tone);
  return (
    <Chip
      compact
      icon={icon ? () => <MaterialCommunityIcons name={icon as any} size={14} color={color} /> : undefined}
      style={{ backgroundColor: color + '15', borderRadius: 8, borderWidth: 0 }}
      textStyle={{ color, fontSize: 11, fontWeight: '700' }}
    >
      {label}
    </Chip>
  );
};

/**
 * Progress bar with an optional "expected by today" pace marker — mirrors the
 * web Goals bar (fill = saved, marker = where a steady pace should be).
 */
export const ProgressBar: React.FC<{ pct: number; color?: string; markerPct?: number; height?: number }> = ({
  pct,
  color = palette.good,
  markerPct,
  height = 8,
}) => {
  const theme = useTheme();
  const widthAnim = useRef(new Animated.Value(0)).current;

  const targetPct = Math.max(0, Math.min(100, pct));

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: targetPct,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [targetPct]);

  const widthPercent = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.barTrack, { height, backgroundColor: theme.colors.surfaceVariant }]}>
      <Animated.View style={{ width: widthPercent, height: '100%', backgroundColor: color, borderRadius: 999 }} />
      {markerPct !== undefined && markerPct > 0 && markerPct < 100 ? (
        <View style={[styles.paceMarker, { left: `${markerPct}%`, backgroundColor: theme.colors.primary }]} />
      ) : null}
    </View>
  );
};

export const EmptyState: React.FC<{ icon: string; title: string; message: string; children?: React.ReactNode }> = ({
  icon,
  title,
  message,
  children,
}) => {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon as any} size={44} color={theme.colors.onSurfaceVariant} />
      <Text variant="titleMedium" style={{ marginTop: 8, fontWeight: '700' }}>
        {title}
      </Text>
      <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 4, fontSize: 13 }}>{message}</Text>
      {children ? <View style={{ marginTop: 12 }}>{children}</View> : null}
    </View>
  );
};

/** Simple labelled row (label left, value right). */
export const LineItem: React.FC<{ label: string; value: string; valueColor?: string }> = ({ label, value, valueColor }) => {
  const theme = useTheme();
  return (
    <View style={styles.lineItem}>
      <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 13, flex: 1, marginRight: 12 }} numberOfLines={2}>{label}</Text>
      <Text style={{ fontWeight: '600', color: valueColor ?? theme.colors.onSurface, fontSize: 13, fontVariant: ['tabular-nums'], textAlign: 'right' }}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { padding: 18, paddingBottom: 110, gap: 16 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  card: { overflow: 'hidden' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontWeight: '700', flex: 1, letterSpacing: -0.2 },
  kpi: { overflow: 'hidden' },
  barTrack: { width: '100%', borderRadius: 999, overflow: 'hidden', position: 'relative' },
  paceMarker: { position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, borderRadius: 2 },
  empty: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 16 },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
});
export default Screen;
