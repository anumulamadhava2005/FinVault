import React from 'react';
import { View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { SectionCard, ProgressBar } from './ui';
import type { ForecastRow } from '../services/finance';
import { formatINR } from '../utils/money';
import { palette } from '../theme';

interface Props {
  data: ForecastRow[];
}

export const SpendingForecastCard: React.FC<Props> = ({ data }) => {
  const theme = useTheme();
  if (!data || data.length === 0) return null;

  const overBudget = data.filter((r) => r.status === 'over_budget');

  return (
    <SectionCard
      title="Month-End Forecast"
      right={
        overBudget.length > 0 ? (
          <Text variant="labelSmall" style={{ color: palette.danger, fontWeight: '700' }}>
            {overBudget.length} over budget
          </Text>
        ) : (
          <Text variant="labelSmall" style={{ color: palette.good, fontWeight: '700' }}>On track</Text>
        )
      }
    >
      <View style={{ gap: 12, marginTop: 4 }}>
        {data.slice(0, 5).map((row) => {
          const projPct = row.budget > 0 ? Math.min((row.projected_total / row.budget) * 100, 150) : 100;
          const barColor =
            row.status === 'over_budget' ? palette.danger :
            row.status === 'on_track' ? palette.good : '#F0B429';
          return (
            <View key={row.category}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                  {row.category}
                </Text>
                <Text variant="bodySmall" style={{ color: barColor, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {formatINR(row.projected_total)}
                  {row.budget > 0 ? ` / ${formatINR(row.budget)}` : ''}
                </Text>
              </View>
              <ProgressBar pct={projPct} color={barColor} />
              <Text variant="bodySmall" style={{ fontSize: 10, color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                Spent {formatINR(row.spent_so_far)} in {row.days_elapsed}d — projecting {formatINR(row.projected_total)} by month-end
              </Text>
            </View>
          );
        })}
      </View>
    </SectionCard>
  );
};

export default SpendingForecastCard;
