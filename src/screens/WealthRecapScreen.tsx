/**
 * Yearly Wealth Recap — net-worth growth, biggest wealth creators, volatility
 * health and milestones, built from monthly net-worth snapshots.
 */
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme, Menu, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';

import { Screen, SectionCard, Kpi, Row, LineItem, EmptyState } from '../components/ui';
import { TrendLine } from '../components/charts';
import ThemeToggle from '../components/ThemeToggle';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { captureNetWorthSnapshot, wealthRecap, availableSnapshotYears } from '../services/wealthRecap';
import { palette } from '../theme';
import { formatINR, formatINRCompact, paiseToRupees } from '../utils/money';

const WealthRecapScreen: React.FC = () => {
  const { userId } = useApp();
  const theme = useTheme();
  const navigation = useNavigation();
  const [year, setYear] = useState(new Date().getFullYear());
  const [yearMenu, setYearMenu] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <View style={{ marginRight: 4 }}><ThemeToggle color={theme.colors.onSurface} /></View>,
    });
  }, [navigation, theme]);

  // Capture this month's snapshot, then build the recap.
  const recap = useData(() => {
    captureNetWorthSnapshot(userId!);
    return wealthRecap(userId!, year);
  });
  const years = useMemo(() => availableSnapshotYears(userId!), [userId, recap]);

  const positive = recap.growth >= 0;
  const growthColor = positive ? palette.good : palette.danger;

  const chartData = recap.series.map((s) => Math.round(paiseToRupees(s.net_worth)));
  const chartLabels = recap.series.map((s) => s.label);

  return (
    <Screen>
      {/* Year selector */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
        <Text variant="titleLarge" style={{ fontWeight: '800', color: theme.colors.onSurface }}>Wealth Recap</Text>
        <Menu
          visible={yearMenu}
          onDismiss={() => setYearMenu(false)}
          anchor={
            <Button mode="outlined" compact icon="calendar" onPress={() => setYearMenu(true)} style={{ borderRadius: theme.roundness }}>
              {String(year)}
            </Button>
          }
        >
          {years.map((y) => (
            <Menu.Item key={y} title={String(y)} onPress={() => { setYear(y); setYearMenu(false); }} />
          ))}
        </Menu>
      </View>

      {/* Headline */}
      <SectionCard>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', letterSpacing: 0.5 }}>
          NET WORTH · {year}
        </Text>
        <Text variant="displaySmall" style={{ fontWeight: '900', color: theme.colors.onSurface, marginTop: 2 }}>
          {formatINR(recap.end)}
        </Text>
        {recap.months_tracked >= 2 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <MaterialCommunityIcons name={positive ? 'arrow-up-bold' : 'arrow-down-bold'} size={16} color={growthColor} />
            <Text variant="bodyMedium" style={{ color: growthColor, fontWeight: '700' }}>
              {positive ? '+' : ''}{formatINR(recap.growth)} ({positive ? '+' : ''}{recap.growth_pct}%) this year
            </Text>
          </View>
        ) : (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            We've started tracking your net worth. Growth trends will appear here as the months roll in.
          </Text>
        )}
      </SectionCard>

      {/* Trend chart */}
      {recap.series.length >= 2 && (
        <SectionCard title="Net Worth Trend">
          <TrendLine labels={chartLabels} datasets={[{ data: chartData, color: palette.good }]} />
        </SectionCard>
      )}

      {/* Key stats */}
      {recap.months_tracked >= 2 && (
        <SectionCard title="Year in Review">
          <Row>
            <Kpi flex label="Started At" value={formatINRCompact(recap.start)} />
            <Kpi flex label="Now" value={formatINRCompact(recap.end)} subTone={positive ? 'good' : 'bad'} />
          </Row>
          <Row style={{ marginTop: 10 }}>
            <Kpi
              flex
              label="Best Month"
              value={recap.best_month ? recap.best_month.label : '—'}
              sub={recap.best_month ? `+${formatINRCompact(recap.best_month.change)}` : undefined}
              subTone="good"
            />
            <Kpi
              flex
              label="Volatility"
              value={recap.volatility_band}
              sub={`${recap.volatility}% swing`}
              subTone={recap.volatility_band === 'Low' ? 'good' : recap.volatility_band === 'High' ? 'bad' : 'muted'}
            />
          </Row>
        </SectionCard>
      )}

      {/* Milestones */}
      {recap.milestones.length > 0 && (
        <SectionCard title="Milestones Unlocked 🏆">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {recap.milestones.map((m) => (
              <View key={m} style={[styles.milestone, { backgroundColor: palette.good + '22', borderColor: palette.good }]}>
                <MaterialCommunityIcons name="trophy" size={14} color={palette.good} />
                <Text style={{ color: palette.good, fontWeight: '800', fontSize: 12 }}>Crossed {m}</Text>
              </View>
            ))}
          </View>
        </SectionCard>
      )}

      {/* Biggest wealth creators */}
      <SectionCard title="Biggest Wealth Creators">
        {recap.creators.length === 0 ? (
          <EmptyState icon="trophy-outline" title="No gains yet" message="As your investments grow, your top performers will appear here." />
        ) : (
          recap.creators.map((c, i) => (
            <View key={c.name + i} style={styles.creatorRow}>
              <View style={[styles.rank, { backgroundColor: theme.colors.surfaceVariant }]}>
                <Text style={{ fontWeight: '800', color: theme.colors.primary }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: '700', color: theme.colors.onSurface }}>{c.name}</Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{c.type_name}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="bodyMedium" style={{ fontWeight: '800', color: palette.good }}>+{formatINRCompact(c.gain)}</Text>
                <Text variant="labelSmall" style={{ color: palette.good }}>+{c.pct}%</Text>
              </View>
            </View>
          ))
        )}
      </SectionCard>

      <View style={{ height: 24 }} />
    </Screen>
  );
};

const styles = StyleSheet.create({
  milestone: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rank: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

export default WealthRecapScreen;
