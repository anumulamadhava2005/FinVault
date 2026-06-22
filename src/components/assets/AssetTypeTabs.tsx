import React from 'react';
import { ScrollView } from 'react-native';
import { Chip } from 'react-native-paper';
import type { AssetType } from '../../models/types';
import BouncePressable from '../BouncePressable';

interface AssetTypeTabsProps {
  assetTypes: AssetType[];
  activeSlug: string | null;
  onSelect: (slug: string | null) => void;
}

const getShortName = (name: string): string => {
  const map: Record<string, string> = {
    'Mutual Funds': 'MF',
    'Equity': 'Stocks',
    'Fixed Deposit': 'FD',
    'Gold': 'Gold',
    'Public Provident Fund': 'PPF',
    'Employee Provident Fund': 'EPF',
    'Real Estate': 'Property',
    'Insurance': 'Insurance',
    'Bank Balance': 'Cash',
  };
  return map[name] ?? name;
};

const AssetTypeTabs: React.FC<AssetTypeTabsProps> = ({ assetTypes, activeSlug, onSelect }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 12, gap: 10, flexDirection: 'row' }}
  >
    <BouncePressable onPress={() => onSelect(null)}>
      <Chip
        selected={activeSlug === null}
        accessibilityLabel="Show all asset types"
        compact
        pointerEvents="none"
      >
        All
      </Chip>
    </BouncePressable>
    {assetTypes.map((t) => (
      <BouncePressable key={t.id} onPress={() => onSelect(t.slug)}>
        <Chip
          selected={activeSlug === t.slug}
          accessibilityLabel={`Filter by ${t.name}`}
          compact
          pointerEvents="none"
        >
          {getShortName(t.name)}
        </Chip>
      </BouncePressable>
    ))}
  </ScrollView>
);

export default AssetTypeTabs;

