import React from 'react';
import { ScrollView } from 'react-native';
import { Chip } from 'react-native-paper';
import type { AssetType } from '../../models/types';

interface AssetTypeTabsProps {
  assetTypes: AssetType[];
  activeSlug: string | null;
  onSelect: (slug: string | null) => void;
}

const AssetTypeTabs: React.FC<AssetTypeTabsProps> = ({ assetTypes, activeSlug, onSelect }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={{ paddingVertical: 8, gap: 8, flexDirection: 'row' }}
  >
    <Chip
      selected={activeSlug === null}
      onPress={() => onSelect(null)}
      accessibilityLabel="Show all asset types"
    >
      All
    </Chip>
    {assetTypes.map((t) => (
      <Chip
        key={t.id}
        selected={activeSlug === t.slug}
        onPress={() => onSelect(t.slug)}
        accessibilityLabel={`Filter by ${t.name}`}
      >
        {t.name}
      </Chip>
    ))}
  </ScrollView>
);

export default AssetTypeTabs;
