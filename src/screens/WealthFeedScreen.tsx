/**
 * Wealth Feed — live market snapshot (Nifty / Sensex / Gold / USD-INR) plus a
 * personalised news feed from public Indian-finance RSS sources. News items
 * that mention one of your holdings are surfaced first and tagged.
 */
import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { View, StyleSheet, Pressable, Linking, RefreshControl, ScrollView } from 'react-native';
import { Text, useTheme, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';

import { Screen, SectionCard } from '../components/ui';
import ThemeToggle from '../components/ThemeToggle';
import { useApp } from '../context/AppContext';
import { all } from '../db';
import {
  refreshMarketData,
  getMarketSnapshot,
  fetchPortfolioNews,
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
  const router = useRouter();

  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(getMarketSnapshot());
  const [feed, setFeed] = useState<FeedItem[]>(getCachedFeed());
  const [loading, setLoading] = useState(feed.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

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
    // Targeted items already carry the holding(s) they were fetched for.
    if (it.holdings && it.holdings.length) return true;
    const hay = `${it.title} ${it.summary}`.toLowerCase();
    return keywords.some((k) => hay.includes(k));
  };

  const load = useCallback(async () => {
    setIsOffline(false);
    try {
      const [snap, items] = await Promise.all([refreshMarketData(), fetchPortfolioNews(userId!)]);
      if (snap) {
        setSnapshot(snap);
        setIsOffline(false);
      } else {
        setIsOffline(true);
      }
      if (items.length) setFeed(items);
    } catch {
      setIsOffline(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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
      {isOffline && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: theme.colors.errorContainer,
          borderRadius: theme.roundness,
          padding: 10,
          marginBottom: 10,
        }}>
          <MaterialCommunityIcons name="wifi-off" size={16} color={theme.colors.onErrorContainer} />
          <Text style={{ color: theme.colors.onErrorContainer, fontSize: 13, fontWeight: '600', flex: 1 }}>
            Offline — showing last cached data
          </Text>
        </View>
      )}

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
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>Searching news about your holdings…</Text>
          </View>
        ) : sorted.length === 0 ? (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            No news found for your holdings right now. Add stocks/funds or pull to refresh when you're online.
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
                    <Pressable
                      onPress={() =>
                        router.push({
                          pathname: '/news-impact',
                          params: {
                            title: it.title,
                            summary: it.summary?.slice(0, 400) ?? '',
                            source: it.source,
                            link: it.link ?? '',
                            holdings: JSON.stringify(it.holdings ?? []),
                          },
                        } as any)
                      }
                      style={[styles.tag, { backgroundColor: palette.good + '22' }]}
                    >
                      <MaterialCommunityIcons name="briefcase-check" size={11} color={palette.good} />
                      <Text style={{ fontSize: 9, fontWeight: '800', color: palette.good }}>IN YOUR PORTFOLIO · SEE IMPACT</Text>
                      <MaterialCommunityIcons name="chevron-right" size={12} color={palette.good} />
                    </Pressable>
                  )}
                  <Text variant="bodyMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }} numberOfLines={3}>
                    {it.title}
                  </Text>
                  {it.holdings && it.holdings.length > 0 ? (
                    <Text variant="labelSmall" style={{ color: palette.good, fontWeight: '700', marginTop: 3 }} numberOfLines={1}>
                      Affects: {it.holdings.join(', ')}
                    </Text>
                  ) : null}
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
        News matched to your holdings via Google News. Tap a story to read it, or “See impact” to analyse it.
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  item: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, marginBottom: 5 },
});

export default WealthFeedScreen;
