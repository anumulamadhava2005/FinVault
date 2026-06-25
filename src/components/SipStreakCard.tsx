import React from 'react';
import { View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { SectionCard } from './ui';
import type { SipStreakMonth } from '../services/finance';
import { palette } from '../theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const cellColor = (paid: number, total: number, isDark: boolean): string => {
  if (total === 0) return isDark ? '#2A2A2A' : '#EEEEEE';
  const ratio = paid / total;
  if (ratio >= 1) return palette.good;
  if (ratio >= 0.5) return '#F0B429';
  return palette.danger;
};

interface Props {
  data: SipStreakMonth[];
  streakMonths: number;
}

export const SipStreakCard: React.FC<Props> = ({ data, streakMonths }) => {
  const theme = useTheme();
  const isDark = theme.dark;

  const now = new Date();
  const months: { ym: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ ym, label: MONTHS[d.getMonth()] });
  }

  const dataMap = new Map(data.map((d) => [d.ym, d]));

  return (
    <SectionCard
      title="Investment Streak"
      right={
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
          {streakMonths} mo active
        </Text>
      }
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {months.map(({ ym, label }) => {
          const d = dataMap.get(ym);
          const color = d ? cellColor(d.paid, d.total, isDark) : (isDark ? '#2A2A2A' : '#EEEEEE');
          return (
            <View key={ym} style={{ alignItems: 'center', gap: 4 }}>
              <View style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: color }} />
              <Text variant="bodySmall" style={{ fontSize: 9, color: theme.colors.onSurfaceVariant }}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        {[
          { color: palette.good, label: 'All paid' },
          { color: '#F0B429', label: 'Partial' },
          { color: palette.danger, label: 'Skipped' },
          { color: isDark ? '#2A2A2A' : '#EEEEEE', label: 'No SIP' },
        ].map(({ color, label }) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
            <Text variant="bodySmall" style={{ fontSize: 10, color: theme.colors.onSurfaceVariant }}>{label}</Text>
          </View>
        ))}
      </View>
    </SectionCard>
  );
};

export default SipStreakCard;
