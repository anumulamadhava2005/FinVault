import React from 'react';
import { View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import {
  financialHealth,
  goalsProgress,
  incomeExpenseSeries,
  netWorth,
  portfolioSummary,
} from '../services/finance';
import { Screen, SectionCard, Kpi, Row, LineItem, ProgressBar } from '../components/ui';
import { DistributionPie, TrendLine } from '../components/charts';
import { chartColors, palette, statusColor } from '../theme';
import { formatINR, scoreColor } from '../utils/money';

const DashboardScreen: React.FC = () => {
  const { userId } = useApp();
  const theme = useTheme();
  const nw = useData(() => netWorth(userId));
  const pf = useData(() => portfolioSummary(userId));
  const health = useData(() => financialHealth(userId));
  const ie = useData(() => incomeExpenseSeries(userId, 6));
  const goals = useData(() => goalsProgress(userId));

  const healthTone = health.score >= 60 ? 'good' : health.score >= 40 ? 'warn' : 'bad';

  return (
    <Screen>
      <SectionCard title="Net Worth">
        <Text variant="headlineMedium" style={{ fontWeight: '800', color: nw.net_worth >= 0 ? palette.good : palette.danger }}>
          {formatINR(nw.net_worth)}
        </Text>
        <Row style={{ marginTop: 12 }}>
          <Kpi label="Total Assets" value={formatINR(nw.total_assets)} subTone="good" sub="invested + growth" />
          <Kpi label="Liabilities" value={formatINR(nw.total_liabilities)} subTone="bad" sub="outstanding debt" />
        </Row>
      </SectionCard>

      <Row>
        <Kpi label="Portfolio" value={formatINR(pf.total_value)} sub={`${pf.pnl_pct}% P&L`} subTone={pf.total_pnl >= 0 ? 'good' : 'bad'} />
        <Kpi label="Income (mo)" value={formatINR(health.monthly_income)} />
        <Kpi label="Spent (mo)" value={formatINR(health.monthly_expenses)} />
      </Row>

      <SectionCard title="Financial Health">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Text variant="displaySmall" style={{ fontWeight: '900', color: statusColor(healthTone) }}>
            {health.score}
          </Text>
          <View style={{ flex: 1 }}>
            <Text variant="titleSmall" style={{ fontWeight: '700' }}>
              {health.rating}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Savings rate {health.savings_rate}%
            </Text>
            <ProgressBar pct={health.score} color={statusColor(healthTone)} />
          </View>
        </View>
        {health.insights.map((tip, i) => (
          <Text key={i} variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
            • {tip}
          </Text>
        ))}
      </SectionCard>

      <SectionCard title="Income vs Expense (6 mo)">
        <TrendLine
          labels={ie.labels}
          legend={['Income', 'Expense']}
          datasets={[
            { data: ie.income.map((v) => v / 100), color: chartColors.income },
            { data: ie.expenses.map((v) => v / 100), color: chartColors.expense },
          ]}
        />
      </SectionCard>

      {pf.allocation.length > 0 && (
        <SectionCard title="Asset Allocation">
          <DistributionPie data={pf.allocation.map((a, i) => ({ name: a.type, value: a.value / 100, color: ['#4A7C6F', '#7FB5A8', '#D4956A', '#2D3142', '#F0B429', '#52A77E'][i % 6] }))} />
        </SectionCard>
      )}

      <SectionCard title="Goals" right={<Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{goals.on_track}/{goals.count} on track</Text>}>
        {goals.goals.map((g) => (
          <View key={g.id} style={{ marginBottom: 10 }}>
            <LineItem label={g.name} value={`${g.pct}%`} />
            <ProgressBar pct={g.pct} color={statusColor(scoreColor(g.pct))} markerPct={g.expected_pct} />
          </View>
        ))}
      </SectionCard>
    </Screen>
  );
};

export default DashboardScreen;
