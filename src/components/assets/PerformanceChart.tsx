import React from 'react';
import { TrendLine } from '../charts';
import { chartColors } from '../../theme';
import { paiseToRupees } from '../../utils/money';

export const generatePerfData = (
  investedPaise: number,
  currentPaise: number,
  n = 8,
): { labels: string[]; data: number[] } => {
  const invested = paiseToRupees(investedPaise);
  const current = paiseToRupees(currentPaise);
  const range = current - invested;
  const data: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const trend = invested + range * t;
    const wobble = Math.abs(range) * 0.06 * Math.sin(i * 1.8);
    data.push(Math.max(1, Math.round(trend + wobble)));
  }
  return { labels: Array(n).fill(''), data };
};

const PerformanceChart: React.FC<{
  investedPaise: number;
  currentPaise: number;
  color?: string;
}> = ({ investedPaise, currentPaise, color }) => {
  const { labels, data } = generatePerfData(investedPaise, currentPaise);
  return (
    <TrendLine
      labels={labels}
      datasets={[{ data, color: color ?? chartColors.yours }]}
    />
  );
};

export default PerformanceChart;
