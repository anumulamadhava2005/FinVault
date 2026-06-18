/**
 * Chart components. Grouped bars are rendered with plain Views (react-native
 * charting libs don't do side-by-side grouped bars, which the
 * Original-vs-Outstanding and benchmark charts need); pie/line use chart-kit.
 */
import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { LineChart, PieChart } from 'react-native-chart-kit';

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
            <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, maxWidth: 64 }}>
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

export const DistributionPie: React.FC<{ data: PieDatum[] }> = ({ data }) => {
  const theme = useTheme();
  const chartData = data.map((d) => ({
    name: d.name,
    population: d.value,
    color: d.color,
    legendFontColor: theme.colors.onSurfaceVariant,
    legendFontSize: 12,
  }));
  return (
    <PieChart
      data={chartData}
      width={chartWidth}
      height={170}
      accessor="population"
      backgroundColor="transparent"
      paddingLeft="8"
      chartConfig={{ color: () => theme.colors.onSurface }}
      absolute={false}
    />
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
