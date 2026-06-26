import React, { useState, useMemo, useLayoutEffect } from 'react';
import { LayoutAnimation, ScrollView, View, StyleSheet } from 'react-native';
import { Card, SegmentedButtons, Text, useTheme, Snackbar, Divider, Button, Menu, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { EmptyState, Kpi, LineItem, ProgressBar, Row, Screen, SectionCard } from '../components/ui';
import { useApp } from '../context/AppContext';
import { all } from '../db';
import { getSectorOverlapAnalysis, getMutualFundOverlap, SectorOverlapSummary } from '../services/sectorService';
import { formatINR } from '../utils/money';
import ThemeToggle from '../components/ThemeToggle';
import type { Asset } from '../models/types';
import { palette } from '../theme';

const SectorOverlapScreen: React.FC = () => {
  const { userId } = useApp();
  const theme = useTheme();
  const navigation = useNavigation();

  // Active tab selection
  const [activeTab, setActiveTab] = useState<'sectors' | 'stocks' | 'overlap'>('sectors');
  const [snackMsg, setSnackMsg] = useState<string | null>(null);

  // Fund overlap calculator states
  const [fund1Id, setFund1Id] = useState<string>('');
  const [fund2Id, setFund2Id] = useState<string>('');
  const [menu1Open, setMenu1Open] = useState(false);
  const [menu2Open, setMenu2Open] = useState(false);

  // Fetch active mutual funds for the user
  const activeFunds = useMemo(() => {
    if (!userId) return [];
    return all<Asset>(
      `SELECT a.* FROM assets a
       JOIN asset_types t ON t.id = a.asset_type_id
       WHERE a.user_id = ? AND t.slug = 'mutual_fund' AND a.current_value > 0`,
      [userId]
    );
  }, [userId]);

  // Load consolidated portfolio analysis
  const analysis: SectorOverlapSummary = useMemo(() => {
    if (!userId) {
      return {
        total_equity_value: 0,
        sector_allocation: [],
        stock_concentration: [],
        alerts: []
      };
    }
    return getSectorOverlapAnalysis(userId);
  }, [userId]);

  // Calculate fund overlap result
  const overlapResult = useMemo(() => {
    const fund1 = activeFunds.find((f) => f.id === fund1Id);
    const fund2 = activeFunds.find((f) => f.id === fund2Id);

    if (!fund1 || !fund2) return null;

    return getMutualFundOverlap(fund1.isin || '', fund2.isin || '', fund1.name, fund2.name);
  }, [fund1Id, fund2Id, activeFunds]);

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

  // Helper for sector colors
  const getSectorColor = (sector: string, index: number) => {
    const colors = [
      theme.colors.primary, // Financial Services
      '#7C3AED', // IT
      '#D97706', // Energy
      '#059669', // Capital Goods
      '#DC2626', // Chemicals
      '#0284C7', // Healthcare
      '#EC4899', // Consumer Goods
      '#8B5CF6', // Telecommunications
    ];
    return colors[index % colors.length];
  };

  const hasEquity = analysis.total_equity_value > 0;

  return (
    <>
      <Screen>
        {/* KPI Scoreboard */}
        <Row style={{ marginBottom: 12 }} gap={10}>
          <Kpi
            label="Equity Portfolio"
            value={formatINR(analysis.total_equity_value)}
            subTone="good"
            sub="Stocks & Funds"
          />
          <Kpi
            label="Sectors Covered"
            value={hasEquity ? `${analysis.sector_allocation.length} Sectors` : '0 Sectors'}
            subTone="muted"
            sub="Diversification"
          />
        </Row>

        {/* Top Concentration Alerts Banner */}
        {hasEquity && analysis.alerts.length > 0 && (
          <View style={{ gap: 8, marginBottom: 16 }}>
            {analysis.alerts.map((alert, index) => (
              <Card
                key={index}
                style={{
                  backgroundColor: alert.severity === 'warn' ? (theme.dark ? '#3A201C' : '#FEF2F2') : theme.colors.elevation.level1,
                  borderColor: alert.severity === 'warn' ? '#F87171' : theme.colors.outlineVariant,
                  borderWidth: 1,
                  borderRadius: theme.roundness,
                }}
              >
                <Card.Content style={{ paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <MaterialCommunityIcons
                    name={alert.severity === 'warn' ? 'alert-decagram' : 'information'}
                    size={24}
                    color={alert.severity === 'warn' ? palette.danger : theme.colors.primary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="labelMedium" style={{ fontWeight: '700', color: alert.severity === 'warn' ? palette.danger : theme.colors.onSurface }}>
                      {alert.title}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, marginTop: 1 }}>
                      {alert.text}
                    </Text>
                  </View>
                </Card.Content>
              </Card>
            ))}
          </View>
        )}

        {/* Tab Navigation selector */}
        <SegmentedButtons
          value={activeTab}
          onValueChange={(v) => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setActiveTab(v as any);
          }}
          buttons={[
            { value: 'sectors', label: 'Sectors', labelStyle: { fontSize: 12, fontWeight: '600' } },
            { value: 'stocks', label: 'Concentration', labelStyle: { fontSize: 12, fontWeight: '600' } },
            { value: 'overlap', label: 'Overlap', labelStyle: { fontSize: 12, fontWeight: '600' } },
          ]}
          style={{ marginBottom: 16 }}
        />

        {/* 1. SECTOR ALLOCATION TAB */}
        {activeTab === 'sectors' && (
          <View style={{ gap: 16 }}>
            <SectionCard title="True Sector Breakdown">
              {!hasEquity ? (
                <EmptyState
                  icon="chart-pie"
                  title="No Equity Assets"
                  message="Add Stocks or Mutual Funds under Assets to view your consolidated sector concentration analysis."
                />
              ) : (
                <View style={{ gap: 14 }}>
                  {analysis.sector_allocation.map((item, index) => (
                    <View key={item.sector}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <Text variant="bodySmall" style={{ fontWeight: '600', color: theme.colors.onSurface }}>
                          {item.sector}
                        </Text>
                        <Text variant="bodySmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant }}>
                          {formatINR(item.amount)} ({item.pct}%)
                        </Text>
                      </View>
                      <ProgressBar pct={item.pct} color={getSectorColor(item.sector, index)} height={6} />
                    </View>
                  ))}
                </View>
              )}
            </SectionCard>
          </View>
        )}

        {/* 2. CONSOLIDATED STOCK CONCENTRATION TAB */}
        {activeTab === 'stocks' && (
          <View style={{ gap: 16 }}>
            <SectionCard title="Top Consolidated Holdings">
              {!hasEquity ? (
                <EmptyState
                  icon="chart-timeline-variant"
                  title="No Equity Assets"
                  message="Add Stocks or Mutual Funds under Assets to view your consolidated stock exposure analysis."
                />
              ) : (
                <View style={{ gap: 14 }}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                    Below are the top underlying companies you own across both direct stock purchases and indirect holdings inside mutual funds.
                  </Text>
                  {analysis.stock_concentration.map((item) => {
                    const hasDirect = item.direct > 0;
                    const hasIndirect = item.indirect > 0;
                    const breakdownParts = [];
                    if (hasDirect) breakdownParts.push(`Direct: ${formatINR(item.direct)}`);
                    if (hasIndirect) breakdownParts.push(`Indirect: ${formatINR(item.indirect)}`);
                    const breakdownText = breakdownParts.join(' · ');

                    return (
                      <View key={item.stock} style={{ gap: 2 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1, marginRight: 12 }}>
                            <Text variant="bodySmall" style={{ fontWeight: '700', color: theme.colors.onSurface }} numberOfLines={1}>
                              {item.stock}
                            </Text>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 10.5 }}>
                              {breakdownText}
                            </Text>
                          </View>
                          <Text variant="bodySmall" style={{ fontWeight: '800', color: theme.colors.primary, textAlign: 'right' }}>
                            {formatINR(item.total)} ({item.pct}%)
                          </Text>
                        </View>
                        <ProgressBar pct={item.pct} color={theme.colors.primary} height={4} />
                      </View>
                    );
                  })}
                </View>
              )}
            </SectionCard>
          </View>
        )}

        {/* 3. MUTUAL FUND OVERLAP TAB */}
        {activeTab === 'overlap' && (
          <View style={{ gap: 16 }}>
            <SectionCard title="Mutual Fund Overlap Calculator">
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                Select two of your active mutual funds to calculate their common holdings and evaluate overlap concentration risk.
              </Text>

              {activeFunds.length < 2 ? (
                <EmptyState
                  icon="compare"
                  title="Insufficient Mutual Funds"
                  message="You need at least two active mutual fund assets in your portfolio to run the overlap analysis."
                />
              ) : (
                <View style={{ gap: 14 }}>
                  {/* Selectors */}
                  <Row gap={8}>
                    {/* Fund 1 */}
                    <View style={{ flex: 1 }}>
                      <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                        Fund 1
                      </Text>
                      <Menu
                        visible={menu1Open}
                        onDismiss={() => setMenu1Open(false)}
                        anchor={
                          <Button
                            mode="outlined"
                            compact
                            icon="chevron-down"
                            onPress={() => setMenu1Open(true)}
                            contentStyle={{ justifyContent: 'space-between', flexDirection: 'row-reverse', height: 40 }}
                            labelStyle={{ fontSize: 11 }}
                            style={{ width: '100%', borderColor: theme.colors.outline }}
                          >
                            {activeFunds.find((f) => f.id === fund1Id)?.name || 'Select Fund'}
                          </Button>
                        }
                      >
                        {activeFunds.map((f) => (
                          <Menu.Item
                            key={f.id}
                            title={f.name}
                            onPress={() => {
                              setFund1Id(f.id);
                              setMenu1Open(false);
                            }}
                          />
                        ))}
                      </Menu>
                    </View>

                    {/* Fund 2 */}
                    <View style={{ flex: 1 }}>
                      <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                        Fund 2
                      </Text>
                      <Menu
                        visible={menu2Open}
                        onDismiss={() => setMenu2Open(false)}
                        anchor={
                          <Button
                            mode="outlined"
                            compact
                            icon="chevron-down"
                            onPress={() => setMenu2Open(true)}
                            contentStyle={{ justifyContent: 'space-between', flexDirection: 'row-reverse', height: 40 }}
                            labelStyle={{ fontSize: 11 }}
                            style={{ width: '100%', borderColor: theme.colors.outline }}
                          >
                            {activeFunds.find((f) => f.id === fund2Id)?.name || 'Select Fund'}
                          </Button>
                        }
                      >
                        {activeFunds.map((f) => (
                          <Menu.Item
                            key={f.id}
                            title={f.name}
                            onPress={() => {
                              setFund2Id(f.id);
                              setMenu2Open(false);
                            }}
                          />
                        ))}
                      </Menu>
                    </View>
                  </Row>

                  {/* Overlap Result */}
                  {overlapResult ? (
                    <View style={{ gap: 14, marginTop: 10 }}>
                      <Divider />
                      
                      {/* Overlap Percentage Card */}
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: theme.colors.surfaceVariant,
                        padding: 16,
                        borderRadius: theme.roundness,
                        borderWidth: 1,
                        borderColor: theme.colors.outlineVariant,
                      }}>
                        <View style={{ flex: 1, marginRight: 12 }}>
                          <Text variant="titleMedium" style={{ fontWeight: '800', color: theme.colors.onSurface }}>
                            Portfolio Overlap
                          </Text>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                            {overlapResult.overlap_pct > 30.0
                              ? 'High overlap detected. These funds hold highly redundant stock exposures. Consider consolidating.'
                              : 'Good diversification. These funds have complementary portfolios with low common holdings.'}
                          </Text>
                        </View>
                        <View style={{
                          backgroundColor: overlapResult.overlap_pct > 30.0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          paddingVertical: 10,
                          paddingHorizontal: 16,
                          borderRadius: 20,
                        }}>
                          <Text style={{
                            fontSize: 20,
                            fontWeight: '800',
                            color: overlapResult.overlap_pct > 30.0 ? palette.danger : palette.good
                          }}>
                            {overlapResult.overlap_pct}%
                          </Text>
                        </View>
                      </View>

                      {/* Common Holdings List */}
                      <Text variant="titleSmall" style={{ fontWeight: '700', color: theme.colors.onSurface, marginTop: 6 }}>
                        Common Stock Holdings ({overlapResult.common_holdings.length})
                      </Text>
                      {overlapResult.common_holdings.length === 0 ? (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic' }}>
                          No common stock holdings found between these two funds.
                        </Text>
                      ) : (
                        <View style={{ gap: 10 }}>
                          {overlapResult.common_holdings.map((h, idx) => (
                            <View key={`${h.stock}-${idx}`} style={{
                              padding: 10,
                              backgroundColor: theme.colors.background,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: theme.colors.outlineVariant,
                              gap: 6
                            }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text variant="bodySmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                                  {h.stock}
                                </Text>
                                <Text variant="bodySmall" style={{ fontWeight: '800', color: theme.colors.primary }}>
                                  Overlap: {h.common_weight}%
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                                  Weight in Fund 1: {h.weight1}%
                                </Text>
                                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                                  Weight in Fund 2: {h.weight2}%
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                      <MaterialCommunityIcons name="compare-horizontal" size={32} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.5 }} />
                      <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 6 }}>
                        Select Fund 1 and Fund 2 to run the comparison
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </SectionCard>
          </View>
        )}
      </Screen>

      <Snackbar
        visible={snackMsg !== null}
        onDismiss={() => setSnackMsg(null)}
        duration={2500}
      >
        {snackMsg}
      </Snackbar>
    </>
  );
};

export default SectorOverlapScreen;
