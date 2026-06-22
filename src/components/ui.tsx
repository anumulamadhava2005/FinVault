/** Shared presentational components used across screens. */
import React from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { Card, Chip, Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { palette, statusColor } from '../theme';
import { formatINR } from '../utils/money';

export const Screen: React.FC<{
  children: React.ReactNode;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}> = ({
  children,
  refreshControl,
}) => (
  <ScrollView
    style={{ flex: 1 }}
    contentContainerStyle={styles.screen}
    refreshControl={refreshControl}
    keyboardShouldPersistTaps="handled"
  >
    {children}
  </ScrollView>
);

export const Row: React.FC<{ children: React.ReactNode; style?: ViewStyle; gap?: number }> = ({
  children,
  style,
  gap = 12,
}) => <View style={[styles.row, { gap }, style]}>{children}</View>;

export const SectionCard: React.FC<{
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}> = ({ title, right, children, style, onPress }) => (
  <Card style={[styles.card, style]} mode="elevated" onPress={onPress}>
    <Card.Content>
      {(title || right) && (
        <View style={styles.cardHead}>
          {title ? (
            <Text variant="titleMedium" style={styles.cardTitle}>
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

export const Kpi: React.FC<{ label: string; value: string; sub?: string; subTone?: 'good' | 'bad' | 'muted'; flex?: boolean }> = ({
  label,
  value,
  sub,
  subTone = 'muted',
  flex = true,
}) => {
  const theme = useTheme();
  const subColor = subTone === 'good' ? palette.good : subTone === 'bad' ? palette.danger : theme.colors.onSurfaceVariant;
  return (
    <Card style={[styles.kpi, flex && { flex: 1 }]} mode="contained">
      <Card.Content style={{ paddingVertical: 12 }}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }}>
          {label}
        </Text>
        <Text
          variant="titleMedium"
          style={{ fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'], fontSize: 15 }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
        {sub ? (
          <Text variant="bodySmall" style={{ color: subColor, marginTop: 1, fontVariant: ['tabular-nums'], fontSize: 12 }}>
            {sub}
          </Text>
        ) : null}
      </Card.Content>
    </Card>
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
      style={{ backgroundColor: color + '22' }}
      textStyle={{ color, fontSize: 12, fontWeight: '700' }}
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
  const w = Math.max(0, Math.min(100, pct));
  return (
    <View style={[styles.barTrack, { height, backgroundColor: theme.dark ? '#23262D' : '#F0F3FF' }]}>
      <View style={{ width: `${w}%`, height: '100%', backgroundColor: color, borderRadius: 999 }} />
      {markerPct !== undefined && markerPct > 0 && markerPct < 100 ? (
        <View style={[styles.paceMarker, { left: `${markerPct}%`, backgroundColor: theme.dark ? '#fff' : '#111827' }]} />
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
      <Text variant="titleMedium" style={{ marginTop: 8 }}>
        {title}
      </Text>
      <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 4 }}>{message}</Text>
      {children ? <View style={{ marginTop: 12 }}>{children}</View> : null}
    </View>
  );
};

/** Simple labelled row (label left, value right). */
export const LineItem: React.FC<{ label: string; value: string; valueColor?: string }> = ({ label, value, valueColor }) => {
  const theme = useTheme();
  return (
    <View style={styles.lineItem}>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text>
      <Text style={{ fontWeight: '700', color: valueColor }}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { padding: 14, paddingBottom: 96, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  card: { borderRadius: 16 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { fontWeight: '800', flex: 1 },
  kpi: { borderRadius: 14 },
  barTrack: { width: '100%', borderRadius: 999, overflow: 'hidden', position: 'relative' },
  paceMarker: { position: 'absolute', top: 0, bottom: 0, width: 3, marginLeft: -1, borderRadius: 2 },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 16 },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
});
