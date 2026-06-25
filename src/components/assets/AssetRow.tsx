import React, { useState } from 'react';
import { View, LayoutAnimation } from 'react-native';
import { IconButton, Text, useTheme, Button, Checkbox } from 'react-native-paper';
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
  selectMode?: boolean;
  selected?: boolean;
  onSelectToggle?: (id: string) => void;
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

// Slugs that have meaningful per-unit pricing to display
const PRICED_SLUGS = new Set(['equity', 'mutual_fund', 'digital_gold', 'physical_gold', 'sgb']);

const fmtUnitPrice = (v: number): string => {
  if (v >= 1000) return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  if (v >= 10)   return `₹${v.toFixed(2)}`;
  return `₹${v.toFixed(4)}`;
};

const AssetRow: React.FC<AssetRowProps> = React.memo(({
  asset: a,
  onEdit,
  onDelete,
  onPress,
  onSip,
  selectMode = false,
  selected = false,
  onSelectToggle,
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const pnl = assetPnl(a.current_value, a.invested_amount);
  const pnlPercent = pct(pnl, a.invested_amount);
  const cagr = calcCAGR(a.current_value, a.invested_amount, a.investment_date ?? a.purchase_date);
  const cfg = getTypeConfig(a.slug ?? '');

  const qty = a.quantity ?? 0;
  const showPriceTags = !selectMode && PRICED_SLUGS.has(a.slug) && qty > 0;

  // LTP: current price per unit in INR
  const ltp: number | null = showPriceTags
    ? (a.slug === 'mutual_fund' && a.current_nav != null
        ? a.current_nav
        : (a.current_value / 100) / qty)
    : null;

  // Avg buy price per unit in INR
  const avgBuy: number | null = showPriceTags
    ? (a.slug === 'mutual_fund'
        ? (a.invested_amount / 100) / qty
        : (a.price_per_unit ?? (a.invested_amount / 100) / qty))
    : null;

  const handleCardPress = () => {
    if (selectMode) {
      onSelectToggle?.(a.id);
    } else {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpanded((prev) => !prev);
    }
  };

  // Performance status badge
  const getPerfBadge = () => {
    if (cagr >= 20) {
      return { label: 'High Growth', color: palette.good, icon: 'star' as const };
    } else if (cagr >= 12) {
      return { label: 'Top Performer', color: palette.good, icon: 'trending-up' as const };
    } else if (cagr > 0 && cagr < 5) {
      return { label: 'Underperforming', color: palette.danger, icon: 'trending-down' as const };
    }
    return null;
  };

  const perf = getPerfBadge();

  return (
    <SectionCard
      onPress={handleCardPress}
      style={{
        marginBottom: 10,
        borderWidth: selectMode && selected ? 2 : 1,
        borderColor: selectMode && selected ? theme.colors.primary : theme.colors.outlineVariant,
      }}
    >
      {/* Top Header Row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {selectMode ? (
            <Checkbox
              status={selected ? 'checked' : 'unchecked'}
              onPress={() => onSelectToggle?.(a.id)}
            />
          ) : (
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: theme.colors.surfaceVariant,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialCommunityIcons name={cfg.icon as any} size={20} color={theme.colors.primary} />
            </View>
          )}

          <View style={{ flex: 1, paddingRight: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }} numberOfLines={1}>
                {a.name}
              </Text>
              <View style={{
                paddingHorizontal: 7,
                paddingVertical: 2.5,
                borderRadius: 5,
                backgroundColor: theme.colors.surfaceVariant,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.primary }}>
                  {getShortName(a.type_name)}
                </Text>
              </View>
            </View>

            {/* Performance indicator line */}
            {perf && !selectMode && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }}>
                <MaterialCommunityIcons name={perf.icon} size={13} color={perf.color} />
                <Text variant="labelSmall" style={{ fontSize: 11, color: perf.color, fontWeight: '600' }}>
                  {perf.label}
                </Text>
              </View>
            )}

            {/* LTP + Avg buy price tags */}
            {showPriceTags && ltp !== null && (
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                <View style={{
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                  backgroundColor: theme.colors.surfaceVariant,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.onSurfaceVariant }}>
                    LTP {fmtUnitPrice(ltp)}
                  </Text>
                </View>
                {avgBuy !== null && (
                  <View style={{
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    backgroundColor: theme.colors.surfaceVariant,
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.onSurfaceVariant }}>
                      Avg {fmtUnitPrice(avgBuy)}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Collapsed Valuation Stats */}
        <View style={{ alignItems: 'flex-end' }}>
          <Text variant="titleMedium" style={{ fontWeight: '800', color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}>
            {formatINR(a.current_value)}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
            <MaterialCommunityIcons
              name={pnl >= 0 ? 'arrow-up-bold' : 'arrow-down-bold'}
              size={14}
              color={pnl >= 0 ? palette.good : palette.danger}
            />
            <Text
              variant="labelMedium"
              style={{
                color: pnl >= 0 ? palette.good : palette.danger,
                fontWeight: '700',
                fontSize: 12,
                fontVariant: ['tabular-nums'],
              }}
            >
              {pnl >= 0 ? '+' : ''}{pnlPercent}%
            </Text>
          </View>
        </View>

        {!selectMode && (
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.colors.onSurfaceVariant}
            style={{ marginLeft: 10 }}
          />
        )}
      </View>

      {/* Expanded progressive disclosure details */}
      {expanded && !selectMode && (
        <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.outlineVariant }}>
          <Row>
            <Kpi flex label="Invested Amount" value={formatINR(a.invested_amount)} />
            <Kpi
              flex
              label="Total Return"
              value={formatINR(pnl)}
              subTone={pnl >= 0 ? 'good' : 'bad'}
            />
          </Row>

          <Row style={{ marginTop: 10 }}>
            {cagr !== 0 ? (
              <Kpi flex label="CAGR" value={`${cagr >= 0 ? '+' : ''}${cagr}%`} subTone={cagr >= 0 ? 'good' : 'bad'} />
            ) : (
              <Kpi flex label="CAGR" value="—" />
            )}
            {a.is_sip ? (
              <Kpi
                flex
                label="Monthly SIP"
                value={a.sip_monthly_amount ? `₹${(a.sip_monthly_amount / 100).toLocaleString('en-IN')}` : 'Active'}
              />
            ) : (
              <Kpi flex label="Monthly SIP" value="Inactive" />
            )}
          </Row>

          {/* Expanded Actions Row */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' }}>
            <Button
              mode="contained"
              icon="eye"
              onPress={() => onPress?.(a.id)}
              style={{ flex: 2, borderRadius: theme.roundness }}
              contentStyle={{ paddingVertical: 1 }}
              labelStyle={{ fontSize: 12, fontWeight: '700' }}
            >
              View Details
            </Button>
            
            {SIP_ELIGIBLE_TYPES.has(a.slug) && onSip && (
              <Button
                mode="outlined"
                icon="autorenew"
                onPress={() => onSip(a.id)}
                style={{ flex: 1.2, borderRadius: theme.roundness }}
                contentStyle={{ paddingVertical: 1 }}
                labelStyle={{ fontSize: 11, fontWeight: '600' }}
              >
                SIP
              </Button>
            )}

            <IconButton
              icon="pencil"
              mode="outlined"
              size={18}
              onPress={() => onEdit(a.id)}
              style={{ margin: 0, borderRadius: theme.roundness, borderColor: theme.colors.outline }}
              accessibilityLabel="Edit Asset"
            />
            <IconButton
              icon="delete"
              mode="outlined"
              iconColor={palette.danger}
              size={18}
              onPress={() => onDelete(a.id)}
              style={{ margin: 0, borderRadius: theme.roundness, borderColor: palette.danger }}
              accessibilityLabel="Delete Asset"
            />
          </View>
        </View>
      )}
    </SectionCard>
  );
});

export default AssetRow;
