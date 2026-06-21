/**
 * Chart components. Grouped bars are rendered with plain Views (react-native
 * charting libs don't do side-by-side grouped bars, which the
 * Original-vs-Outstanding and benchmark charts need); pie/line use chart-kit.
 */
import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { LineChart } from 'react-native-chart-kit';
import Svg, { Path } from 'react-native-svg';

export const chartWidth = Dimensions.get('window').width - 60;

export interface Series {
  label: string;
  color: string;
  data: number[];
}

/** Side-by-side grouped vertical bars. Reference series should be passed first. */
export const GroupedBars: React.FC<{
  labels: string[];
  series: Series[];
  formatValue?: (n: number) => string;
  height?: number;
}> = ({ labels, series, formatValue, height = 160 }) => {
  const theme = useTheme();
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  return (
    <View>
      <View style={[styles.barsArea, { height }]}>
        {labels.map((label, i) => (
          <View key={label + i} style={styles.group}>
            <View style={styles.groupBars}>
              {series.map((s) => {
                const v = s.data[i] ?? 0;
                return (
                  <View
                    key={s.label}
                    style={{
                      width: 14,
                      height: Math.max(2, (v / max) * (height - 24)),
                      backgroundColor: s.color,
                      borderTopLeftRadius: 4,
                      borderTopRightRadius: 4,
                    }}
                  />
                );
              })}
            </View>
            <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, maxWidth: 80 }}>
              {label}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: s.color }]} />
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

export interface PieDatum {
  name: string;
  value: number;
  color: string;
}

const PIE_SIZE = 130;
const PIE_CX = PIE_SIZE / 2;
const PIE_CY = PIE_SIZE / 2;
const PIE_R = PIE_SIZE / 2 - 6;

const toPolar = (deg: number) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: PIE_CX + PIE_R * Math.cos(rad), y: PIE_CY + PIE_R * Math.sin(rad) };
};

const slicePath = (startDeg: number, endDeg: number): string => {
  if (endDeg - startDeg >= 359.9) {
    const t = toPolar(0);
    const b = toPolar(180);
    return `M ${t.x} ${t.y} A ${PIE_R} ${PIE_R} 0 1 1 ${b.x} ${b.y} A ${PIE_R} ${PIE_R} 0 1 1 ${t.x} ${t.y} Z`;
  }
  const s = toPolar(startDeg);
  const e = toPolar(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${PIE_CX} ${PIE_CY} L ${s.x} ${s.y} A ${PIE_R} ${PIE_R} 0 ${large} 1 ${e.x} ${e.y} Z`;
};

export const DistributionPie: React.FC<{ data: PieDatum[] }> = ({ data }) => {
  const theme = useTheme();
  const total = data.reduce((s, d) => s + d.value, 0);

  // Build slices with integer percentages (largest-remainder so they sum to 100)
  const raw = data.map((d) => (total > 0 ? (d.value / total) * 100 : 0));
  const floored = raw.map(Math.floor);
  const deficit = 100 - floored.reduce((s, v) => s + v, 0);
  const bumped = new Set(
    raw
      .map((v, i) => ({ rem: v - floored[i], i }))
      .sort((a, b) => b.rem - a.rem)
      .slice(0, deficit)
      .map((x) => x.i),
  );
  const pcts = floored.map((v, i) => v + (bumped.has(i) ? 1 : 0));

  let cumAngle = 0;
  const slices = data.map((d, i) => {
    const angle = (d.value / Math.max(total, 1)) * 360;
    const s = { ...d, startAngle: cumAngle, endAngle: cumAngle + angle, pct: pcts[i] };
    cumAngle += angle;
    return s;
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Svg width={PIE_SIZE} height={PIE_SIZE} style={{ flexShrink: 0 }}>
        {slices.map((s) => (
          <Path key={s.name} d={slicePath(s.startAngle, s.endAngle)} fill={s.color} />
        ))}
      </Svg>
      <View style={{ flex: 1, gap: 8, paddingLeft: 12 }}>
        {slices.map((s) => (
          <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color, flexShrink: 0 }} />
            <Text
              variant="labelSmall"
              numberOfLines={1}
              style={{ flex: 1, color: theme.colors.onSurfaceVariant }}
            >
              {s.name}
            </Text>
            <Text
              variant="labelSmall"
              style={{ color: theme.colors.onSurface, fontWeight: '700', flexShrink: 0 }}
            >
              {s.pct}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

export const TrendLine: React.FC<{
  labels: string[];
  datasets: { data: number[]; color: string }[];
  legend?: string[];
}> = ({ labels, datasets, legend }) => {
  const theme = useTheme();
  return (
    <LineChart
      data={{
        labels,
        datasets: datasets.map((d) => ({ data: d.data, color: () => d.color, strokeWidth: 2 })),
        legend,
      }}
      width={chartWidth}
      height={180}
      withInnerLines={false}
      fromZero
      chartConfig={{
        backgroundGradientFrom: theme.colors.surface,
        backgroundGradientTo: theme.colors.surface,
        decimalPlaces: 0,
        color: (o = 1) => (theme.dark ? `rgba(255,255,255,${o})` : `rgba(20,22,27,${o})`),
        labelColor: () => theme.colors.onSurfaceVariant,
        propsForDots: { r: '3' },
      }}
      bezier
      style={{ borderRadius: 12 }}
    />
  );
};

const styles = StyleSheet.create({
  barsArea: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around' },
  group: { alignItems: 'center', flex: 1 },
  groupBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 16, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
});
