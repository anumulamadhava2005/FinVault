/**
 * Per-asset deep-dive: today's gain/loss, asset return (XIRR) vs its category
 * benchmark with a comparison graph + auto insight, and a month-by-month value
 * curve that runs continuously up to — and stops at — today.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';

import { Screen, SectionCard, Kpi, Row, EmptyState } from '../../components/ui';
import { TrendLine } from '../../components/charts';
import { useApp } from '../../context/AppContext';
import { useData, useDataSafe } from '../../hooks/useData';
import { first } from '../../db';
import type { Asset } from '../../models/types';
import { getAssetMarket, refreshAssetMarket, modeledMonthly } from '../../services/assetMarket';
import { benchmarkAnalysis } from '../../services/portfolioIntelligence';
import { formatINR, formatINRCompact, pct, assetPnl, paiseToRupees } from '../../utils/money';
import { palette, chartColors } from '../../theme';

const AssetAnalysisScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, refresh } = useApp();
  const theme = useTheme();

  const { data: asset } = useDataSafe<(Asset & { type_name: string }) | null>(() =>
    first<Asset & { type_name: string }>(
      `SELECT a.*, t.name AS type_name FROM assets a JOIN asset_types t ON t.id = a.asset_type_id WHERE a.id = ?`,
      [id],
    ),
  );

  const market = useData(() => getAssetMarket(id!));
  const bench = useData(() => benchmarkAnalysis(userId!).rows.find((r) => r.id === id) ?? null);

  // Refresh this asset's live data on open.
  useEffect(() => {
    refreshAssetMarket(userId!).then(() => refresh()).catch(() => { /* offline */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!asset) {
    return (
      <Screen>
        <SectionCard style={{ marginTop: 12 }}>
          <EmptyState icon="chart-line" title="Asset not found" message="This asset may have been sold or removed." />
        </SectionCard>
      </Screen>
    );
  }

  const pnl = assetPnl(asset.current_value, asset.invested_amount);
  const pnlPct = pct(pnl, asset.invested_amount);
  const monthly = market?.monthly && market.monthly.values.length >= 2 ? market.monthly : modeledMonthly(asset);

  // Asset value line (rupees) vs a benchmark line anchored at the first shown
  // value and compounded at the category benchmark rate.
  const assetValues = monthly.values.map((v) => Math.round(paiseToRupees(v)));
  const benchAnnual = bench?.benchmark_return ?? 8;
  const monthlyRate = Math.pow(1 + benchAnnual / 100, 1 / 12) - 1;
  const base = assetValues[0] ?? 0;
  const benchValues = assetValues.map((_, i) => Math.round(base * Math.pow(1 + monthlyRate, i)));

  const dayUp = (market?.day_change_value ?? 0) >= 0;
  const dayColor = dayUp ? palette.good : palette.danger;

  // Insight derived from the comparison.
  let insight: string;
  if (!bench || !bench.matured) {
    insight = `Held for under 6 months — returns will stabilise over time. ${asset.name} is currently ${pnl >= 0 ? 'up' : 'down'} ${Math.abs(pnlPct)}% overall.`;
  } else if (bench.delta >= 0) {
    insight = `${asset.name} is beating ${bench.benchmark_name} by ${bench.delta}%/yr (${bench.annual_return}% vs ${bench.benchmark_return}%). It's a quality compounder — consider adding on dips and holding through volatility.`;
  } else {
    insight = `${asset.name} is trailing ${bench.benchmark_name} by ${Math.abs(bench.delta)}%/yr (${bench.annual_return}% vs ${bench.benchmark_return}%).` +
      (bench.missed_gains > 0 ? ` Staying in the benchmark could have earned ~${formatINRCompact(bench.missed_gains)} more — review whether to switch.` : ' Watch it for another quarter before acting.');
  }

  return (
    <Screen>
      {/* Header / value */}
      <SectionCard style={{ marginTop: 12 }}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700' }}>{asset.type_name.toUpperCase()}</Text>
        <Text variant="headlineSmall" style={{ fontWeight: '800', color: theme.colors.onSurface }} numberOfLines={2}>{asset.name}</Text>
        <Text variant="displaySmall" style={{ fontWeight: '900', color: theme.colors.onSurface, marginTop: 4 }}>{formatINR(asset.current_value)}</Text>
        <Row style={{ marginTop: 12 }}>
          <Kpi flex label="Total Return" value={formatINR(pnl)} subTone={pnl >= 0 ? 'good' : 'bad'} sub={`${pnl >= 0 ? '+' : ''}${pnlPct}%`} />
          {market ? (
            <Kpi
              flex
              label="Today"
              value={`${dayUp ? '+' : ''}${formatINRCompact(market.day_change_value)}`}
              subTone={dayUp ? 'good' : 'bad'}
              sub={`${dayUp ? '+' : ''}${market.day_change_pct}% today`}
            />
          ) : (
            <Kpi flex label="Today" value="—" sub="loading…" />
          )}
        </Row>
        {market?.modeled && (
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
            No live market feed for this asset type — values are modeled from your invested vs current value.
          </Text>
        )}
      </SectionCard>

      {/* XIRR vs benchmark */}
      <SectionCard title="Return vs Benchmark">
        <Row>
          <Kpi flex label="Asset XIRR" value={bench ? `${bench.annual_return}%` : '—'} subTone={(bench?.delta ?? 0) >= 0 ? 'good' : 'bad'} />
          <Kpi flex label={bench?.benchmark_name ?? 'Benchmark'} value={`${benchAnnual}%`} />
          <Kpi flex label="Difference" value={bench ? `${bench.delta >= 0 ? '+' : ''}${bench.delta}%` : '—'} subTone={(bench?.delta ?? 0) >= 0 ? 'good' : 'bad'} />
        </Row>
        {assetValues.length >= 2 && (
          <View style={{ marginTop: 12 }}>
            <TrendLine
              labels={monthly.labels}
              datasets={[
                { data: assetValues, color: palette.good },
                { data: benchValues, color: chartColors?.expense ?? '#9AA0A6' },
              ]}
              legend={['Your asset', 'Benchmark']}
            />
          </View>
        )}
        {/* Insight derived from the graph */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'flex-start' }}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={theme.colors.primary} style={{ marginTop: 2 }} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurface, flex: 1, lineHeight: 18 }}>{insight}</Text>
        </View>
      </SectionCard>

      {/* Month-by-month performance */}
      <SectionCard title="Month-by-Month Value">
        {assetValues.length >= 2 ? (
          <>
            <TrendLine labels={monthly.labels} datasets={[{ data: assetValues, color: theme.colors.primary }]} />
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
              {market && !market.modeled ? `Live ${market.source} · ` : ''}Value to date — the line stops at the current month.
            </Text>
          </>
        ) : (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Not enough history yet to chart this asset.</Text>
        )}
      </SectionCard>

      <View style={{ height: 24 }} />
    </Screen>
  );
};

export default AssetAnalysisScreen;
