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

  const items = data.map((d, i) => ({
    ...d,
    pct: pcts[i],
  })).filter((x) => x.value > 0);

  if (items.length === 0) {
    return (
      <View style={{ paddingVertical: 12, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>No assets added yet</Text>
      </View>
    );
  }

  return (
    <View style={{ width: '100%', gap: 16 }}>
      {/* Segmented Bar */}
      <View style={{ height: 16, borderRadius: 8, flexDirection: 'row', overflow: 'hidden', backgroundColor: theme.colors.outlineVariant }}>
        {items.map((item) => (
          <View
            key={item.name}
            style={{
              width: `${item.pct}%`,
              backgroundColor: item.color,
              height: '100%',
            }}
          />
        ))}
      </View>

      {/* Grid Legend */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }}>
        {items.map((item) => (
          <View
            key={item.name}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              width: '48%',
            }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color, flexShrink: 0 }} />
            <Text
              variant="labelSmall"
              numberOfLines={1}
              style={{ flex: 1, color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: '500' }}
            >
              {item.name}
            </Text>
            <Text
              variant="labelSmall"
              style={{ color: theme.colors.onSurface, fontWeight: '700', fontSize: 12 }}
            >
              {item.pct}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const hexToRgba = (hex: string, alpha: number): string => {
  if (!hex) return `rgba(128, 128, 128, ${alpha})`;
  if (hex.startsWith('rgba')) {
    return hex.replace(/[\d\.]+\)$/g, `${alpha})`);
  }
  if (hex.startsWith('rgb')) {
    return hex.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
  }
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const TrendLine: React.FC<{
  labels: string[];
  datasets: { data: number[]; color: string }[];
  legend?: string[];
}> = ({ labels, datasets, legend }) => {
  const theme = useTheme();

  // Thin out X-axis labels to prevent overlapping on long timelines
  const thinnedLabels = React.useMemo(() => {
    if (labels.length <= 6) return labels;
    const total = labels.length;
    let step = 5;
    if (total > 30) step = 10;
    else if (total > 15) step = 5;
    else step = 3;

    return labels.map((label, index) => {
      // Always show first and last labels, and any label at step intervals
      if (index === 0 || index === total - 1 || index % step === 0) {
        return label;
      }
      return '';
    });
  }, [labels]);

  return (
    <LineChart
      data={{
        labels: thinnedLabels,
        datasets: datasets.map((d) => ({
          data: d.data,
          color: (opacity = 1) => hexToRgba(d.color, opacity),
          strokeWidth: 3,
        })),
        legend: legend && legend.length > 1 ? legend : undefined,
      }}
      width={chartWidth}
      height={180}
      withVerticalLines={false}
      withHorizontalLines={true}
      withDots={labels.length < 15}
      fromZero
      formatYLabel={(val) => {
        const num = parseFloat(val);
        if (isNaN(num)) return val;
        if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
        if (num >= 1000) return `₹${(num / 1000).toFixed(0)}k`;
        return `₹${num}`;
      }}
      chartConfig={{
        backgroundGradientFrom: theme.colors.surface,
        backgroundGradientTo: theme.colors.surface,
        decimalPlaces: 0,
        color: (o = 1) => (theme.dark ? `rgba(255,255,255,${o})` : `rgba(24,24,24,${o})`),
        labelColor: () => theme.colors.onSurfaceVariant,
        propsForDots: { r: '3.5', strokeWidth: '1.5', stroke: theme.colors.surface },
      }}
      bezier={labels.length > 2}
      style={{ borderRadius: theme.roundness }}
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
