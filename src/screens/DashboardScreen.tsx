import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import BouncePressable from '../components/BouncePressable';
import NotificationBell from '../components/NotificationBell';
import ThemeToggle from '../components/ThemeToggle';
import BillScanModal from '../components/BillScanModal';
import { DistributionPie, TrendLine } from '../components/charts';
import { Kpi, LineItem, ProgressBar, Row, SectionCard } from '../components/ui';
import { useApp } from '../context/AppContext';
import { newId, tx } from '../db';
import { useData } from '../hooks/useData';
import {
  financialHealth,
  goalsProgress,
  incomeExpenseSeries,
  netWorth,
  portfolioSummary,
  spendingInsights,
  upcomingSips,
} from '../services/finance';
import { generateAllNotifications } from '../services/notificationService';
import { captureNetWorthSnapshot } from '../services/wealthRecap';
import { refreshMarketData } from '../services/marketFeeds';
import { chartColors, palette, statusColor } from '../theme';
import { addMonths, localISODate, parseISO } from '../utils/date';
import { formatINR, formatINRCompact, scoreColor } from '../utils/money';

const CollapsibleCard: React.FC<{
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, isExpanded, onToggle, right, children }) => {
  const theme = useTheme();
  return (
    <View style={{
      borderColor: theme.colors.outline,
      borderWidth: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.roundness,
      overflow: 'hidden',
    }}>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 14,
          paddingHorizontal: 18,
          backgroundColor: theme.colors.surface,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <MaterialCommunityIcons
            name={isExpanded ? 'chevron-down' : 'chevron-right'}
            size={20}
            color={theme.colors.onSurfaceVariant}
          />
          <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface, flex: 1 }}>
            {title}
          </Text>
        </View>
        {right}
      </TouchableOpacity>
      {isExpanded && (
        <View style={{ padding: 18, paddingTop: 0 }}>
          <View style={{ height: 1, backgroundColor: theme.colors.outlineVariant, marginBottom: 14 }} />
          {children}
        </View>
      )}
    </View>
  );
};

const DashboardScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();

  // The Dashboard is the unified notification hub: aggregate alerts from every
  // module (assets, expenses, goals, loans, insurance) whenever data changes.
  useData(() => {
    const now = new Date();
    try { generateAllNotifications(userId!, now.getFullYear(), now.getMonth() + 1); } catch { /* non-critical */ }
    try { captureNetWorthSnapshot(userId!); } catch { /* non-critical */ }
    return null;
  });

  // Keep the live market snapshot warm for the Insights/Feed screens.
  useEffect(() => {
    refreshMarketData().catch(() => { /* offline — cached values are used */ });
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
          <ThemeToggle color={theme.colors.onSurface} />
          <NotificationBell color={theme.colors.onSurface} />
        </View>
      ),
    });
  }, [navigation, theme]);

  // Bill-scan (Log Expense) modal
  const [scanOpen, setScanOpen] = useState(false);

  // Collapsible states
  const [expIncExp, setExpIncExp] = useState(false);
  const [expInsights, setExpInsights] = useState(false);
  const [expAllocation, setExpAllocation] = useState(false);

  const nw = useData(() => netWorth(userId!));
  const pf = useData(() => portfolioSummary(userId!));
  const health = useData(() => financialHealth(userId!));
  const ie = useData(() => incomeExpenseSeries(userId!, 6));
  const goals = useData(() => goalsProgress(userId!));
  const upcoming = useData(() => upcomingSips(userId!));
  const insights = useData(() => spendingInsights(userId!));

  // Staggered entry animations for 10 main section items
  const anims = useRef(Array.from({ length: 10 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = anims.map((anim) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 220,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        useNativeDriver: true,
      })
    );
    Animated.stagger(40, animations).start();
  }, []);

  const getAnimatedStyle = (index: number) => {
    const opacity = anims[index];
    const translateY = anims[index].interpolate({
      inputRange: [0, 1],
      outputRange: [10, 0],
    });

    // Gestalt boundary spacing (24px instead of 16px between logical groups)
    let marginBottom = 16;
    if (index === 0) {
      // End of Net Worth Card / Hero group
      marginBottom = 24;
    } else if (index === 6) {
      // End of Cash Flow group (Spending Insights is last in Cash Flow group)
      marginBottom = 24;
    } else if (index === 7) {
      // End of Wealth & Investments group (Asset Allocation is last in Wealth & Investments group)
      marginBottom = 24;
    }

    return {
      opacity,
      transform: [{ translateY }],
      marginBottom,
    };
  };

  const healthTone = health.score >= 60 ? 'good' : health.score >= 40 ? 'warn' : 'bad';

  const getSpendColor = (utilized: number) => {
    if (utilized > 100) return palette.danger;
    if (utilized > 75) return '#E0922B'; // Warning orange
    return palette.good; // Good green
  };

  let comparisonText = 'Tracking your spending this month.';
  if (insights.prev_total > 0) {
    const diff = Math.round(((insights.month_total - insights.prev_total) / insights.prev_total) * 100);
    const direction = diff >= 0 ? 'increased' : 'decreased';
    comparisonText = `Spending ${direction} ${Math.abs(diff)}% this month vs last month.`;
  }

  // Relative / friendly date formatting for upcoming SIPs
  const formatSIPDueDate = (dueDateStr: string | null) => {
    if (!dueDateStr) return '—';
    const due = parseISO(dueDateStr);
    if (!due) return dueDateStr;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    if (diffDays === -1) return 'Overdue by 1 day';
    if (diffDays < -1) return `Overdue by ${Math.abs(diffDays)} days`;
    if (diffDays <= 30) return `Due in ${diffDays} days`;

    return `Due ${due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
  };

  // Actions for Upcoming SIPs
  const handlePaySip = (sip: any) => {
    const d = parseISO(sip.next_due_date) || new Date();
    let monthsToAdd = 1;
    if (sip.frequency === 'quarterly') monthsToAdd = 3;
    else if (sip.frequency === 'half-yearly') monthsToAdd = 6;
    else if (sip.frequency === 'yearly') monthsToAdd = 12;

    const nextDate = addMonths(d, monthsToAdd);
    const nextDueDateStr = localISODate(nextDate);

    tx((db) => {
      // A. Find or create Investments category
      let catId = '';
      const cat = db.getFirstSync<{ id: string }>('SELECT id FROM expense_categories WHERE user_id = ? AND LOWER(name) = ?', [userId!, 'investments']);
      if (cat) {
        catId = cat.id;
      } else {
        catId = newId();
        db.runSync(
          `INSERT INTO expense_categories (id, user_id, name, is_system, budget_amount, sort_order, color_hex)
           VALUES (?, ?, 'Investments', 1, 0, 99, '#4A7C6F')`,
          [catId, userId!]
        );
      }

      // B. Insert expense transaction
      db.runSync(
        `INSERT INTO expenses (id, user_id, category_id, amount, description, expense_date)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newId(), userId!, catId, sip.amount, `SIP Payment - ${sip.asset_name}`, localISODate(new Date())]
      );

      // C. Update asset investment/current value
      db.runSync(
        `UPDATE assets SET invested_amount = invested_amount + ?, current_value = current_value + ? WHERE id = ?`,
        [sip.amount, sip.amount, sip.asset_id]
      );

      // D. Shift SIP schedule next due date
      db.runSync(
        `UPDATE sip_schedules SET next_due_date = ? WHERE id = ?`,
        [nextDueDateStr, sip.id]
      );
    });

    Alert.alert('SIP Paid', `Logged payment of ${formatINR(sip.amount)} to ${sip.asset_name}. Valuation updated.`);
    refresh();
  };

  const handleSkipSip = (sip: any) => {
    const d = parseISO(sip.next_due_date) || new Date();
    let monthsToAdd = 1;
    if (sip.frequency === 'quarterly') monthsToAdd = 3;
    else if (sip.frequency === 'half-yearly') monthsToAdd = 6;
    else if (sip.frequency === 'yearly') monthsToAdd = 12;

    const nextDate = addMonths(d, monthsToAdd);
    const nextDueDateStr = localISODate(nextDate);

    tx((db) => {
      db.runSync('UPDATE sip_schedules SET next_due_date = ? WHERE id = ?', [nextDueDateStr, sip.id]);
    });

    Alert.alert('SIP Skipped', `Skipped ${sip.asset_name}. Next due is ${formatSIPDueDate(nextDueDateStr)}.`);
    refresh();
  };

  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 12);

  // Cash flow net cash calculated
  const netCashFlow = health.monthly_income - health.monthly_expenses;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ================= HERO GROUP ================= */}
        {/* 0. Net Worth Card */}
        <Animated.View style={getAnimatedStyle(0)}>
          <View style={{
            padding: 20,
            borderRadius: theme.roundness,
            borderWidth: 1.5,
            borderColor: theme.dark ? '#2E2E2E' : theme.colors.outline,
            backgroundColor: theme.dark ? '#1F1F1F' : theme.colors.surface,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 8,
            elevation: 2,
          }}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600', letterSpacing: 0.5 }}>
              NET WORTH
            </Text>
            <Text style={{
              fontSize: 32,
              fontWeight: '800',
              color: nw.net_worth >= 0 ? palette.good : palette.danger,
              fontVariant: ['tabular-nums'],
              letterSpacing: -0.8,
              marginTop: 6,
            }}>
              {formatINR(nw.net_worth)}
            </Text>

            <Row style={{ marginTop: 18 }}>
              <Kpi label="Total Assets" value={formatINR(nw.total_assets)} subTone="good" sub="invested + growth" />
              <Kpi label="Liabilities" value={formatINR(nw.total_liabilities)} subTone="bad" sub="outstanding debt" />
            </Row>

            {/* Quick Summary Bar */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 14,
              marginTop: 14,
              borderTopWidth: 1,
              borderTopColor: theme.dark ? '#2E2E2E' : theme.colors.outlineVariant,
            }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                Savings Rate: <Text style={{ color: palette.good, fontWeight: '700' }}>{health.savings_rate}%</Text>
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                Goals: <Text style={{ color: palette.good, fontWeight: '700' }}>{goals.goals.filter(g => g.status === 'completed' || g.status === 'on_track').length}/{goals.goals.length}</Text>
              </Text>
              {upcoming.length > 0 ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                  Next SIP: <Text style={{ color: '#E0922B', fontWeight: '700' }}>{formatSIPDueDate(upcoming[0].next_due_date)}</Text>
                </Text>
              ) : (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                  No due SIPs
                </Text>
              )}
            </View>
          </View>
        </Animated.View>

        {/* ================= GROUP 1: CASH FLOW ================= */}
        {/* 3. Monthly Cashflow KPI Row */}
        <Animated.View style={getAnimatedStyle(3)}>
          <Row>
            <Kpi label="Income (mo)" value={formatINR(health.monthly_income)} />
            <Kpi label="Spent (mo)" value={formatINR(health.monthly_expenses)} />
          </Row>
        </Animated.View>

        {/* 4. Financial Health Card with Sparkline */}
        <Animated.View style={getAnimatedStyle(4)}>
          <SectionCard title="Financial Health">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
              <Text variant="displaySmall" style={{ fontWeight: '800', color: statusColor(healthTone), fontVariant: ['tabular-nums'], letterSpacing: -1 }}>
                {health.score}/100
              </Text>
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700' }}>
                  {health.rating}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
                    Savings rate {health.savings_rate}%
                  </Text>
                  {/* Mini Expense Sparkline Chart */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 18 }}>
                    {(() => {
                      const lastExpenses = ie.expenses.slice(-5);
                      const maxVal = Math.max(...lastExpenses) || 1;
                      return lastExpenses.map((v, idx) => {
                        const heightPct = Math.max((v / maxVal) * 100, 10);
                        const isLast = idx === lastExpenses.length - 1;
                        return (
                          <View
                            key={idx}
                            style={{
                              width: 5,
                              height: `${heightPct}%`,
                              borderRadius: 1.5,
                              backgroundColor: isLast ? theme.colors.primary : `${theme.colors.primary}40`,
                            }}
                          />
                        );
                      });
                    })()}
                  </View>
                </View>

                <ProgressBar pct={health.score} color={statusColor(healthTone)} />
              </View>
            </View>

            {/* Checklist elements for transparency */}
            <View style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              marginTop: 14,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: theme.colors.outlineVariant,
              justifyContent: 'space-between',
              rowGap: 6,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' }}>
                <MaterialCommunityIcons
                  name={health.savings_rate >= 30 ? 'check-circle' : 'alert-circle'}
                  size={14}
                  color={health.savings_rate >= 30 ? palette.good : '#E0922B'}
                />
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>Savings Rate</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' }}>
                <MaterialCommunityIcons
                  name={health.components.diversification >= 60 ? 'check-circle' : 'alert-circle'}
                  size={14}
                  color={health.components.diversification >= 60 ? palette.good : '#E0922B'}
                />
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>Diversification</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' }}>
                <MaterialCommunityIcons
                  name={health.components.risk_balance >= 60 ? 'check-circle' : 'alert-circle'}
                  size={14}
                  color={health.components.risk_balance >= 60 ? palette.good : '#E0922B'}
                />
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>Risk Balance</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' }}>
                <MaterialCommunityIcons
                  name={health.components.insurance >= 60 ? 'check-circle' : 'alert-circle'}
                  size={14}
                  color={health.components.insurance >= 60 ? palette.good : '#E0922B'}
                />
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>Insurance Protection</Text>
              </View>
            </View>

            <View style={{ marginTop: 12, gap: 6 }}>
              {health.insights.map((tip, i) => (
                <Text key={i} variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, lineHeight: 16 }}>
                  • {tip}
                </Text>
              ))}
            </View>
          </SectionCard>
        </Animated.View>

        {/* 6. Spending Insights Card (Collapsible) */}
        <Animated.View style={getAnimatedStyle(6)}>
          <CollapsibleCard
            title="Spending Insights"
            isExpanded={expInsights}
            onToggle={() => setExpInsights(!expInsights)}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {formatINRCompact(insights.month_total)}/month
                </Text>
              </View>
            }
          >
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 14, fontWeight: '500' }}>
              {comparisonText}
            </Text>

            <View style={{ gap: 12 }}>
              {insights.categories.map((c) => (
                <View key={c.id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                      {c.name}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                      {formatINR(c.amount)}
                      {c.budget > 0 ? (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '400' }}>
                          {' '}/ {formatINR(c.budget)}
                        </Text>
                      ) : null}
                    </Text>
                  </View>
                  <ProgressBar pct={c.budget > 0 ? Math.min(c.utilized, 100) : c.pct} color={c.budget > 0 ? getSpendColor(c.utilized) : palette.good} />
                </View>
              ))}
            </View>

            {insights.suggestion ? (
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: theme.colors.surfaceVariant,
                padding: 12,
                borderRadius: theme.roundness - 4,
                marginTop: 16,
                borderWidth: 1,
                borderColor: theme.colors.outline,
              }}>
                <MaterialCommunityIcons name="information-outline" size={18} color={theme.colors.primary} />
                <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant, fontWeight: '500', lineHeight: 16 }}>
                  {insights.suggestion}
                </Text>
              </View>
            ) : null}
          </CollapsibleCard>
        </Animated.View>

        {/* 5. Income vs Expense (6 mo) Chart (Collapsible) */}
        <Animated.View style={getAnimatedStyle(5)}>
          <CollapsibleCard
            title="Income vs Expense"
            isExpanded={expIncExp}
            onToggle={() => setExpIncExp(!expIncExp)}
            right={
              <Text variant="bodyMedium" style={{ color: netCashFlow >= 0 ? palette.good : palette.danger, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {netCashFlow >= 0 ? '+' : ''}{formatINRCompact(netCashFlow)}
              </Text>
            }
          >
            <View style={{ marginBottom: 12 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
                Recent monthly cache flows. Select expand to view historical trends.
              </Text>
            </View>
            <TrendLine
              labels={ie.labels}
              legend={['Income', 'Expense']}
              datasets={[
                { data: ie.income.map((v) => v / 100), color: chartColors.income },
                { data: ie.expenses.map((v) => v / 100), color: chartColors.expense },
              ]}
            />
          </CollapsibleCard>
        </Animated.View>

        {/* ================= GROUP 2: WEALTH & INVESTMENTS ================= */}
        {/* 1. Portfolio & Active SIP KPI Row */}
        <Animated.View style={getAnimatedStyle(1)}>
          <Row>
            <Kpi label="Portfolio" value={formatINR(pf.total_value)} sub={`${pf.pnl_pct}% P&L`} subTone={pf.total_pnl >= 0 ? 'good' : 'bad'} />
            <Kpi label="Active SIP Total" value={formatINR(pf.monthly_sip)} sub={`${pf.active_sips} active / month`} subTone="good" />
          </Row>
        </Animated.View>

        {/* 2. Upcoming SIPs List Card */}
        <Animated.View style={getAnimatedStyle(2)}>
          <SectionCard title="Upcoming SIPs">
            {upcoming.length > 0 ? (
              <View style={{ gap: 14 }}>
                {upcoming.map((sip) => (
                  <View
                    key={sip.id}
                    style={{
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.outlineVariant,
                      paddingBottom: 12,
                      marginBottom: 4,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${theme.colors.primary}15`, justifyContent: 'center', alignItems: 'center' }}>
                          <MaterialCommunityIcons name="autorenew" size={18} color={theme.colors.primary} />
                        </View>
                        <View>
                          <Text variant="titleSmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                            {sip.asset_name || 'SIP'}
                          </Text>
                          <Text variant="bodySmall" style={{ color: theme.dark ? '#B3B3B3' : theme.colors.onSurfaceVariant, fontSize: 11, fontWeight: '500' }}>
                            {formatSIPDueDate(sip.next_due_date)}
                          </Text>
                        </View>
                      </View>
                      <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}>
                        {formatINR(sip.amount)}
                      </Text>
                    </View>

                    {/* Action buttons (Paid / Skip) */}
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                      <BouncePressable
                        onPress={() => handleSkipSip(sip)}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 14,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: theme.colors.outline,
                          backgroundColor: theme.colors.surface,
                        }}
                      >
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', fontSize: 11 }}>Skip</Text>
                      </BouncePressable>
                      <BouncePressable
                        onPress={() => handlePaySip(sip)}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 14,
                          borderRadius: 6,
                          backgroundColor: palette.good,
                        }}
                      >
                        <Text variant="labelSmall" style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 11 }}>Paid</Text>
                      </BouncePressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ paddingVertical: 12, alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="check-decagram" size={28} color={palette.good} />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
                  All SIP schedules are fully up to date!
                </Text>
              </View>
            )}
          </SectionCard>
        </Animated.View>

        {/* 7. Asset Allocation Pie Chart (Collapsible) */}
        {pf.allocation.length > 0 && (
          <Animated.View style={getAnimatedStyle(7)}>
            <CollapsibleCard
              title="Asset Allocation"
              isExpanded={expAllocation}
              onToggle={() => setExpAllocation(!expAllocation)}
              right={
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {pf.allocation.length} Assets
                </Text>
              }
            >
              <DistributionPie data={pf.allocation.map((a, i) => ({ name: a.type, value: a.value / 100, color: ['#4A7C6F', '#7FB5A8', '#D4956A', '#2D3142', '#F0B429', '#52A77E'][i % 6] }))} />
            </CollapsibleCard>
          </Animated.View>
        )}

        {/* ================= GROUP 3: FUTURE GOALS ================= */}
        {/* 8. Goals Card */}
        <Animated.View style={getAnimatedStyle(8)}>
          <SectionCard title="Goals" right={<Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>{goals.goals.filter(g => g.status === 'completed' || g.status === 'on_track').length}/{goals.goals.length} on track</Text>}>
            {goals.goals.length > 0 ? (
              <View style={{ gap: 14 }}>
                {goals.goals.map((g) => (
                  <View key={g.id}>
                    <LineItem
                      label={g.name}
                      value={`${formatINRCompact(g.current)} / ${formatINRCompact(g.target_amount)} (${g.pct}%)`}
                    />
                    <View style={{ marginTop: 4 }}>
                      <ProgressBar pct={g.pct} color={statusColor(scoreColor(g.pct))} markerPct={g.expected_pct} />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={{ paddingVertical: 12, alignItems: 'center', gap: 10 }}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
                  No financial goals created yet.
                </Text>
                <BouncePressable
                  onPress={() => router.push('/goals' as any)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 16,
                    borderRadius: theme.roundness,
                    backgroundColor: theme.colors.primary,
                  }}
                >
                  <Text variant="labelSmall" style={{ color: theme.colors.onPrimary, fontWeight: '700' }}>
                    Create Goal
                  </Text>
                </BouncePressable>
              </View>
            )}
          </SectionCard>
        </Animated.View>
      </ScrollView>

      {/* Sticky Quick Actions at the bottom */}
      <Animated.View
        style={[{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderTopColor: theme.colors.outline,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: bottomPadding,
          flexDirection: 'row',
          gap: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 10,
        }, {
          opacity: anims[9],
          transform: [{
            translateY: anims[9].interpolate({
              inputRange: [0, 1],
              outputRange: [80, 0],
            })
          }]
        }]}
      >
        <View style={{ flex: 1 }}>
          <BouncePressable
            onPress={() => setScanOpen(true)}
            style={{
              backgroundColor: theme.colors.background,
              borderWidth: 1,
              borderColor: theme.colors.outline,
              borderRadius: theme.roundness,
              paddingVertical: 12,
              paddingHorizontal: 4,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <MaterialCommunityIcons name="camera-outline" size={16} color={palette.danger} />
            <Text variant="labelMedium" style={{ fontWeight: '700', color: theme.colors.onSurface, fontSize: 13 }} numberOfLines={1}>
              Scan Bill
            </Text>
          </BouncePressable>
        </View>

        <View style={{ flex: 1 }}>
          <BouncePressable
            onPress={() => router.push('/assets/add' as any)}
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: theme.roundness,
              paddingVertical: 12,
              paddingHorizontal: 4,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <MaterialCommunityIcons name="bank" size={16} color={theme.colors.onPrimary} />
            <Text variant="labelMedium" style={{ fontWeight: '700', color: theme.colors.onPrimary, fontSize: 13 }} numberOfLines={1}>
              Add Asset
            </Text>
          </BouncePressable>
        </View>
      </Animated.View>

      <BillScanModal visible={scanOpen} onClose={() => setScanOpen(false)} />
    </View>
  );
};

export default DashboardScreen;
