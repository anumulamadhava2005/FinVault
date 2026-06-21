import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import Svg, { Circle } from 'react-native-svg';

import { StatusChip } from '../ui';
import GoalTypeIcon from './GoalTypeIcon';
import MilestoneDots from './MilestoneDots';
import { palette, statusColor } from '../../theme';
import { formatINR, scoreColor } from '../../utils/money';
import { formatDisplayDate } from '../../utils/date';

const RADIUS = 46;
const STROKE = 10;
const SIZE = (RADIUS + STROKE) * 2 + 4;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface GoalRingItem {
  id: string;
  name: string;
  goal_type: string;
  target_amount: number;
  current: number;
  pct: number;
  monthly_needed: number;
  target_date: string | null;
  status: string;
  status_label: string;
  status_icon: string;
  status_tone: 'good' | 'warn' | 'bad';
}

interface Props {
  goal: GoalRingItem;
  onDelete: (id: string) => void;
  onPress?: () => void;
}

const GoalRingCard: React.FC<Props> = ({ goal, onDelete, onPress }) => {
  const theme = useTheme();
  const displayPct = Math.min(goal.pct, 100);
  const ringColor = statusColor(scoreColor(displayPct));
  const offset = CIRCUMFERENCE * (1 - displayPct / 100);

  const remaining = Math.max(goal.target_amount - goal.current, 0);
  const focusMonths = goal.monthly_needed > 0 ? Math.ceil(remaining / goal.monthly_needed) : 0;
  const projection =
    displayPct >= 100 ? 'Achieved 🎉' : focusMonths > 0 ? `~${focusMonths} mo` : 'Set monthly';

  return (
    <Pressable style={[styles.card, { backgroundColor: theme.colors.surface }]} onPress={onPress}>
      {/* Header row: status badge + delete */}
      <View style={styles.header}>
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <StatusChip label={goal.status_label} tone={goal.status_tone} icon={goal.status_icon} />
        </View>
        <Button compact textColor={palette.danger} onPress={() => onDelete(goal.id)} style={{ flexShrink: 0 }}>
          ✕
        </Button>
      </View>

      {/* SVG radial ring */}
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg
          width={SIZE}
          height={SIZE}
          style={[StyleSheet.absoluteFill, { transform: [{ rotate: '-90deg' }] }]}
        >
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={theme.colors.surfaceVariant}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={ringColor}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </Svg>
        {/* Centred label — not rotated */}
        <View style={[StyleSheet.absoluteFill, styles.ringCenter]}>
          <Text variant="titleSmall" style={{ fontWeight: '800', color: ringColor }}>
            {displayPct}%
          </Text>
        </View>
      </View>

      {/* Icon + name */}
      <View style={styles.nameRow}>
        <GoalTypeIcon goalType={goal.goal_type} size={18} />
        <Text
          variant="titleSmall"
          style={{ fontWeight: '700', flex: 1, textAlign: 'center' }}
          numberOfLines={2}
        >
          {goal.name}
        </Text>
      </View>

      {/* Amounts */}
      <Text
        variant="labelSmall"
        style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 2 }}
      >
        {formatINR(goal.current)} / {formatINR(goal.target_amount)}
      </Text>

      {/* Milestone dots */}
      <MilestoneDots pct={displayPct} />

      {/* Meta: date + projection */}
      <View style={styles.meta}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {goal.target_date ? formatDisplayDate(goal.target_date) : 'No date'}
        </Text>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {projection}
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '48%',
    marginHorizontal: '1%',
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 6,
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 4,
  },
});

export default GoalRingCard;
