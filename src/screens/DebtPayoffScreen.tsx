import React, { useState, useMemo, useLayoutEffect, useEffect } from 'react';
import { LayoutAnimation, ScrollView, View, StyleSheet, BackHandler, Pressable } from 'react-native';
import { Card, SegmentedButtons, Text, useTheme, Snackbar, Divider, Button, TextInput, Checkbox } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { Kpi, Row, Screen, SectionCard } from '../components/ui';
import { TrendLine } from '../components/charts';
import { useApp } from '../context/AppContext';
import { getActiveLoans, simulatePayoff } from '../services/payoffService';
import { useData } from '../hooks/useData';
import { formatINR, formatINRCompact } from '../utils/money';
import ThemeToggle from '../components/ThemeToggle';
import { palette } from '../theme';
import type { Loan } from '../models/types';
import { LOAN_TYPE_LABELS } from '../services/constants';

const DebtPayoffScreen: React.FC = () => {
  const { userId } = useApp();
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();

  const [snackMsg, setSnackMsg] = useState<string | null>(null);

  // Simulation inputs
  const [extraPaymentStr, setExtraPaymentStr] = useState('10000'); // default ₹10,000 extra/month
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  
  // Load active loans
  const activeLoans = useData(() => (userId ? getActiveLoans(userId) : []));

  // Maintain checked state for each loan (default to true)
  const [selectedLoansMap, setSelectedLoansMap] = useState<Record<string, boolean>>({});

  // Initialize selection map when active loans load
  React.useEffect(() => {
    if (activeLoans.length > 0) {
      const initialMap: Record<string, boolean> = {};
      activeLoans.forEach((l) => {
        initialMap[l.id] = true;
      });
      setSelectedLoansMap(initialMap);
    }
  }, [activeLoans]);

  const toggleLoanSelection = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedLoansMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Hardware back press handler for Android
  useEffect(() => {
    const onBackPress = () => {
      if (navigation.canGoBack()) {
        router.back();
      } else {
        router.replace('/loans' as any);
      }
      return true; // prevent default behavior (app exit/dashboard redirect)
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [navigation, router]);

  // Configure navigation header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <Pressable
          onPress={() => {
            if (navigation.canGoBack()) {
              router.back();
            } else {
              router.replace('/loans' as any);
            }
          }}
          hitSlop={12}
          style={{ paddingLeft: 16, paddingRight: 8, paddingVertical: 4 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.onSurface} />
        </Pressable>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
          <ThemeToggle color={theme.colors.onSurface} />
        </View>
      ),
    });
  }, [navigation, theme, router]);

  // Filter active loans based on user selection
  const loansToSimulate = useMemo(() => {
    return activeLoans.filter((l) => !!selectedLoansMap[l.id]);
  }, [activeLoans, selectedLoansMap]);

  // Run simulation
  const result = useMemo(() => {
    const extraPaymentVal = parseFloat(extraPaymentStr) || 0;
    const extraPaymentPaise = Math.round(extraPaymentVal * 100);
    return simulatePayoff(loansToSimulate, extraPaymentPaise, strategy);
  }, [loansToSimulate, extraPaymentStr, strategy]);

  // Downsample data points for stable charting
  const chartData = useMemo(() => {
    const maxDuration = Math.max(result.baselineDuration, result.acceleratedDuration);
    if (maxDuration === 0 || result.baselineSeries.length === 0) {
      return { labels: [], baseline: [], accelerated: [] };
    }

    const numPoints = 12; // target downsampled chart points
    const step = Math.max(1, Math.ceil(maxDuration / (numPoints - 1)));
    
    const labels: string[] = [];
    const baseline: number[] = [];
    const accelerated: number[] = [];

    for (let m = 0; m <= maxDuration; m += step) {
      labels.push(`M ${m}`);
      
      // Pad with 0 if the simulation finished earlier than this month
      const baseVal = m < result.baselineSeries.length ? result.baselineSeries[m] : 0;
      const accVal = m < result.acceleratedSeries.length ? result.acceleratedSeries[m] : 0;
      
      baseline.push(Math.round(baseVal / 100)); // in Rupees
      accelerated.push(Math.round(accVal / 100)); // in Rupees
    }

    // Ensure the absolute final month is plotted to show the exact zero crossing
    const lastMonthIdx = maxDuration;
    const lastLabel = `M ${lastMonthIdx}`;
    if (labels[labels.length - 1] !== lastLabel) {
      labels.push(lastLabel);
      const baseVal = result.baselineSeries[result.baselineSeries.length - 1] || 0;
      const accVal = result.acceleratedSeries[result.acceleratedSeries.length - 1] || 0;
      baseline.push(Math.round(baseVal / 100));
      accelerated.push(Math.round(accVal / 100));
    }

    return { labels, baseline, accelerated };
  }, [result]);

  return (
    <>
      <Screen>
        {activeLoans.length === 0 ? (
          <SectionCard>
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 16 }}>
              <MaterialCommunityIcons name="bank-off-outline" size={64} color={theme.colors.onSurfaceVariant} />
              <Text variant="titleMedium" style={{ fontWeight: '700' }}>No Active Loans Found</Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginHorizontal: 20 }}>
                You must log at least one active loan with an outstanding balance in FinVault to use the Debt Payoff Planner.
              </Text>
            </View>
          </SectionCard>
        ) : (
          <>
            {/* KPI Scoreboard */}
            <Row style={{ marginBottom: 12 }} gap={10}>
              <Kpi
                label="Interest Saved"
                value={formatINRCompact(result.interestSaved)}
                subTone="good"
                sub="Prepayment savings"
              />
              <Kpi
                label="Months Saved"
                value={`${result.monthsSaved} Months`}
                subTone="good"
                sub="Time accelerated"
              />
              <Kpi
                label="Debt-Free Date"
                value={result.newPayoffDate}
                subTone="good"
                sub="Complete payoff"
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
                <MaterialCommunityIcons name="lightning-bolt" size={26} color={palette.good} />
                <View style={{ flex: 1 }}>
                  <Text variant="labelMedium" style={{ fontWeight: '700', color: theme.dark ? '#34D399' : '#15803D' }}>
                    Accelerated Payoff Plan
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
                    By applying the <Text style={{ fontWeight: '800', color: theme.colors.onSurface }}>{strategy === 'avalanche' ? 'Avalanche' : 'Snowball'}</Text> strategy with an extra{' '}
                    <Text style={{ fontWeight: '800', color: theme.colors.onSurface }}>{formatINR((parseFloat(extraPaymentStr) || 0) * 100)}/month</Text>, you save{' '}
                    <Text style={{ fontWeight: '800', color: palette.good }}>{formatINR(result.interestSaved)}</Text> in interest fees and close your loans{' '}
                    <Text style={{ fontWeight: '800', color: theme.colors.primary }}>{result.monthsSaved} months earlier</Text> (paying off in {result.acceleratedDuration} months vs. {result.baselineDuration} months).
                  </Text>
                </View>
              </Card.Content>
            </Card>

            {/* 1. PLANNER CONTROLS */}
            <SectionCard title="Payoff Strategy Simulator" style={{ marginBottom: 12 }}>
              <View style={{ gap: 12 }}>
                {/* Prepayment Input */}
                <TextInput
                  label="Extra Monthly Prepayment (₹)"
                  value={extraPaymentStr}
                  onChangeText={setExtraPaymentStr}
                  keyboardType="numeric"
                  mode="outlined"
                  dense
                  style={{ backgroundColor: theme.colors.surface }}
                />

                {/* Strategy Selector */}
                <View>
                  <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                    Repayment Priority Method
                  </Text>
                  <SegmentedButtons
                    value={strategy}
                    onValueChange={(v) => {
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setStrategy(v as any);
                    }}
                    buttons={[
                      { value: 'avalanche', label: 'Avalanche (Highest Rate)', labelStyle: { fontSize: 10, fontWeight: '600' } },
                      { value: 'snowball', label: 'Snowball (Smallest Debt)', labelStyle: { fontSize: 10, fontWeight: '600' } },
                    ]}
                    style={{ height: 40 }}
                  />
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 10, marginTop: 4, fontStyle: 'italic' }}>
                    {strategy === 'avalanche' 
                      ? 'Avalanche prioritizes high-interest loans to minimize total interest paid.' 
                      : 'Snowball prioritizes small balances first to build quick psychological wins.'}
                  </Text>
                </View>

                {/* Active Loans Checklist */}
                <Divider style={{ marginVertical: 4 }} />
                <View>
                  <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                    Include Loans in Payoff Plan
                  </Text>
                  <View style={{ gap: 4 }}>
                    {activeLoans.map((loan) => {
                      const isChecked = !!selectedLoansMap[loan.id];
                      return (
                        <View key={loan.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                            <Checkbox.Android
                              status={isChecked ? 'checked' : 'unchecked'}
                              onPress={() => toggleLoanSelection(loan.id)}
                            />
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                                {LOAN_TYPE_LABELS[loan.loan_type] || loan.loan_type} {loan.provider ? `(${loan.provider})` : ''}
                              </Text>
                              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                Bal: {formatINR(loan.outstanding_amount)} · Rate: {loan.interest_rate}%
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            </SectionCard>

            {/* 2. PROGRESS CHART */}
            {chartData.labels.length > 0 && (
              <SectionCard title="Debt Freedom Curve" style={{ marginBottom: 12 }}>
                <TrendLine
                  labels={chartData.labels}
                  datasets={[
                    { data: chartData.accelerated, color: palette.good }, // Accelerated Plan (Emerald Green)
                    { data: chartData.baseline, color: theme.colors.secondary }, // Baseline Plan (Muted Gray)
                  ]}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: palette.good }} />
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Accelerated Plan</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: theme.colors.secondary }} />
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Baseline (Mandatory EMI)</Text>
                  </View>
                </View>
              </SectionCard>
            )}

            {/* 3. LOAN-BY-LOAN DETAILS */}
            {result.loanDetails.length > 0 && (
              <SectionCard title="Loan Closure Timeline & Savings">
                <View style={{ gap: 10 }}>
                  {result.loanDetails.map((detail) => {
                    return (
                      <View
                        key={detail.id}
                        style={{
                          padding: 12,
                          backgroundColor: theme.colors.elevation.level1,
                          borderRadius: theme.roundness,
                          borderWidth: 1,
                          borderColor: theme.colors.outlineVariant,
                          gap: 6,
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text variant="bodyMedium" style={{ fontWeight: '700', color: theme.colors.onSurface, flex: 1, marginRight: 8 }} numberOfLines={1}>
                            {LOAN_TYPE_LABELS[detail.loanType] || detail.loanType} {detail.provider ? `(${detail.provider})` : ''}
                          </Text>
                          <View
                            style={{
                              backgroundColor: theme.colors.primaryContainer,
                              paddingVertical: 2,
                              paddingHorizontal: 8,
                              borderRadius: 10,
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.onPrimaryContainer }}>
                              {detail.interestRate}% Rate
                            </Text>
                          </View>
                        </View>
                        
                        <Divider style={{ marginVertical: 2 }} />

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            Outstanding Balance:
                          </Text>
                          <Text variant="bodySmall" style={{ fontWeight: '600' }}>
                            {formatINR(detail.outstanding)}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            Closure Month (Acc. vs Base):
                          </Text>
                          <Text variant="bodySmall" style={{ fontWeight: '700', color: theme.colors.primary }}>
                            {detail.acceleratedMonths} mo <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: 'normal' }}>vs {detail.baselineMonths} mo</Text>
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            Interest Paid (Acc. vs Base):
                          </Text>
                          <Text variant="bodySmall" style={{ fontWeight: '600' }}>
                            {formatINRCompact(detail.acceleratedInterestPaid)} <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: 'normal' }}>vs {formatINRCompact(detail.baselineInterestPaid)}</Text>
                          </Text>
                        </View>

                        {detail.savings > 0 && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                            <Text variant="bodySmall" style={{ color: palette.good, fontWeight: '700' }}>
                              Prepayment Interest Savings:
                            </Text>
                            <Text variant="bodySmall" style={{ fontWeight: '800', color: palette.good }}>
                              {formatINR(detail.savings)}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </SectionCard>
            )}
          </>
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

export default DebtPayoffScreen;
