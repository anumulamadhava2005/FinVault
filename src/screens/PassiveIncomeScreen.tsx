import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState, useMemo, useLayoutEffect } from 'react';
import { LayoutAnimation, Platform, ScrollView, View, Alert } from 'react-native';
import { Button, Card, Dialog, FAB, Portal, Menu, TextInput, useTheme, Snackbar, Divider, Text, SegmentedButtons, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState, Kpi, LineItem, ProgressBar, Row, Screen, SectionCard } from '../components/ui';
import { useApp } from '../context/AppContext';
import { all, insert, remove, newId } from '../db';
import { getPassiveIncomeSummary, PassiveIncomeSummary } from '../services/passiveIncomeService';
import { formatINR, rupeesToPaise } from '../utils/money';
import { formatDisplayDate, localISODate, parseISO, todayISO } from '../utils/date';
import ThemeToggle from '../components/ThemeToggle';
import type { Asset } from '../models/types';
import { palette } from '../theme';

const PassiveIncomeScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'history'>('overview');
  const [snackMsg, setSnackMsg] = useState<string | null>(null);

  // Modal / Dialog form states
  const [logOpen, setLogOpen] = useState(false);
  const [assetMenuOpen, setAssetMenuOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const [form, setForm] = useState<{
    asset_id: string;
    amount: string;
    date: string;
    notes: string;
  }>({
    asset_id: '',
    amount: '',
    date: todayISO(),
    notes: '',
  });

  // Fetch active assets for the user to select in the manual log dialog
  const activeAssets = useMemo(() => {
    if (!userId) return [];
    return all<Asset & { slug: string; type_name: string }>(
      `SELECT a.*, t.slug, t.name AS type_name FROM assets a
       JOIN asset_types t ON t.id = a.asset_type_id
       WHERE a.user_id = ? AND a.invested_amount > 0`,
      [userId]
    );
  }, [userId, logOpen]); // Refresh list when dialog opens

  const selectedAsset = useMemo(() => {
    return activeAssets.find((a) => a.id === form.asset_id);
  }, [form.asset_id, activeAssets]);

  // Load summary metrics from service
  const summary: PassiveIncomeSummary = useMemo(() => {
    if (!userId) {
      return {
        received_this_year: 0,
        forecasted_12m: 0,
        next_payout: null,
        received_by_source: { dividends: 0, fd_interest: 0, sgb_interest: 0, ppf_interest: 0, savings_interest: 0 },
        forecast_by_source: { dividends: 0, fd_interest: 0, sgb_interest: 0, ppf_interest: 0, savings_interest: 0 },
        received_list: [],
        forecast_timeline: [],
      };
    }
    return getPassiveIncomeSummary(userId);
  }, [userId, snackMsg]); // Refresh summary on success/actions

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

  const handleAssetSelect = (assetId: string) => {
    setForm((f) => ({ ...f, asset_id: assetId }));
    setAssetMenuOpen(false);
  };

  const handleDateChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS !== 'web') setDatePickerOpen(false);
    if (!selectedDate) return;
    setForm((f) => ({ ...f, date: localISODate(selectedDate) }));
  };

  const validateAndSave = () => {
    if (!selectedAsset) {
      Alert.alert('Validation Error', 'Please select an investment asset.');
      return;
    }
    const paise = rupeesToPaise(form.amount);
    if (paise <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid amount greater than 0.');
      return;
    }

    const slug = selectedAsset.slug;
    let eventType = 'interest';
    let subtype = 'Other Passive Income';

    if (slug === 'equity' || slug === 'mutual_fund') {
      eventType = 'dividend';
      subtype = 'Stock Dividend';
    } else if (slug === 'fd') {
      subtype = 'FD Interest';
    } else if (slug === 'sgb') {
      subtype = 'SGB Interest';
    } else if (slug === 'ppf') {
      subtype = 'PPF Interest';
    } else if (slug === 'savings') {
      subtype = 'Savings Interest';
    }

    try {
      insert('history_events', {
        id: newId(),
        user_id: userId!,
        category: 'asset',
        event_type: eventType,
        ref_id: selectedAsset.id,
        name: selectedAsset.name,
        subtype,
        event_date: form.date,
        amount: paise,
        pnl: 0,
        status: 'Received',
        notes: form.notes.trim() || null,
        details_json: null,
        created_at: new Date().toISOString(),
      });

      setSnackMsg('Income logged successfully');
      setLogOpen(false);
      setForm({ asset_id: '', amount: '', date: todayISO(), notes: '' });
      refresh();
    } catch (err) {
      Alert.alert('Database Error', 'Could not save passive income. Please try again.');
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Income',
      'Are you sure you want to delete this received income entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try {
              remove('history_events', id);
              setSnackMsg('Income entry deleted');
              refresh();
            } catch (err) {
              Alert.alert('Database Error', 'Could not delete entry.');
            }
          },
        },
      ]
    );
  };

  // Helper for source icon mapping
  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'dividend':
        return 'chart-line-variant';
      case 'fd_interest':
        return 'safe';
      case 'sgb_interest':
        return 'gold';
      case 'ppf_interest':
        return 'piggy-bank';
      case 'savings_interest':
        return 'bank';
      default:
        return 'cash';
    }
  };

  const getSourceColor = (type: string) => {
    switch (type) {
      case 'dividend':
        return theme.colors.primary;
      case 'fd_interest':
        return '#0284C7';
      case 'sgb_interest':
        return '#D97706';
      case 'ppf_interest':
        return '#059669';
      case 'savings_interest':
        return '#7C3AED';
      default:
        return theme.colors.secondary;
    }
  };

  // Source breakdown calculations
  const totalReceived = summary.received_this_year;
  const breakdownData = useMemo(() => {
    const { dividends, fd_interest, sgb_interest, ppf_interest, savings_interest } = summary.received_by_source;
    const total = dividends + fd_interest + sgb_interest + ppf_interest + savings_interest;
    const list = [
      { key: 'dividend', label: 'Stock Dividends', value: dividends },
      { key: 'fd_interest', label: 'FD Interest', value: fd_interest },
      { key: 'sgb_interest', label: 'SGB Interest', value: sgb_interest },
      { key: 'ppf_interest', label: 'PPF Interest', value: ppf_interest },
      { key: 'savings_interest', label: 'Savings Interest', value: savings_interest },
    ];
    return list.map((item) => ({
      ...item,
      pct: total > 0 ? Math.round((item.value / total) * 100) : 0,
    }));
  }, [summary]);

  return (
    <>
      <Screen>
        {/* Scoreboard Cards */}
        <Row style={{ marginBottom: 12 }} gap={10}>
          <Kpi
            label="Received (Current FY)"
            value={formatINR(summary.received_this_year)}
            subTone="good"
            sub="Passive cashflow"
          />
          <Kpi
            label="Projected (Next 12M)"
            value={formatINR(summary.forecasted_12m)}
            subTone="muted"
            sub="Auto-forecasted"
          />
        </Row>

        {summary.next_payout && (
          <Card
            style={{
              backgroundColor: theme.colors.elevation.level1,
              borderColor: theme.colors.outlineVariant,
              borderWidth: 1,
              borderRadius: theme.roundness,
              marginBottom: 16,
            }}
          >
            <Card.Content style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="clock-outline" size={20} color={theme.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    Next Expected Payout
                  </Text>
                  <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                    {formatINR(summary.next_payout.amount)} from {summary.next_payout.asset_name}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {summary.next_payout.type_label} · Due {formatDisplayDate(summary.next_payout.date)}
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Tab Navigation selector */}
        <SegmentedButtons
          value={activeTab}
          onValueChange={(v) => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setActiveTab(v as any);
          }}
          buttons={[
            { value: 'overview', label: 'Overview', labelStyle: { fontSize: 12, fontWeight: '600' } },
            { value: 'timeline', label: 'Upcoming', labelStyle: { fontSize: 12, fontWeight: '600' } },
            { value: 'history', label: 'History', labelStyle: { fontSize: 12, fontWeight: '600' } },
          ]}
          style={{ marginBottom: 16 }}
        />

        {/* 1. OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <View style={{ gap: 16 }}>
            <SectionCard title="Passive Income Distribution">
              {totalReceived === 0 ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingVertical: 20 }}>
                  No passive income received in this Financial Year yet. Log an entry to see your breakdown.
                </Text>
              ) : (
                <View style={{ gap: 12 }}>
                  {breakdownData.map((item) => (
                    <View key={item.key}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <MaterialCommunityIcons name={getSourceIcon(item.key) as any} size={16} color={getSourceColor(item.key)} />
                          <Text variant="bodySmall" style={{ fontWeight: '600', color: theme.colors.onSurface }}>
                            {item.label}
                          </Text>
                        </View>
                        <Text variant="bodySmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant }}>
                          {formatINR(item.value)} ({item.pct}%)
                        </Text>
                      </View>
                      <ProgressBar pct={item.pct} color={getSourceColor(item.key)} height={6} />
                    </View>
                  ))}
                </View>
              )}
            </SectionCard>

            <SectionCard title="Passive Income Assets Summary">
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                Auto-payout forecasts are generated from the interest/coupon rates and maturity dates configured on your active assets.
              </Text>
              <View style={{ gap: 8 }}>
                {activeAssets.length === 0 ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic' }}>
                    No active interest-bearing or dividend-paying assets found.
                  </Text>
                ) : (
                  activeAssets.map((asset) => {
                    const rate = asset.guaranteed_return_pct;
                    const hasRate = rate !== undefined && rate !== null && rate > 0;
                    return (
                      <LineItem
                        key={asset.id}
                        label={`${asset.name} (${asset.type_name})`}
                        value={hasRate ? `${rate.toFixed(2)}% p.a.` : 'Stock/Mutual Fund'}
                        valueColor={hasRate ? theme.colors.primary : theme.colors.onSurfaceVariant}
                      />
                    );
                  })
                )}
              </View>
            </SectionCard>
          </View>
        )}

        {/* 2. UPCOMING TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <View style={{ gap: 12 }}>
            <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
              12-Month Forecast Timeline ({summary.forecast_timeline.length})
            </Text>
            {summary.forecast_timeline.length === 0 ? (
              <EmptyState
                icon="calendar-blank"
                title="No Upcoming Payouts"
                message="Add maturity dates or interest rates to your FDs, SGBs, PPFs, or Savings accounts to auto-project upcoming payouts."
              />
            ) : (
              <View style={{ gap: 10 }}>
                {summary.forecast_timeline.map((item, index) => (
                  <Card
                    key={`${item.asset_name}-${item.date}-${index}`}
                    style={{
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.outlineVariant,
                      borderWidth: 1,
                      elevation: 0,
                    }}
                  >
                    <Card.Content style={{ padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, gap: 2, marginRight: 12 }}>
                        <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                          {item.asset_name}
                        </Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {item.type_label} · Expected {formatDisplayDate(item.date)}
                        </Text>
                      </View>
                      <Text variant="titleMedium" style={{ fontWeight: '800', color: getSourceColor(item.type) }}>
                        {formatINR(item.amount)}
                      </Text>
                    </Card.Content>
                  </Card>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 3. HISTORY RECEIVED TAB */}
        {activeTab === 'history' && (
          <View style={{ gap: 12 }}>
            <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
              Received Passive Income ({summary.received_list.length})
            </Text>
            {summary.received_list.length === 0 ? (
              <EmptyState
                icon="cash-multiple"
                title="No Income Logged Yet"
                message="Tap the floating button below to manually log dividends, interest payouts, or other passive income receipts."
              />
            ) : (
              <View style={{ gap: 10 }}>
                {summary.received_list.map((item) => (
                  <Card
                    key={item.id}
                    style={{
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.outlineVariant,
                      borderWidth: 1,
                      elevation: 0,
                    }}
                  >
                    <Card.Content style={{ padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1, gap: 2, marginRight: 12 }}>
                        <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                          {item.name}
                        </Text>
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {item.type_label} · Received {formatDisplayDate(item.date)}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text variant="titleMedium" style={{ fontWeight: '800', color: palette.good }}>
                          {formatINR(item.amount)}
                        </Text>
                        <IconButton
                          icon="delete-outline"
                          size={18}
                          iconColor={theme.colors.error}
                          style={{ margin: 0 }}
                          onPress={() => handleDelete(item.id)}
                        />
                      </View>
                    </Card.Content>
                  </Card>
                ))}
              </View>
            )}
          </View>
        )}
      </Screen>

      {/* Floating Log Button */}
      <FAB
        icon="plus"
        label="Log Income"
        style={{
          position: 'absolute',
          right: 16,
          bottom: Math.max(insets.bottom, 16) + 16,
          backgroundColor: theme.colors.primary,
        }}
        color={theme.colors.onPrimary}
        onPress={() => {
          if (activeAssets.length === 0) {
            Alert.alert('No Active Assets', 'You need active investment assets to log passive income. Please add investments first.');
            return;
          }
          setLogOpen(true);
        }}
      />

      {/* Log Income Dialog */}
      <Portal>
        <Dialog
          visible={logOpen}
          onDismiss={() => {
            setLogOpen(false);
            setForm({ asset_id: '', amount: '', date: todayISO(), notes: '' });
          }}
          style={{ backgroundColor: theme.colors.surface, borderRadius: theme.roundness }}
        >
          <Dialog.Title style={{ fontWeight: '700' }}>Log Received Income</Dialog.Title>
          <Dialog.Content style={{ gap: 14 }}>
            <View>
              <Text variant="labelMedium" style={{ marginBottom: 4, fontWeight: '600', color: theme.colors.onSurfaceVariant }}>
                Investment Asset *
              </Text>
              <Menu
                visible={assetMenuOpen}
                onDismiss={() => setAssetMenuOpen(false)}
                anchor={
                  <Button
                    mode="outlined"
                    onPress={() => setAssetMenuOpen(true)}
                    contentStyle={{ justifyContent: 'space-between', flexDirection: 'row-reverse' }}
                    style={{ width: '100%', borderColor: theme.colors.outline }}
                  >
                    {selectedAsset ? `${selectedAsset.name} (${selectedAsset.type_name})` : 'Select Asset'}
                  </Button>
                }
              >
                {activeAssets.map((asset) => (
                  <Menu.Item
                    key={asset.id}
                    title={`${asset.name} (${asset.type_name})`}
                    onPress={() => handleAssetSelect(asset.id)}
                  />
                ))}
              </Menu>
            </View>

            <TextInput
              label="Amount Received (₹) *"
              value={form.amount}
              onChangeText={(t) => setForm((f) => ({ ...f, amount: t }))}
              keyboardType="numeric"
              mode="outlined"
              style={{ backgroundColor: theme.colors.surface }}
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text variant="labelMedium" style={{ fontWeight: '600', color: theme.colors.onSurfaceVariant }}>
                  Date Received
                </Text>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, marginTop: 2 }}>
                  {formatDisplayDate(form.date)}
                </Text>
              </View>
              <Button mode="outlined" onPress={() => setDatePickerOpen(true)} style={{ borderColor: theme.colors.outline }}>
                Change Date
              </Button>
            </View>

            {datePickerOpen && (
              <DateTimePicker
                value={parseISO(form.date) || new Date()}
                mode="date"
                display="default"
                onChange={handleDateChange}
                maximumDate={new Date()}
              />
            )}

            <TextInput
              label="Notes (Optional)"
              value={form.notes}
              onChangeText={(t) => setForm((f) => ({ ...f, notes: t }))}
              mode="outlined"
              multiline
              numberOfLines={2}
              style={{ backgroundColor: theme.colors.surface }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setLogOpen(false);
                setForm({ asset_id: '', amount: '', date: todayISO(), notes: '' });
              }}
            >
              Cancel
            </Button>
            <Button mode="contained" onPress={validateAndSave}>
              Save Entry
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackMsg !== null}
        onDismiss={() => setSnackMsg(null)}
        duration={2500}
        style={{ marginBottom: 80 }}
      >
        {snackMsg}
      </Snackbar>
    </>
  );
};

export default PassiveIncomeScreen;
