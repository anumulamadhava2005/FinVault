import React, { useState, useMemo, useLayoutEffect } from 'react';
import { LayoutAnimation, ScrollView, View, StyleSheet } from 'react-native';
import { Card, SegmentedButtons, Text, useTheme, Snackbar, Divider, Button, Menu, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { Kpi, Row, Screen, SectionCard } from '../components/ui';
import { TrendLine } from '../components/charts';
import { useApp } from '../context/AppContext';
import { all } from '../db';
import { formatINR, formatINRCompact } from '../utils/money';
import ThemeToggle from '../components/ThemeToggle';
import type { Asset } from '../models/types';
import { palette } from '../theme';

const DIRECT_DEFAULT_TER = 0.12;
const REGULAR_DEFAULT_TER = 1.65;

const ExpenseRatioScreen: React.FC = () => {
  const { userId } = useApp();
  const theme = useTheme();
  const navigation = useNavigation();

  const [snackMsg, setSnackMsg] = useState<string | null>(null);

  // Simulation inputs
  const [selectedFundId, setSelectedFundId] = useState<string>('');
  const [fundMenuOpen, setFundMenuOpen] = useState(false);

  const [currentValStr, setCurrentValStr] = useState('100000');
  const [sipStr, setSipStr] = useState('10000');
  const [returnRateStr, setReturnRateStr] = useState('12.0');
  const [ratioAStr, setRatioAStr] = useState(String(DIRECT_DEFAULT_TER)); // Direct / Low Fee
  const [ratioBStr, setRatioBStr] = useState(String(REGULAR_DEFAULT_TER)); // Regular / High Fee
  const [horizon, setHorizon] = useState<'10' | '20' | '30'>('20');

  // Load user's active mutual funds
  const activeMfs = useMemo(() => {
    if (!userId) return [];
    const rows = all<Asset>(
      `SELECT a.* FROM assets a
       JOIN asset_types t ON t.id = a.asset_type_id
       WHERE a.user_id = ? AND t.slug = 'mutual_fund' AND a.current_value > 0`,
      [userId]
    );
    return rows.map((a) => {
      let ter = REGULAR_DEFAULT_TER;
      try {
        const details = a.details_json ? JSON.parse(a.details_json) : null;
        if (details && details.expense_ratio != null && !isNaN(parseFloat(details.expense_ratio))) {
          ter = parseFloat(details.expense_ratio);
        }
      } catch { /* ignore */ }
      return { ...a, ter };
    });
  }, [userId]);

  // Handle fund selection
  const handleSelectFund = (fund: Asset & { ter: number }) => {
    setSelectedFundId(fund.id);
    setCurrentValStr(String(Math.round(fund.current_value / 100)));
    setSipStr(fund.is_sip ? String(Math.round(fund.sip_monthly_amount / 100)) : '0');
    setRatioBStr(String(fund.ter));
    
    // Check if the selected fund is likely already a direct plan (lower fee)
    if (fund.ter < 0.5) {
      setRatioAStr(String(fund.ter));
      setRatioBStr(String(REGULAR_DEFAULT_TER)); // Compare against regular plan alternative
      setSnackMsg(`Selected direct plan: comparing it against a standard regular plan.`);
    } else {
      setRatioAStr(String(DIRECT_DEFAULT_TER)); // Compare against direct plan alternative
      setSnackMsg(`Selected fund: comparing against a low-cost direct plan alternative.`);
    }
    setFundMenuOpen(false);
  };

  // Configure navigation header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
         <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
           <ThemeToggle color={theme.colors.onSurface} />
         </View>
      ),
    });
  }, [navigation, theme]);

  // Compounding math projection
  const projection = useMemo(() => {
    const curVal = parseFloat(currentValStr) || 0;
    const sip = parseFloat(sipStr) || 0;
    const returnRate = parseFloat(returnRateStr) || 12.0;
    const ratioA = parseFloat(ratioAStr) || 0.12;
    const ratioB = parseFloat(ratioBStr) || 1.65;
    const years = parseInt(horizon) || 20;

    const rateA = (returnRate - ratioA) / 100;
    const rateB = (returnRate - ratioB) / 100;

    const labels: string[] = [];
    const seriesA: number[] = [];
    const seriesB: number[] = [];

    for (let y = 0; y <= years; y++) {
      labels.push(`Yr ${y}`);
      
      // Compounded Lump Sum
      const lumpA = curVal * Math.pow(1 + rateA, y);
      const lumpB = curVal * Math.pow(1 + rateB, y);

      // Compounded SIP
      let sipA = 0;
      let sipB = 0;
      if (sip > 0 && y > 0) {
        const rMonthlyA = rateA / 12;
        const rMonthlyB = rateB / 12;
        const months = y * 12;
        
        if (rMonthlyA > 0) {
          sipA = sip * ((Math.pow(1 + rMonthlyA, months) - 1) / rMonthlyA) * (1 + rMonthlyA);
        } else {
          sipA = sip * months;
        }

        if (rMonthlyB > 0) {
          sipB = sip * ((Math.pow(1 + rMonthlyB, months) - 1) / rMonthlyB) * (1 + rMonthlyB);
        } else {
          sipB = sip * months;
        }
      }

      seriesA.push(Math.round(lumpA + sipA));
      seriesB.push(Math.round(lumpB + sipB));
    }

    const finalValA = seriesA[seriesA.length - 1];
    const finalValB = seriesB[seriesB.length - 1];
    const savings = finalValA - finalValB;
    const totalInvested = curVal + (sip * years * 12);
    const feeDragPct = finalValA > 0 ? (savings / finalValA) * 100 : 0;

    return {
      labels,
      seriesA,
      seriesB,
      finalValA,
      finalValB,
      savings,
      totalInvested,
      feeDragPct
    };
  }, [currentValStr, sipStr, returnRateStr, ratioAStr, ratioBStr, horizon]);

  return (
    <>
      <Screen>
        {/* KPI Scoreboard */}
        <Row style={{ marginBottom: 12 }} gap={10}>
          <Kpi
            label={`Low Fee (Direct)`}
            value={formatINRCompact(projection.finalValA * 100)}
            subTone="good"
            sub="Compounded wealth"
          />
          <Kpi
            label={`High Fee (Regular)`}
            value={formatINRCompact(projection.finalValB * 100)}
            subTone="muted"
            sub="Compounded wealth"
          />
          <Kpi
            label="Wealth Lost to Fees"
            value={formatINRCompact(projection.savings * 100)}
            subTone="bad"
            sub={`${projection.feeDragPct.toFixed(1)}% Fee drag`}
          />
        </Row>

        {/* Actionable recommendation banner */}
        <Card
          style={{
            backgroundColor: theme.dark ? '#1F2C24' : '#F0FDF4',
            borderColor: theme.dark ? '#059669' : '#86EFAC',
            borderWidth: 1,
            borderRadius: theme.roundness,
            marginBottom: 16,
          }}
        >
          <Card.Content style={{ paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <MaterialCommunityIcons name="alert-decagram" size={26} color={palette.good} />
            <View style={{ flex: 1 }}>
              <Text variant="labelMedium" style={{ fontWeight: '700', color: theme.dark ? '#34D399' : '#15803D' }}>
                Long-Term Fee Savings
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
                By switching to a low-cost fund (Expense Ratio: {projection.savings > 0 ? ratioAStr : ratioBStr}%), you would save approximately{' '}
                <Text style={{ fontWeight: '800', color: theme.colors.onSurface }}>{formatINR(projection.savings * 100)}</Text> in unnecessary fees over {horizon} years.
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* 1. INPUTS & CONTROLS */}
        <SectionCard title="Fee Impact Simulator" style={{ marginBottom: 12 }}>
          {/* Fund Selector Dropdown */}
          {activeMfs.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                Pre-fill from Your Portfolio
              </Text>
              <Menu
                visible={fundMenuOpen}
                onDismiss={() => setFundMenuOpen(false)}
                anchor={
                  <Button
                    mode="outlined"
                    compact
                    onPress={() => setFundMenuOpen(true)}
                    contentStyle={{ justifyContent: 'space-between', flexDirection: 'row-reverse', height: 40 }}
                    labelStyle={{ fontSize: 12, color: theme.colors.onSurface }}
                    style={{ width: '100%', borderColor: theme.colors.outline }}
                  >
                    {activeMfs.find((f) => f.id === selectedFundId)?.name || 'Select a Mutual Fund...'}
                  </Button>
                }
              >
                {activeMfs.map((f) => (
                  <Menu.Item
                    key={f.id}
                    title={`${f.name} (${f.ter}%)`}
                    titleStyle={{ fontSize: 12 }}
                    onPress={() => handleSelectFund(f as any)}
                  />
                ))}
              </Menu>
            </View>
          )}

          {/* Interactive Inputs Grid */}
          <View style={{ gap: 12 }}>
            <Row gap={10}>
              <TextInput
                label="Lump Sum Investment (₹)"
                value={currentValStr}
                onChangeText={setCurrentValStr}
                keyboardType="numeric"
                mode="outlined"
                dense
                style={{ flex: 1, backgroundColor: theme.colors.surface }}
              />
              <TextInput
                label="Monthly SIP (₹)"
                value={sipStr}
                onChangeText={setSipStr}
                keyboardType="numeric"
                mode="outlined"
                dense
                style={{ flex: 1, backgroundColor: theme.colors.surface }}
              />
            </Row>

            <Row gap={10}>
              <TextInput
                label="Low Expense Ratio A (%)"
                value={ratioAStr}
                onChangeText={setRatioAStr}
                keyboardType="numeric"
                mode="outlined"
                dense
                style={{ flex: 1, backgroundColor: theme.colors.surface }}
                placeholder={String(DIRECT_DEFAULT_TER)}
              />
              <TextInput
                label="High Expense Ratio B (%)"
                value={ratioBStr}
                onChangeText={setRatioBStr}
                keyboardType="numeric"
                mode="outlined"
                dense
                style={{ flex: 1, backgroundColor: theme.colors.surface }}
                placeholder={String(REGULAR_DEFAULT_TER)}
              />
            </Row>

            <Row gap={10} style={{ alignItems: 'center' }}>
              <TextInput
                label="Expected Return Rate (%)"
                value={returnRateStr}
                onChangeText={setReturnRateStr}
                keyboardType="numeric"
                mode="outlined"
                dense
                style={{ flex: 1, backgroundColor: theme.colors.surface }}
              />
              <View style={{ flex: 1 }}>
                <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                  Investment Horizon
                </Text>
                <SegmentedButtons
                  value={horizon}
                  onValueChange={(v) => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setHorizon(v as any);
                  }}
                  buttons={[
                    { value: '10', label: '10 Yrs', labelStyle: { fontSize: 10, fontWeight: '600' } },
                    { value: '20', label: '20 Yrs', labelStyle: { fontSize: 10, fontWeight: '600' } },
                    { value: '30', label: '30 Yrs', labelStyle: { fontSize: 10, fontWeight: '600' } },
                  ]}
                  style={{ height: 40 }}
                />
              </View>
            </Row>
          </View>
        </SectionCard>

        {/* 2. CHART VISUALIZATION */}
        <SectionCard title="Wealth Growth Comparison" style={{ marginBottom: 12 }}>
          <TrendLine
            labels={projection.labels}
            datasets={[
              { data: projection.seriesA, color: theme.colors.primary }, // Direct / Low
              { data: projection.seriesB, color: theme.colors.outline }, // Regular / High
            ]}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: theme.colors.primary }} />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Low Fee Growth</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 12, height: 12, borderRadius: 2, borderStyle: 'dashed', borderWidth: 1.5, borderColor: theme.colors.outline }} />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>High Fee Growth</Text>
            </View>
          </View>
        </SectionCard>

        {/* 3. ACTIVE FUNDS AUDIT */}
        {activeMfs.length > 0 && (
          <SectionCard title="Your Mutual Funds Audit">
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              Below is an audit of your active mutual fund assets and their expense ratios. High-cost funds (&ge; 1.0%) are flagged.
            </Text>
            <View style={{ gap: 10 }}>
              {activeMfs.map((fund) => {
                const isHigh = fund.ter >= 1.0;
                const potentialSavings = Math.round((fund.current_value * (fund.ter - DIRECT_DEFAULT_TER)) / 100);
                return (
                  <View
                    key={fund.id}
                    style={{
                      padding: 12,
                      backgroundColor: theme.colors.elevation.level1,
                      borderRadius: theme.roundness,
                      borderWidth: 1,
                      borderColor: isHigh ? '#F87171' : theme.colors.outlineVariant,
                      gap: 6,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '700', color: theme.colors.onSurface, flex: 1, marginRight: 8 }} numberOfLines={1}>
                        {fund.name}
                      </Text>
                      <View
                        style={{
                          backgroundColor: isHigh ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                          paddingVertical: 2,
                          paddingHorizontal: 8,
                          borderRadius: 10,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '800', color: isHigh ? palette.danger : palette.good }}>
                          {fund.ter}% Expense
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Value: {formatINR(fund.current_value)}
                      </Text>
                      {isHigh && potentialSavings > 0 && (
                        <Text variant="bodySmall" style={{ fontWeight: '600', color: palette.danger }}>
                          Save {formatINRCompact(potentialSavings)}/yr in direct plan
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </SectionCard>
        )}
      </Screen>

      <Snackbar
        visible={snackMsg !== null}
        onDismiss={() => setSnackMsg(null)}
        duration={3000}
      >
        {snackMsg}
      </Snackbar>
    </>
  );
};

export default ExpenseRatioScreen;
