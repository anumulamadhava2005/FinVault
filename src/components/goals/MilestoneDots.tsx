import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { palette } from '../../theme';

const MILESTONES = [25, 50, 75, 100];

interface Props {
  pct: number;
}

const MilestoneDots: React.FC<Props> = ({ pct }) => {
  const theme = useTheme();
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <View style={styles.row}>
      {MILESTONES.map((m) => (
        <View key={m} style={styles.item}>
          <View
            style={[
              styles.dot,
              { borderColor: theme.colors.outline },
              clamped >= m && { backgroundColor: palette.good, borderColor: palette.good }
            ]}
          />
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}>
            {m}%
          </Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 6 },
  item: { alignItems: 'center', gap: 3 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
});

export default MilestoneDots;
