import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import GoalTypeIcon from './GoalTypeIcon';
import { GOAL_TYPE_COLORS } from '../../services/constants';
import { formatDisplayDate } from '../../utils/date';

export interface TimelineGoal {
  id: string;
  name: string;
  goal_type: string;
  color_hex: string;
  target_date: string;
  pct: number;
  status_tone: 'good' | 'warn' | 'bad';
}

interface Props {
  goals: TimelineGoal[];
}

const GoalTimeline: React.FC<Props> = ({ goals }) => {
  const theme = useTheme();

  return (
    <View>
      {goals.map((g, idx) => {
        const dotColor = g.color_hex || GOAL_TYPE_COLORS[g.goal_type] || '#2F8F6F';
        const isLast = idx === goals.length - 1;

        return (
          <View key={g.id} style={styles.node}>
            {/* Left column: dot + connector */}
            <View style={styles.leftCol}>
              <View style={[styles.dot, { backgroundColor: dotColor }]} />
              {!isLast && (
                <View style={[styles.line, { backgroundColor: theme.colors.outline }]} />
              )}
            </View>

            {/* Content */}
            <View style={styles.content}>
              <View style={styles.contentRow}>
                <GoalTypeIcon goalType={g.goal_type} size={16} />
                <Text
                  variant="titleSmall"
                  style={[styles.name, { color: theme.colors.onSurface }]}
                  numberOfLines={1}
                >
                  {g.name}
                </Text>
                <Text variant="labelMedium" style={{ color: dotColor, fontWeight: '700' }}>
                  {g.pct}%
                </Text>
              </View>
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
              >
                {formatDisplayDate(g.target_date)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  node: { flexDirection: 'row' },
  leftCol: { width: 26, alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, marginTop: 4 },
  line: { width: 2, flex: 1, marginVertical: 3, minHeight: 18 },
  content: { flex: 1, paddingLeft: 10, paddingBottom: 16 },
  contentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontWeight: '700' },
});

export default GoalTimeline;
