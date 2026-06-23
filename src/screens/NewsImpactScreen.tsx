/**
 * News Impact — a detailed, visual read on how a news story touches the user's
 * portfolio. Reached by tapping the "IN YOUR PORTFOLIO" chip in the Wealth Feed.
 *
 * Centrepiece is a flow chart: News (with sentiment) → the holdings it mentions
 * → the overall portfolio exposure it represents. All offline/heuristic; framed
 * as informational, not advice.
 */
import React, { useLayoutEffect } from 'react';
import { BackHandler, Dimensions, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, useTheme, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import Svg, { Line, Polygon } from 'react-native-svg';

import { SectionCard, Kpi, Row } from '../components/ui';
import { useApp } from '../context/AppContext';
import { analyzeNewsImpact, type Sentiment } from '../services/newsImpact';
import { palette } from '../theme';
import { formatINR, formatINRCompact } from '../utils/money';

const SENTIMENT_META: Record<Sentiment, { label: string; icon: string; tone: string }> = {
  positive: { label: 'Positive', icon: 'trending-up', tone: palette.good },
  negative: { label: 'Negative', icon: 'trending-down', tone: palette.danger },
  neutral: { label: 'Neutral', icon: 'trending-neutral', tone: '#9E9E9E' },
};

// ─── Flow chart ───────────────────────────────────────────────────────────────

const FlowChart: React.FC<{
  sentiment: Sentiment;
  exposurePct: number;
  nodes: { id: string; name: string; weight: number }[];
  extra: number; // holdings beyond those shown
}> = ({ sentiment, exposurePct, nodes, extra }) => {
  const theme = useTheme();
  const c = SENTIMENT_META[sentiment].tone;
  const W = Dimensions.get('window').width - 32;

  const HN = 64;   // news node height
  const HH = 78;   // holding node height
  const HP = 76;   // portfolio node height
  const GAP = 42;  // vertical connector zone

  const N = nodes.length;
  const hasMid = N > 0;

  const newsY = 0;
  const holdY = HN + GAP;
  const portY = hasMid ? holdY + HH + GAP : HN + GAP;
  const totalH = portY + HP;

  const cx = W / 2;
  const bigW = Math.min(W * 0.74, 300);

  // Holding node geometry.
  const slot = N ? W / N : W;
  const holdW = Math.min(slot - 10, 132);
  const holdCenter = (i: number) => slot * (i + 0.5);

  const busTop = newsY + HN + GAP / 2;
  const busBottom = holdY + HH + GAP / 2;

  const arrow = (x: number, y: number, key: string) => (
    <Polygon key={key} points={`${x - 5},${y - 8} ${x + 5},${y - 8} ${x},${y}`} fill={c} />
  );

  return (
    <View style={{ width: W, height: totalH, alignSelf: 'center' }}>
      {/* Connector layer */}
      <Svg width={W} height={totalH} style={StyleSheet.absoluteFill}>
        {hasMid ? (
          <>
            {/* news → bus */}
            <Line x1={cx} y1={newsY + HN} x2={cx} y2={busTop} stroke={c} strokeWidth={2} />
            {/* horizontal distribution bus */}
            {N > 1 && (
              <Line x1={holdCenter(0)} y1={busTop} x2={holdCenter(N - 1)} y2={busTop} stroke={c} strokeWidth={2} />
            )}
            {/* bus → each holding (with arrowhead) */}
            {nodes.map((n, i) => (
              <React.Fragment key={`d${n.id}`}>
                <Line x1={holdCenter(i)} y1={busTop} x2={holdCenter(i)} y2={holdY} stroke={c} strokeWidth={2} />
                {arrow(holdCenter(i), holdY, `a${n.id}`)}
              </React.Fragment>
            ))}
            {/* each holding → lower bus */}
            {nodes.map((n, i) => (
              <Line key={`u${n.id}`} x1={holdCenter(i)} y1={holdY + HH} x2={holdCenter(i)} y2={busBottom} stroke={c} strokeWidth={2} />
            ))}
            {N > 1 && (
              <Line x1={holdCenter(0)} y1={busBottom} x2={holdCenter(N - 1)} y2={busBottom} stroke={c} strokeWidth={2} />
            )}
            {/* lower bus → portfolio */}
            <Line x1={cx} y1={busBottom} x2={cx} y2={portY} stroke={c} strokeWidth={2} />
            {arrow(cx, portY, 'aport')}
          </>
        ) : (
          <>
            <Line x1={cx} y1={newsY + HN} x2={cx} y2={portY} stroke={c} strokeWidth={2} strokeDasharray="5,5" />
            {arrow(cx, portY, 'aport')}
          </>
        )}
      </Svg>

      {/* News node */}
      <View style={[styles.node, {
        top: newsY, left: cx - bigW / 2, width: bigW, height: HN,
        borderColor: c, backgroundColor: c + '14',
      }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <MaterialCommunityIcons name="newspaper-variant-outline" size={16} color={c} />
          <Text variant="labelMedium" style={{ fontWeight: '800', color: theme.colors.onSurface }}>NEWS</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
          <MaterialCommunityIcons name={SENTIMENT_META[sentiment].icon as any} size={13} color={c} />
          <Text variant="labelSmall" style={{ color: c, fontWeight: '700' }}>{SENTIMENT_META[sentiment].label} signal</Text>
        </View>
      </View>

      {/* Holding nodes */}
      {nodes.map((n, i) => (
        <View
          key={n.id}
          style={[styles.node, {
            top: holdY, left: holdCenter(i) - holdW / 2, width: holdW, height: HH,
            borderColor: theme.colors.outline, backgroundColor: theme.colors.surface,
          }]}
        >
          <Text variant="labelSmall" numberOfLines={2} style={{ fontWeight: '700', color: theme.colors.onSurface, textAlign: 'center' }}>
            {n.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
            <MaterialCommunityIcons name={SENTIMENT_META[sentiment].icon as any} size={11} color={c} />
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>{n.weight}%</Text>
          </View>
        </View>
      ))}

      {/* Portfolio node */}
      <View style={[styles.node, {
        top: portY, left: cx - bigW / 2, width: bigW, height: HP,
        borderColor: c, backgroundColor: c + '14',
      }]}>
        <MaterialCommunityIcons name="briefcase-variant-outline" size={16} color={c} />
        <Text variant="labelMedium" style={{ fontWeight: '800', color: theme.colors.onSurface, marginTop: 2 }}>YOUR PORTFOLIO</Text>
        <Text variant="labelSmall" style={{ color: c, fontWeight: '700', marginTop: 1 }}>
          {exposurePct}% exposed{extra > 0 ? ` · +${extra} more` : ''}
        </Text>
      </View>
    </View>
  );
};

// ─── Screen ───────────────────────────────────────────────────────────────────

const NewsImpactScreen: React.FC = () => {
  const { userId, refreshKey } = useApp();
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{ title?: string; summary?: string; source?: string; link?: string; holdings?: string }>();

  const title = params.title ?? 'News story';
  const summary = params.summary ?? '';
  const source = params.source ?? '';
  const link = params.link ?? '';
  const seedNames = React.useMemo<string[]>(() => {
    try { return params.holdings ? JSON.parse(params.holdings) : []; } catch { return []; }
  }, [params.holdings]);

  const impact = React.useMemo(() => {
    return analyzeNewsImpact(userId!, title, summary, seedNames);
  }, [userId, title, summary, seedNames, refreshKey]);
  const meta = SENTIMENT_META[impact.sentiment];

  React.useEffect(() => {
    const onBackPress = () => {
      router.replace('/feed' as any);
      return true; // prevent default behavior
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [router]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Impact Analysis',
      headerLeft: () => (
        <Pressable onPress={() => router.replace('/feed' as any)} hitSlop={12} style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.onSurface} />
        </Pressable>
      ),
    });
  }, [navigation, theme, router]);

  const chartNodes = impact.affected.slice(0, 4).map((a) => ({ id: a.id, name: a.name, weight: a.weight_pct }));
  const extra = Math.max(impact.affected.length - chartNodes.length, 0);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}>
        {/* News card */}
        <SectionCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700' }}>{source.toUpperCase()}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: meta.tone + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
              <MaterialCommunityIcons name={meta.icon as any} size={12} color={meta.tone} />
              <Text style={{ fontSize: 10, fontWeight: '800', color: meta.tone }}>{meta.label.toUpperCase()}</Text>
            </View>
          </View>
          <Text variant="titleMedium" style={{ fontWeight: '800', color: theme.colors.onSurface, lineHeight: 22 }}>{title}</Text>
          {summary ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6, lineHeight: 18 }}>{summary}</Text>
          ) : null}
          {link ? (
            <Button mode="text" compact icon="open-in-new" onPress={() => Linking.openURL(link)} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
              Read full story
            </Button>
          ) : null}
        </SectionCard>

        {/* Takeaway */}
        <View style={{
          flexDirection: 'row', gap: 10, alignItems: 'flex-start',
          padding: 14, borderRadius: theme.roundness, borderWidth: 1,
          backgroundColor: meta.tone + '12', borderColor: meta.tone + '40',
        }}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={meta.tone} style={{ marginTop: 1 }} />
          <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurface, fontWeight: '600', lineHeight: 18 }}>
            {impact.headline_summary}
          </Text>
        </View>

        {/* KPIs */}
        <Row>
          <Kpi flex label="Signal" value={meta.label} subTone={impact.sentiment === 'positive' ? 'good' : impact.sentiment === 'negative' ? 'bad' : 'muted'} />
          <Kpi flex label="Holdings hit" value={String(impact.affected.length)} />
          <Kpi flex label="Exposure" value={`${impact.exposure_pct}%`} sub={formatINRCompact(impact.affected_value)} subTone={impact.exposure_pct > 0 ? (impact.sentiment === 'negative' ? 'bad' : 'good') : 'muted'} />
        </Row>

        {/* Flow chart */}
        <SectionCard title="How it flows to your portfolio">
          <View style={{ marginTop: 6 }}>
            <FlowChart
              sentiment={impact.sentiment}
              exposurePct={impact.exposure_pct}
              nodes={chartNodes}
              extra={extra}
            />
          </View>
          {impact.affected.length === 0 && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 4 }}>
              No holding was named directly — impact would be via broad market moves.
            </Text>
          )}
        </SectionCard>

        {/* Affected holdings detail */}
        {impact.affected.length > 0 && (
          <SectionCard title="Affected Holdings">
            <View style={{ gap: 12 }}>
              {impact.affected.map((a) => (
                <Pressable
                  key={a.id}
                  onPress={() => router.push(`/assets/${a.id}/analysis` as any)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.surfaceVariant, alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name={meta.icon as any} size={18} color={meta.tone} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: '700', color: theme.colors.onSurface }}>{a.name}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                      {a.matched.slice(0, 3).map((m) => (
                        <View key={m} style={{ backgroundColor: theme.colors.surfaceVariant, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: theme.colors.onSurfaceVariant }}>“{m}”</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="bodySmall" style={{ fontWeight: '800', color: theme.colors.onSurface }}>{formatINR(a.value)}</Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{a.weight_pct}% of holdings</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </SectionCard>
        )}

        {/* Disclaimer */}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <MaterialCommunityIcons name="information-outline" size={15} color={theme.colors.onSurfaceVariant} style={{ marginTop: 1 }} />
          <Text variant="labelSmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant, lineHeight: 16 }}>
            This is an automated, keyword-based read of the headline matched against your holdings — a starting point for your own research, not investment advice.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  node: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
});

export default NewsImpactScreen;
