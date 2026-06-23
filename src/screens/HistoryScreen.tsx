/**
 * History — a central, read-only timeline of every completed lifecycle event:
 * assets sold/matured/closed, loans closed, insurance claims/closures, and goal
 * completions/archives. Filterable by category; never affects active totals.
 */
import React, { useLayoutEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';

import { Screen, SectionCard, EmptyState } from '../components/ui';
import ThemeToggle from '../components/ThemeToggle';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { historyEvents } from '../services/lifecycle';
import type { HistoryEvent } from '../models/types';
import { palette } from '../theme';
import { formatINR } from '../utils/money';
import { formatDisplayDate as fmtDate } from '../utils/date';

type Filter = 'all' | 'asset' | 'loan' | 'insurance' | 'goal';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All History' },
  { key: 'asset', label: 'Asset History' },
  { key: 'loan', label: 'Loan History' },
  { key: 'insurance', label: 'Insurance History' },
  { key: 'goal', label: 'Goals History' },
];

const META: Record<HistoryEvent['event_type'], { label: string; icon: string; tone: 'good' | 'warn' | 'bad' | 'info' }> = {
  sold: { label: 'Asset Sold', icon: 'cash-minus', tone: 'info' },
  partial_sale: { label: 'Partial Sale', icon: 'cash-minus', tone: 'info' },
  matured: { label: 'Asset Matured', icon: 'check-decagram', tone: 'good' },
  premature_closure: { label: 'Prematurely Closed', icon: 'cash-fast', tone: 'warn' },
  loan_closed: { label: 'Loan Closed', icon: 'bank-check', tone: 'good' },
  insurance_claim: { label: 'Insurance Claim', icon: 'cash-plus', tone: 'good' },
  policy_closed: { label: 'Policy Closed', icon: 'shield-off-outline', tone: 'warn' },
  goal_completed: { label: 'Goal Completed', icon: 'flag-checkered', tone: 'good' },
  goal_archived: { label: 'Goal Archived', icon: 'archive-outline', tone: 'info' },
  goal_cancelled: { label: 'Goal Cancelled', icon: 'close-circle-outline', tone: 'bad' },
};

const toneColor = (tone: string, theme: any) =>
  tone === 'good' ? palette.good : tone === 'warn' ? palette.warn : tone === 'bad' ? palette.danger : theme.colors.primary;

const HistoryScreen: React.FC = () => {
  const { userId } = useApp();
  const theme = useTheme();
  const navigation = useNavigation();
  const [filter, setFilter] = useState<Filter>('all');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <View style={{ marginRight: 4 }}><ThemeToggle color={theme.colors.onSurface} /></View>,
    });
  }, [navigation, theme]);

  const events = useData(() => historyEvents(userId!, filter === 'all' ? undefined : filter));

  return (
    <Screen>
      {/* Filter chips (horizontally scrollable) */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingRight: 8 }}
        style={{ marginBottom: 4 }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? theme.colors.primary : theme.colors.surfaceVariant,
                  borderColor: active ? theme.colors.primary : theme.colors.outlineVariant,
                },
              ]}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: active ? theme.colors.onPrimary : theme.colors.onSurface }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {events.length === 0 ? (
        <SectionCard style={{ marginTop: 8 }}>
          <EmptyState
            icon="history"
            title="Nothing here yet"
            message="As you sell assets, close loans/policies, complete goals or assets mature, they'll be archived here."
          />
        </SectionCard>
      ) : (
        <View style={{ marginTop: 8, gap: 10 }}>
          {events.map((e) => {
            const meta = META[e.event_type] ?? { label: e.event_type, icon: 'history', tone: 'info' as const };
            const c = toneColor(meta.tone, theme);
            return (
              <View key={e.id} style={[styles.row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
                <View style={[styles.icon, { backgroundColor: c + '22' }]}>
                  <MaterialCommunityIcons name={meta.icon as any} size={20} color={c} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text variant="bodyMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }} numberOfLines={1}>
                      {e.name}
                    </Text>
                    <View style={[styles.statusPill, { backgroundColor: c + '18' }]}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: c }}>{(e.status ?? meta.label).toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 1 }}>
                    {meta.label}{e.subtype ? ` · ${e.subtype}` : ''} · {fmtDate(e.event_date)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {e.amount != null ? (
                    <Text variant="bodyMedium" style={{ fontWeight: '800', color: theme.colors.onSurface }}>{formatINR(e.amount)}</Text>
                  ) : null}
                  {e.pnl != null ? (
                    <Text variant="labelSmall" style={{ fontWeight: '700', color: e.pnl >= 0 ? palette.good : palette.danger }}>
                      {e.pnl >= 0 ? '+' : ''}{formatINR(e.pnl)}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
      <View style={{ height: 24 }} />
    </Screen>
  );
};

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
});

export default HistoryScreen;
