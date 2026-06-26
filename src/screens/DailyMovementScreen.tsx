/**
 * Daily Movement — a focused 1D-return breakdown of the user's market holdings
 * (equity, mutual funds, gold). Reached by tapping the dashboard "Today" card.
 *
 * Mirrors the clean "Stock Daily Movement" pattern: a hero with today's ₹ / %
 * change, qty + current-value KPIs, then a per-holding list each showing its own
 * 1D return. Read-only; never mutates portfolio data.
 */
import React, { useLayoutEffect, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View, BackHandler } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, SectionCard } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { dailyMovement, type DailyHolding } from '../services/assetMarket';
import { palette } from '../theme';
import { formatINR } from '../utils/money';
import { timeAgo } from '../utils/date';

const qtyLabel = (h: DailyHolding): string => {
  const q = h.quantity;
  if (!q) return h.type_name;
  if (h.slug === 'equity') return `${q} ${q === 1 ? 'Share' : 'Shares'}`;
  if (h.slug === 'mutual_fund') return `${q} Units`;
  if (h.slug === 'digital_gold' || h.slug === 'physical_gold') return `${q} g`;
  return `${q}`;
};

const iconFor = (slug: string): string =>
  slug === 'equity' ? 'chart-line'
  : slug === 'mutual_fund' ? 'chart-areaspline'
  : 'gold';

const DailyMovementScreen: React.FC = () => {
  const { userId } = useApp();
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const data = useData(() => dailyMovement(userId!));

  // Hardware back press handler for Android
  useEffect(() => {
    const onBackPress = () => {
      if (navigation.canGoBack()) {
        router.back();
      } else {
        router.replace('/' as any);
      }
      return true; // prevent default behavior
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [navigation, router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Daily Movement',
      headerLeft: () => (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/' as any))} hitSlop={12} style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.onSurface} />
        </Pressable>
      ),
    });
  }, [navigation, theme, router]);

  const up = data.day_change >= 0;
  const c = up ? palette.good : palette.danger;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16) + 24 }}>
        {/* Hero — 1D return */}
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
          1D Return of Holdings · {data.have_data ? timeAgo(data.as_of) : 'awaiting quotes'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
          <Text style={{ fontSize: 40, fontWeight: '900', color: theme.colors.onSurface, letterSpacing: -1, fontVariant: ['tabular-nums'] }}>
            {up ? '' : '−'}{formatINR(Math.abs(data.day_change))}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6 }}>
            <MaterialCommunityIcons name={up ? 'triangle' : 'triangle-down'} size={13} color={c} />
            <Text style={{ color: c, fontWeight: '800', fontSize: 16 }}>{Math.abs(data.day_change_pct)}%</Text>
          </View>
        </View>

        {/* Qty + current value */}
        <View style={{ flexDirection: 'row', marginTop: 20, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Holdings</Text>
            <Text variant="titleMedium" style={{ fontWeight: '800', color: theme.colors.onSurface, marginTop: 2 }}>
              {data.count} {data.count === 1 ? 'asset' : 'assets'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Current Value</Text>
            <Text variant="titleMedium" style={{ fontWeight: '800', color: theme.colors.onSurface, marginTop: 2, fontVariant: ['tabular-nums'] }}>
              {formatINR(data.total_value)}
            </Text>
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: theme.colors.outlineVariant, marginVertical: 16 }} />

        {data.count === 0 ? (
          <SectionCard>
            <EmptyState
              icon="chart-line"
              title="No market holdings"
              message="Add stocks, mutual funds or gold to track their daily movement here."
            />
          </SectionCard>
        ) : (
          <>
            {/* List header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <Text variant="titleMedium" style={{ fontWeight: '800', color: theme.colors.onSurface }}>
                {data.count} {data.count === 1 ? 'Holding' : 'Holdings'}
              </Text>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>1D Return</Text>
            </View>

            {!data.have_data && (
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                Fetching live prices… today's movement appears once quotes load.
              </Text>
            )}

            {data.holdings.map((h) => {
              const hUp = h.change >= 0;
              const hc = hUp ? palette.good : palette.danger;
              return (
                <Pressable
                  key={h.id}
                  onPress={() => router.push(`/assets/${h.id}/analysis` as any)}
                  style={[styles.row, { borderTopColor: theme.colors.outlineVariant }]}
                >
                  <View style={[styles.icon, { backgroundColor: theme.colors.surfaceVariant }]}>
                    <MaterialCommunityIcons name={iconFor(h.slug) as any} size={20} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                      {h.name}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 1 }}>
                      {qtyLabel(h)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="bodyMedium" style={{ fontWeight: '800', color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}>
                      {hUp ? '' : '−'}{formatINR(Math.abs(h.change))}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 }}>
                      <MaterialCommunityIcons name={hUp ? 'triangle' : 'triangle-down'} size={9} color={hc} />
                      <Text variant="labelSmall" style={{ color: hc, fontWeight: '700' }}>{Math.abs(h.pct)}%</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}

        {/* Footer note */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 24, alignItems: 'flex-start' }}>
          <MaterialCommunityIcons name="information-outline" size={15} color={theme.colors.onSurfaceVariant} style={{ marginTop: 1 }} />
          <Text variant="labelSmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant, lineHeight: 16 }}>
            Returns update through the trading day; recently added holdings may take a day to reflect.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

export default DailyMovementScreen;
