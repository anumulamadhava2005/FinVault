/**
 * Portfolio Intelligence hub — the "analysis engine" surface.
 * Health score, daily insights feed, returns vs benchmark, allocation & risk,
 * diversification/concentration, hidden costs, hold/exit calls and discipline.
 */
import React, { useLayoutEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';

import { Screen, SectionCard, Kpi, Row, ProgressBar, LineItem, EmptyState } from '../components/ui';
import NotificationBell from '../components/NotificationBell';
import ThemeToggle from '../components/ThemeToggle';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { first } from '../db';
import {
  portfolioHealth,
  dailyInsights,
  portfolioReturns,
  benchmarkAnalysis,
  costAnalysis,
  diversification,
  riskExposure,
  disciplineAnalysis,
  holdExitSuggestions,
  type Insight,
  type HoldExit,
} from '../services/portfolioIntelligence';
import { getMarketSnapshot } from '../services/marketFeeds';
import { palette } from '../theme';
import { formatINR, formatINRCompact } from '../utils/money';

const toneColor = (tone: string, theme: any) =>
  tone === 'good' ? palette.good : tone === 'warn' ? palette.warn : tone === 'bad' ? palette.danger : theme.colors.primary;

const ACTION_META: Record<HoldExit['action'], { label: string; icon: string }> = {
  hold: { label: 'HOLD', icon: 'check-circle-outline' },
  add: { label: 'ADD', icon: 'plus-circle-outline' },
  review: { label: 'REVIEW', icon: 'eye-outline' },
  trim: { label: 'TRIM', icon: 'content-cut' },
  exit: { label: 'EXIT', icon: 'exit-run' },
};

const InsightsScreen: React.FC = () => {
  const { userId } = useApp();
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();

  const profile = useData(
    () => first<{ risk_profile: string }>('SELECT risk_profile FROM users WHERE id = ?', [userId!])?.risk_profile || 'moderate',
  );

  const health = useData(() => portfolioHealth(userId!, profile));
  const insights = useData(() => dailyInsights(userId!, profile));
  const returns = useData(() => portfolioReturns(userId!));
  const bench = useData(() => benchmarkAnalysis(userId!));
  const cost = useData(() => costAnalysis(userId!));
  const div = useData(() => diversification(userId!));
  const risk = useData(() => riskExposure(userId!, profile));
  const disc = useData(() => disciplineAnalysis(userId!));
  const suggestions = useData(() => holdExitSuggestions(userId!, profile));
  const market = useData(() => getMarketSnapshot());

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
          <ThemeToggle color={theme.colors.onSurface} />
          <NotificationBell color={theme.colors.onSurface} kinds={['asset_gain', 'asset_loss', 'stale_price', 'sip_due']} />
        </View>
      ),
    });
  }, [navigation, theme]);

  if (!returns.holdings.length) {
    return (
      <Screen>
        <SectionCard style={{ marginTop: 12 }}>
          <EmptyState
            icon="chart-box-outline"
            title="No portfolio yet"
            message="Add your mutual funds, stocks, FDs and gold to unlock personalised portfolio intelligence."
          />
        </SectionCard>
      </Screen>
    );
  }

  const healthColor = health.score >= 70 ? palette.good : health.score >= 55 ? palette.warn : palette.danger;
  const subLabels: Record<string, string> = {
    diversification: 'Diversification',
    risk: 'Risk Fit',
    cost: 'Cost',
    performance: 'Performance',
    discipline: 'Discipline',
  };

  return (
    <Screen>
      {/* ── Health Score hero ── */}
      <SectionCard style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <View style={[styles.scoreCircle, { borderColor: healthColor }]}>
            <Text style={{ fontSize: 30, fontWeight: '900', color: healthColor }}>{health.score}</Text>
            <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant, marginTop: -2 }}>/ 100</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', letterSpacing: 0.5 }}>
              PORTFOLIO HEALTH
            </Text>
            <Text variant="headlineSmall" style={{ fontWeight: '800', color: healthColor }}>
              Grade {health.grade} · {health.label}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {health.underperformer_count > 0
                ? `${health.underperformer_count} holding(s) need attention.`
                : 'All holdings are tracking their benchmarks.'}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 16, gap: 10 }}>
          {Object.entries(health.subscores).map(([k, v]) => (
            <View key={k}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{subLabels[k] ?? k}</Text>
                <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>{v}</Text>
              </View>
              <ProgressBar pct={v as number} color={(v as number) >= 70 ? palette.good : (v as number) >= 50 ? palette.warn : palette.danger} height={6} />
            </View>
          ))}
        </View>
      </SectionCard>

      {/* ── Live market strip ── */}
      {market && market.indices.length > 0 && (
        <SectionCard title="Markets">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 }}>
            {market.indices.map((idx) => {
              const up = idx.changePct >= 0;
              const c = up ? palette.good : palette.danger;
              return (
                <View key={idx.symbol} style={{ width: '50%' }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{idx.label}</Text>
                  <Text variant="bodyMedium" style={{ fontWeight: '800', color: theme.colors.onSurface }}>
                    {idx.unit === '₹/g' || idx.unit === '₹' ? '₹' : ''}{idx.price.toLocaleString('en-IN')}
                  </Text>
                  <Text variant="labelSmall" style={{ color: c, fontWeight: '700' }}>{up ? '+' : ''}{idx.changePct}% · {idx.return1y >= 0 ? '+' : ''}{idx.return1y}% 1y</Text>
                </View>
              );
            })}
          </View>
        </SectionCard>
      )}

      {/* ── Daily insights feed ── */}
      <SectionCard title="Daily Insights">
        <View style={{ gap: 10 }}>
          {insights.map((it: Insight) => {
            const c = toneColor(it.tone, theme);
            return (
              <View key={it.id} style={[styles.insightRow, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surfaceVariant + '40' }]}>
                <View style={[styles.insightIcon, { backgroundColor: c + '22' }]}>
                  <MaterialCommunityIcons name={it.icon as any} size={20} color={c} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>{it.title}</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>{it.body}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </SectionCard>

      {/* ── Returns vs benchmark ── */}
      <SectionCard title="How Did Your Portfolio Perform?">
        {returns.portfolio_xirr == null ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Hold investments for a few months to compute money-weighted returns (XIRR) and compare against their benchmarks.
          </Text>
        ) : (() => {
          const pX = returns.portfolio_xirr;
          const bX = bench.blended_benchmark;
          const lagging = pX < bX;
          const maxVal = Math.max(pX, bX, 1);
          const H = 110;
          const barH = (v: number) => Math.max(Math.round((Math.max(v, 0) / maxVal) * H), 3);
          const pColor = lagging ? palette.danger : palette.good;
          return (
            <>
              {/* XIRR bar comparison */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 40, height: H + 40, paddingTop: 18 }}>
                {[
                  { label: 'Portfolio XIRR', value: pX, color: pColor },
                  { label: 'Benchmark XIRR', value: bX, color: theme.colors.onSurfaceVariant },
                ].map((b) => (
                  <View key={b.label} style={{ alignItems: 'center', width: 96 }}>
                    <Text variant="titleMedium" style={{ fontWeight: '800', color: theme.colors.onSurface, marginBottom: 4 }}>
                      {b.value}%
                    </Text>
                    <View style={{ width: 64, height: barH(b.value), borderRadius: 6, backgroundColor: b.color }} />
                  </View>
                ))}
              </View>
              {/* Legend */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: pColor }} />
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Portfolio XIRR</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: theme.colors.onSurfaceVariant }} />
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Benchmark XIRR</Text>
                </View>
              </View>

              {/* Callout */}
              <View style={{
                flexDirection: 'row',
                gap: 10,
                alignItems: 'flex-start',
                marginTop: 16,
                padding: 12,
                borderRadius: theme.roundness,
                borderWidth: 1,
                backgroundColor: (lagging ? palette.danger : palette.good) + '14',
                borderColor: (lagging ? palette.danger : palette.good) + '40',
              }}>
                <MaterialCommunityIcons
                  name={lagging ? 'alert-circle' : 'check-circle'}
                  size={18}
                  color={lagging ? palette.danger : palette.good}
                  style={{ marginTop: 1 }}
                />
                <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurface, fontWeight: '600', lineHeight: 18 }}>
                  {lagging ? (
                    <>
                      You have missed gains of{' '}
                      <Text style={{ color: palette.danger, fontWeight: '800' }}>{formatINR(bench.total_missed_gains)}</Text>
                      {' '}— your portfolio is underperforming its benchmark by {(bX - pX).toFixed(1)}%.
                    </>
                  ) : (
                    <>Your portfolio is beating its benchmark by{' '}
                      <Text style={{ color: palette.good, fontWeight: '800' }}>{(pX - bX).toFixed(1)}%</Text>. Keep it up.
                    </>
                  )}
                </Text>
              </View>
            </>
          );
        })()}

        {bench.underperformers.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', marginBottom: 6 }}>UNDERPERFORMERS</Text>
            {bench.underperformers.slice(0, 5).map((r) => (
              <View key={r.id} style={styles.benchRow}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text variant="bodySmall" numberOfLines={1} style={{ fontWeight: '600', color: theme.colors.onSurface }}>{r.name}</Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>vs {r.benchmark_name}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="bodySmall" style={{ fontWeight: '700', color: palette.danger }}>{r.annual_return}% vs {r.benchmark_return}%</Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>−{formatINRCompact(r.missed_gains)} missed</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      {/* ── Allocation & risk ── */}
      <SectionCard title="Allocation & Risk">
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>{risk.recommendation}</Text>
        {risk.bars.map((b) => (
          <View key={b.label} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>{b.label}</Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{b.actual}% · ideal {b.ideal}%</Text>
            </View>
            <ProgressBar pct={b.actual} markerPct={b.ideal} color={theme.colors.primary} height={8} />
          </View>
        ))}
      </SectionCard>

      {/* ── Diversification ── */}
      <SectionCard title="Diversification & Concentration">
        <Row>
          <Kpi flex label="Diversification" value={`${div.score}/100`} subTone={div.score >= 70 ? 'good' : div.score >= 50 ? 'muted' : 'bad'} />
          <Kpi flex label="Top Holding" value={`${div.top_holding_pct}%`} sub={div.top_holding} subTone={div.concentrated ? 'bad' : 'muted'} />
          <Kpi flex label="Holdings" value={String(div.holdings_count)} sub={`${div.fund_count} funds/stocks`} />
        </Row>
        {(div.concentrated || div.over_diversified) && (
          <View style={{ marginTop: 10, gap: 4 }}>
            {div.concentrated && (
              <Text variant="bodySmall" style={{ color: palette.warn }}>⚠ {div.top_holding} is {div.top_holding_pct}% of your portfolio — consider trimming.</Text>
            )}
            {div.over_diversified && (
              <Text variant="bodySmall" style={{ color: palette.warn }}>⚠ {div.fund_count} funds/stocks may be over-diversified — consolidating improves tracking.</Text>
            )}
          </View>
        )}
        <View style={{ marginTop: 12 }}>
          {div.classes.map((c) => (
            <LineItem key={c.cls} label={c.label} value={`${c.pct}% · ${formatINR(c.value)}`} />
          ))}
        </View>
      </SectionCard>

      {/* ── Hidden costs ── */}
      <SectionCard title="Hidden Costs">
        <Row>
          <Kpi flex label="Annual Fees (est.)" value={formatINRCompact(cost.total_annual_cost)} subTone={cost.total_annual_cost > 0 ? 'bad' : 'good'} />
          <Kpi flex label="You Could Save" value={formatINRCompact(cost.potential_savings)} subTone={cost.potential_savings > 0 ? 'good' : 'muted'} sub="via direct plans" />
        </Row>
        {cost.rows.slice(0, 5).map((r) => (
          <View key={r.id} style={styles.benchRow}>
            <Text variant="bodySmall" numberOfLines={1} style={{ flex: 1, color: theme.colors.onSurface }}>{r.name}</Text>
            <Text variant="bodySmall" style={{ fontWeight: '700', color: r.high ? palette.danger : theme.colors.onSurfaceVariant }}>
              {r.ter}% · {formatINRCompact(r.annual_cost)}/yr
            </Text>
          </View>
        ))}
        {cost.rows.length === 0 && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>No fee-bearing funds detected. Add an expense ratio to a fund's details to track its cost.</Text>
        )}
      </SectionCard>

      {/* ── Hold / Exit suggestions ── */}
      {suggestions.length > 0 && (
        <SectionCard title="Hold / Exit Suggestions">
          <View style={{ gap: 10 }}>
            {suggestions.slice(0, 8).map((s) => {
              const c = toneColor(s.tone, theme);
              const meta = ACTION_META[s.action];
              return (
                <View key={s.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <View style={[styles.actionPill, { backgroundColor: c + '22' }]}>
                    <MaterialCommunityIcons name={meta.icon as any} size={13} color={c} />
                    <Text style={{ fontSize: 10, fontWeight: '800', color: c }}>{meta.label}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodySmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>{s.name}</Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 1 }}>{s.reason}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </SectionCard>
      )}

      {/* ── Discipline ── */}
      <SectionCard title="Investment Discipline">
        <Row>
          <Kpi flex label="Discipline Score" value={`${disc.score}/100`} subTone={disc.score >= 70 ? 'good' : 'muted'} />
          <Kpi flex label="Active SIPs" value={String(disc.active_sips)} />
          <Kpi flex label="Monthly SIP" value={formatINRCompact(disc.monthly_sip)} />
        </Row>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 10 }}>{disc.guidance}</Text>
      </SectionCard>

      {/* ── Explore more ── */}
      <SectionCard title="Plan Ahead">
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
          Go deeper: project your retirement, review your year, and read news that moves your holdings.
        </Text>
        <Button mode="contained" icon="island" onPress={() => router.push('/retirement' as any)} style={{ borderRadius: theme.roundness, marginBottom: 8 }}>
          Retirement Calculator
        </Button>
        <Button mode="outlined" icon="calendar-star" onPress={() => router.push('/recap' as any)} style={{ borderRadius: theme.roundness, marginBottom: 8 }}>
          Yearly Wealth Recap
        </Button>
        <Button mode="outlined" icon="newspaper-variant-outline" onPress={() => router.push('/feed' as any)} style={{ borderRadius: theme.roundness }}>
          Wealth Feed
        </Button>
      </SectionCard>

      <View style={{ height: 24 }} />
    </Screen>
  );
};

const styles = StyleSheet.create({
  scoreCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightRow: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'flex-start' },
  insightIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  benchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: 8 },
  actionPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, minWidth: 64, justifyContent: 'center' },
});

export default InsightsScreen;
