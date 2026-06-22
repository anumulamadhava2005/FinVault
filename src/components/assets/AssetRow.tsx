import React from 'react';
import { View } from 'react-native';
import { IconButton, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import type { Asset } from '../../models/types';
import { SectionCard, Row, Kpi } from '../ui';
import { palette } from '../../theme';
import { SIP_ELIGIBLE_TYPES } from '../../services/constants';
import { formatINR, pct, assetPnl } from '../../utils/money';
import { calcCAGR } from '../../utils/cagr';
import { getTypeConfig } from './AssetTypeFieldConfig';

interface AssetRowProps {
  asset: Asset & { type_name: string; slug: string };
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onPress?: (id: string) => void;
  onSip?: (id: string) => void;
}

const AssetRow: React.FC<AssetRowProps> = React.memo(({ asset: a, onEdit, onDelete, onPress, onSip }) => {
  const theme = useTheme();
  const pnl = assetPnl(a.current_value, a.invested_amount);
  const cagr = calcCAGR(a.current_value, a.invested_amount, a.investment_date ?? a.purchase_date);
  const cfg = getTypeConfig(a.slug ?? '');

  return (
    <SectionCard>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TouchableRipple
          onPress={onPress ? () => onPress(a.id) : undefined}
          style={{ flex: 1, borderRadius: 8, padding: 2 }}
          borderless
          accessibilityLabel={`View details for ${a.name}`}
          accessibilityRole="button"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialCommunityIcons name={cfg.icon as any} size={20} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="titleSmall" style={{ fontWeight: '800' }} numberOfLines={1}>{a.name}</Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{a.type_name}</Text>
            </View>
          </View>
        </TouchableRipple>
        <View style={{ flexDirection: 'row' }}>
          {SIP_ELIGIBLE_TYPES.has(a.slug) && onSip ? (
            <IconButton
              icon="autorenew"
              size={18}
              iconColor={theme.colors.primary}
              onPress={() => onSip(a.id)}
              accessibilityLabel="Configure SIP"
            />
          ) : null}
          <IconButton icon="pencil" size={18} onPress={() => onEdit(a.id)} accessibilityLabel="Edit asset" />
          <IconButton icon="delete" iconColor={palette.danger} size={18} onPress={() => onDelete(a.id)} accessibilityLabel="Delete asset" />
        </View>
      </View>

      <Row style={{ marginTop: 6 }}>
        <Kpi flex label="Invested" value={formatINR(a.invested_amount)} />
        <Kpi flex label="Current" value={formatINR(a.current_value)} />
        <Kpi
          flex
          label="P&L"
          value={formatINR(pnl)}
          subTone={pnl >= 0 ? 'good' : 'bad'}
          sub={`${pct(pnl, a.invested_amount)}%`}
        />
      </Row>

      {cagr !== 0 && (
        <View style={{ marginTop: 4, alignItems: 'flex-end' }}>
          <Text variant="labelSmall" style={{ color: cagr >= 0 ? palette.good : palette.danger, fontVariant: ['tabular-nums'] }}>
            CAGR {cagr >= 0 ? '+' : ''}{cagr}%
          </Text>
        </View>
      )}

      {a.is_sip ? (
        <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <MaterialCommunityIcons name="autorenew" size={12} color={theme.colors.primary} />
          <Text variant="labelSmall" style={{ color: theme.colors.primary, fontVariant: ['tabular-nums'] }}>
            SIP {a.sip_monthly_amount ? `₹${(a.sip_monthly_amount / 100).toLocaleString('en-IN')}/mo` : 'active'}
          </Text>
        </View>
      ) : null}
    </SectionCard>
  );
});

export default AssetRow;
