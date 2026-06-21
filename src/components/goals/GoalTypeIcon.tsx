import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GOAL_TYPE_COLORS } from '@/services/constants';

const GOAL_TYPE_ICONS: Record<string, string> = {
  retirement: 'piggy-bank',
  education: 'school',
  travel: 'airplane',
  emergency: 'shield-alert',
  home: 'home',
  wedding: 'ring',
  custom: 'flag',
};

interface Props {
  goalType: string;
  size?: number;
}

const GoalTypeIcon: React.FC<Props> = ({ goalType, size = 24 }) => {
  const icon = GOAL_TYPE_ICONS[goalType] ?? 'flag';
  const color = GOAL_TYPE_COLORS[goalType] ?? '#2F8F6F';
  return <MaterialCommunityIcons name={icon as any} size={size} color={color} />;
};

export default GoalTypeIcon;
