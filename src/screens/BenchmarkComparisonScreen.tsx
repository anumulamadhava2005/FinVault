import React, { useState, useLayoutEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, useTheme, SegmentedButtons, Card, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';

import { Screen, SectionCard, Kpi, Row } from '../components/ui';
import { TrendLine } from '../components/charts';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { getBenchmarkComparison } from '../services/benchmarkService';
import { portfolioReturns } from '../services/portfolioIntelligence';
import { palette } from '../theme';
import { formatINR, formatINRCompact } from '../utils/money';

const BenchmarkComparisonScreen: React.FC = () => {
  const { userId } = useApp();
  const theme = useTheme();
  const navigation = useNavigation();

  // Selector States
  const [benchmarkType, setBenchmarkType] = useState<'nifty' | 'sensex' | 'blended'>('nifty');
  const [scope, setScope] = useState<'overall' | 'equity'>('overall');
  const [timeframe, setTimeframe] = useState<'1Y' | '3Y' | 'All'>('All');

  // Load comparison data reactively when benchmarkType changes
  const comp = useData(() => getBenchmarkComparison(userId!, benchmarkType), [userId, benchmarkType]);
  
  // Load raw returns for holding-level analysis
  const returns = useData(() => portfolioReturns(userId!), [userId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Benchmark Comparison',
      headerTitleStyle: { fontWeight: '700' },
    });
  }, [navigation]);

  // Find active period data
  const activePeriod = comp.periods.find((p) => p.period === timeframe) || comp.periods[2];
  
  const yourReturn = scope === 'overall' ? activePeriod.portfolio_return : activePeriod.equity_return;
  const indexReturn = activePeriod.benchmark_return;
  const alpha = yourReturn != null ? Number((yourReturn - indexReturn).toFixed(2)) : null;

  const isOutperforming = alpha != null && alpha >= 0;
  const alphaColor = isOutperforming ? palette.good : palette.danger;
  const alphaTone = isOutperforming ? 'good' : 'bad';

  // Find all-time values for the wealth growth chart
  const allTimePeriod = comp.periods.find((p) => p.period === 'All') || comp.periods[2];
  const portfolioAll = allTimePeriod.portfolio_return;
  const benchmarkAll = allTimePeriod.benchmark_return;

  // Filter holdings based on scope (Equity-only vs All)
  const displayHoldings = returns.holdings.filter((h) => {
    if (scope === 'overall') return true;
    return h.slug === 'equity' || h.slug === 'mutual_fund' || h.slug === 'nps';
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        
        {/* 1. Selector Section */}
        <SectionCard style={{ marginTop: 12 }}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 }}>
            SELECT BENCHMARK INDEX
          </Text>
          <SegmentedButtons
            value={benchmarkType}
            onValueChange={(val) => setBenchmarkType(val as any)}
            buttons={[
              { value: 'nifty', label: 'Nifty 50', icon: 'trending-up' },
              { value: 'sensex', label: 'Sensex', icon: 'chart-line' },
              { value: 'blended', label: 'Blended', icon: 'scale-balance' },
            ]}
            style={{ marginBottom: 16 }}
          />

          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', marginBottom: 6, marginTop: 4, letterSpacing: 0.5 }}>
            PORTFOLIO SCOPE
          </Text>
          <SegmentedButtons
            value={scope}
            onValueChange={(val) => setScope(val as any)}
            buttons={[
              { value: 'overall', label: 'Overall' },
              { value: 'equity', label: 'Equity Only' },
            ]}
            style={{ marginBottom: 16 }}
          />

          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', marginBottom: 6, letterSpacing: 0.5 }}>
            TIME HORIZON
          </Text>
          <SegmentedButtons
            value={timeframe}
            onValueChange={(val) => setTimeframe(val as any)}
            buttons={[
              { value: '1Y', label: '1 Year' },
              { value: '3Y', label: '3 Years' },
              { value: 'All', label: 'All Time' },
            ]}
          />
        </SectionCard>

        {/* 2. Scoreboard Row */}
        <Row>
          <Kpi
            flex
            label={scope === 'overall' ? 'Portfolio Return' : 'Equity Return'}
            value={yourReturn != null ? `${yourReturn}%` : '—'}
            sub="Money-Weighted XIRR"
            subTone="muted"
          />
          <Kpi
            flex
            label={`${comp.benchmark_name} Return`}
            value={`${indexReturn}%`}
            sub="Benchmark Return"
            subTone="muted"
          />
        </Row>
        
        <Row style={{ marginTop: 8 }}>
          <Kpi
            flex
            label="Generated Alpha"
            value={alpha != null ? `${alpha > 0 ? '+' : ''}${alpha}%` : '—'}
            sub={isOutperforming ? 'Outperforming the market' : 'Trailing the market'}
            subTone={alphaTone}
          />
        </Row>

        {/* 3. Personalized Insight Callout */}
        <View style={{
          flexDirection: 'row',
          gap: 10,
          alignItems: 'flex-start',
          marginHorizontal: 16,
          marginTop: 12,
          padding: 14,
          borderRadius: theme.roundness,
          borderWidth: 1,
          backgroundColor: (isOutperforming ? palette.good : palette.danger) + '12',
          borderColor: (isOutperforming ? palette.good : palette.danger) + '30',
        }}>
          <MaterialCommunityIcons
            name={isOutperforming ? 'trophy-outline' : 'alert-decagram-outline'}
            size={20}
            color={alphaColor}
            style={{ marginTop: 1 }}
          />
          <View style={{ flex: 1 }}>
            <Text variant="titleSmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
              {isOutperforming ? 'Beating the Market' : 'Underperformance Detected'}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, lineHeight: 16 }}>
              {isOutperforming ? (
                <>
                  Your {scope === 'overall' ? 'overall portfolio' : 'equity investments'} generated{' '}
                  <Text style={{ color: palette.good, fontWeight: '700' }}>{alpha}% alpha</Text> compared to{' '}
                  {comp.benchmark_name} over the {activePeriod.period_label} horizon. Your active asset selection is adding significant value.
                </>
              ) : (
                <>
                  Your {scope === 'overall' ? 'overall portfolio' : 'equity investments'} trailed{' '}
                  {comp.benchmark_name} by{' '}
                  <Text style={{ color: palette.danger, fontWeight: '700' }}>{Math.abs(alpha || 0)}%</Text> over the{' '}
                  {activePeriod.period_label} horizon. Review underperforming mutual funds or individual stocks in your portfolio to close this gap.
                </>
              )}
            </Text>
          </View>
        </View>

        {/* 4. Comparison Bar Chart */}
        <SectionCard title="Returns Horizon Comparison" style={{ marginTop: 12 }}>
          <View style={{ gap: 14, marginTop: 4 }}>
            {comp.periods.map((p) => {
              const pVal = scope === 'overall' ? p.portfolio_return : p.equity_return;
              const bVal = p.benchmark_return;
              if (pVal == null) return null;

              const valMax = Math.max(pVal, bVal, 1);
              const pctWidth = (v: number) => `${Math.max(5, Math.min(100, (v / valMax) * 100))}%`;
              const isBeating = pVal >= bVal;
              const pBarColor = isBeating ? palette.good : palette.danger;

              return (
                <View key={p.period} style={{ gap: 6 }}>
                  <Text variant="labelMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                    {p.period_label}
                  </Text>
                  
                  {/* Portfolio Bar */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1, height: 20, backgroundColor: theme.colors.surfaceVariant + '30', borderRadius: 4, overflow: 'hidden' }}>
                      <View style={{ width: pctWidth(pVal) as any, height: '100%', backgroundColor: pBarColor, justifyContent: 'center', paddingLeft: 8 }}>
                        <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>{pVal}%</Text>
                      </View>
                    </View>
                    <Text variant="bodySmall" style={{ width: 60, color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>Portfolio</Text>
                  </View>

                  {/* Benchmark Bar */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1, height: 20, backgroundColor: theme.colors.surfaceVariant + '30', borderRadius: 4, overflow: 'hidden' }}>
                      <View style={{ width: pctWidth(bVal) as any, height: '100%', backgroundColor: theme.colors.onSurfaceVariant, justifyContent: 'center', paddingLeft: 8 }}>
                        <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}>{bVal}%</Text>
                      </View>
                    </View>
                    <Text variant="bodySmall" style={{ width: 60, color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>Index</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </SectionCard>

        {/* 5. Wealth Growth Chart */}
        <SectionCard title="Wealth Growth: ₹1,00,000 Over 5 Years" style={{ marginTop: 12 }}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
            Compounded growth projection based on the All-Time annualized returns ({portfolioAll || 12.0}% vs. {benchmarkAll}%).
          </Text>
          <TrendLine
            labels={comp.growth_chart.map((pt) => pt.label)}
            legend={[
              scope === 'overall' ? 'Portfolio' : 'Equity',
              comp.benchmark_type === 'blended' ? 'Blended Bench' : comp.benchmark_name
            ]}
            datasets={[
              { data: comp.growth_chart.map((pt) => pt.portfolio_val), color: alphaColor },
              { data: comp.growth_chart.map((pt) => pt.benchmark_val), color: theme.colors.onSurfaceVariant },
            ]}
          />
        </SectionCard>

        {/* 6. Holdings Breakdown */}
        <SectionCard title="Holding-level Performance & Alpha" style={{ marginTop: 12 }}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
            Individual asset performance vs. the current benchmark return ({indexReturn}% over the selected {activePeriod.period_label} horizon).
          </Text>
          <View style={{ gap: 12 }}>
            {displayHoldings.map((h, i) => {
              const hReturn = h.annual_return;
              const hAlpha = Number((hReturn - indexReturn).toFixed(1));
              const beatsIndex = hAlpha >= 0;
              const hAlphaColor = beatsIndex ? palette.good : palette.danger;

              return (
                <View key={h.id}>
                  {i > 0 && <Divider style={{ marginVertical: 8, opacity: 0.5 }} />}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                        {h.name}
                      </Text>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {h.type_name} · Held for {h.years} yr{h.years !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '800', color: theme.colors.onSurface }}>
                        {hReturn}% XIRR
                      </Text>
                      <Text variant="labelSmall" style={{ fontWeight: '700', color: hAlphaColor }}>
                        Alpha: {hAlpha > 0 ? '+' : ''}{hAlpha}%
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
            {displayHoldings.length === 0 && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingVertical: 12 }}>
                No active holdings matching the selected scope.
              </Text>
            )}
          </View>
        </SectionCard>

      </ScrollView>
    </Screen>
  );
};

export default BenchmarkComparisonScreen;
