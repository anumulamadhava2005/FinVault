/**
 * Wealth Feed — live market snapshot (Nifty / Sensex / Gold / USD-INR) plus a
 * personalised news feed from public Indian-finance RSS sources. News items
 * that mention one of your holdings are surfaced first and tagged.
 */
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { View, StyleSheet, Pressable, Linking, RefreshControl, ScrollView } from 'react-native';
import { Text, useTheme, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';

import { Screen, SectionCard } from '../components/ui';
import ThemeToggle from '../components/ThemeToggle';
import { useApp } from '../context/AppContext';
import { all } from '../db';
import {
  refreshMarketData,
  getMarketSnapshot,
  fetchWealthFeed,
  getCachedFeed,
  type MarketSnapshot,
  type FeedItem,
} from '../services/marketFeeds';
import { palette } from '../theme';
import { timeAgo } from '../utils/date';

const WealthFeedScreen: React.FC = () => {
  const { userId } = useApp();
  const theme = useTheme();
  const navigation = useNavigation();

  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(getMarketSnapshot());
  const [feed, setFeed] = useState<FeedItem[]>(getCachedFeed());
  const [loading, setLoading] = useState(feed.length === 0);
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => <View style={{ marginRight: 4 }}><ThemeToggle color={theme.colors.onSurface} /></View>,
    });
  }, [navigation, theme]);

  // Keywords from the user's holdings (names + tickers) for personalisation.
  const keywords = React.useMemo(() => {
    const rows = all<{ name: string; ticker: string | null }>('SELECT name, ticker FROM assets WHERE user_id = ?', [userId!]);
    const set = new Set<string>();
    for (const r of rows) {
      for (const w of (r.name || '').split(/\s+/)) {
        const c = w.replace(/[^A-Za-z]/g, '');
        if (c.length >= 4) set.add(c.toLowerCase());
      }
      if (r.ticker) set.add(r.ticker.replace(/\..*$/, '').toLowerCase());
    }
    // Drop generic words that would over-match.
    ['fund', 'gold', 'bank', 'india', 'index', 'bond', 'plan', 'direct', 'regular', 'growth', 'large', 'small', 'midcap'].forEach((g) => set.delete(g));
    return [...set];
  }, [userId]);

  const isRelevant = (it: FeedItem): boolean => {
    const hay = `${it.title} ${it.summary}`.toLowerCase();
    return keywords.some((k) => hay.includes(k));
  };

  const load = useCallback(async () => {
    const [snap, items] = await Promise.all([refreshMarketData(), fetchWealthFeed()]);
    if (snap) setSnapshot(snap);
    if (items.length) setFeed(items);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  // Personalised first.
  const sorted = [...feed].sort((a, b) => Number(isRelevant(b)) - Number(isRelevant(a)));
  const relevantCount = feed.filter(isRelevant).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 18, paddingBottom: 110, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      {/* Market snapshot */}
      <SectionCard title="Markets Today">
        {snapshot ? (
          <View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
              {snapshot.indices.map((idx) => {
                const up = idx.changePct >= 0;
                const c = up ? palette.good : palette.danger;
                return (
                  <View key={idx.symbol} style={{ width: '50%', paddingRight: 8 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>{idx.label}</Text>
                    <Text variant="titleMedium" style={{ fontWeight: '800', color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}>
                      {idx.unit === '₹/g' || idx.unit === '₹' ? '₹' : ''}{idx.price.toLocaleString('en-IN')}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <MaterialCommunityIcons name={up ? 'arrow-up' : 'arrow-down'} size={12} color={c} />
                      <Text variant="labelSmall" style={{ color: c, fontWeight: '700' }}>{up ? '+' : ''}{idx.changePct}% today</Text>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}> · {idx.return1y >= 0 ? '+' : ''}{idx.return1y}% 1y</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
              Updated {timeAgo(snapshot.updated_at)}
            </Text>
          </View>
        ) : loading ? (
          <ActivityIndicator />
        ) : (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Markets unavailable — pull to refresh when online.</Text>
        )}
      </SectionCard>

      {/* News feed */}
      <SectionCard title={relevantCount > 0 ? `Your Wealth Feed · ${relevantCount} affecting you` : 'Wealth Feed'}>
        {loading && feed.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>Loading the latest market news…</Text>
          </View>
        ) : sorted.length === 0 ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            No news available right now. Pull to refresh when you're online.
          </Text>
        ) : (
          <View style={{ gap: 4 }}>
            {sorted.map((it, i) => {
              const relevant = isRelevant(it);
              return (
                <Pressable
                  key={it.id + i}
                  onPress={() => it.link && Linking.openURL(it.link)}
                  style={[styles.item, { borderBottomColor: theme.colors.outlineVariant }]}
                >
                  {relevant && (
                    <View style={[styles.tag, { backgroundColor: palette.good + '22' }]}>
                      <MaterialCommunityIcons name="briefcase-check" size={11} color={palette.good} />
                      <Text style={{ fontSize: 9, fontWeight: '800', color: palette.good }}>IN YOUR PORTFOLIO</Text>
                    </View>
                  )}
                  <Text variant="bodyMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }} numberOfLines={3}>
                    {it.title}
                  </Text>
                  {it.summary ? (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }} numberOfLines={2}>
                      {it.summary}
                    </Text>
                  ) : null}
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                    {it.source}{it.published ? ` · ${timeAgo(it.published)}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </SectionCard>

      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
        News from public RSS feeds (Moneycontrol, Mint, ET). Tap to read the full story.
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginBottom: 5 },
});

export default WealthFeedScreen;
