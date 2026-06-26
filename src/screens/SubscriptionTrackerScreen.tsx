import React, { useState, useMemo, useLayoutEffect } from 'react';
import { LayoutAnimation, ScrollView, View, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, SegmentedButtons, Text, useTheme, Snackbar, Divider, Button, TextInput, Menu, Portal, Dialog, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Kpi, Row, Screen, SectionCard, EmptyState, ProgressBar } from '../components/ui';
import { useApp } from '../context/AppContext';
import {
  getSubscriptions,
  addSubscription,
  editSubscription,
  deleteSubscription,
  toggleSubscriptionStatus,
  getSubscriptionSummary,
  getUpcomingRenewals,
  detectRecurringExpenses,
  type Subscription,
  type DetectedSubscription,
} from '../services/subscriptionService';
import { useData } from '../hooks/useData';
import { formatINR, formatINRCompact, rupeesToPaise } from '../utils/money';
import ThemeToggle from '../components/ThemeToggle';
import { palette } from '../theme';
import BouncePressable from '../components/BouncePressable';

const CATEGORIES = [
  { value: 'entertainment', label: 'Entertainment', icon: 'television-play', color: '#EF4444' },
  { value: 'music', label: 'Music Streaming', icon: 'music-note', color: '#10B981' },
  { value: 'cloud', label: 'Cloud & Software', icon: 'cloud-upload', color: '#3B82F6' },
  { value: 'utilities', label: 'Utilities & Internet', icon: 'wifi', color: '#F59E0B' },
  { value: 'fitness', label: 'Fitness & Health', icon: 'heart-pulse', color: '#EC4899' },
  { value: 'other', label: 'Other Services', icon: 'tag-outline', color: '#8B5CF6' },
];

const CATEGORY_META = Object.fromEntries(CATEGORIES.map((c) => [c.value, c]));

const blankForm = {
  name: '',
  amount: '',
  billing_cycle: 'monthly' as 'monthly' | 'quarterly' | 'yearly',
  next_billing_date: '',
  category: 'entertainment',
  notes: '',
};

const SubscriptionTrackerScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const navigation = useNavigation();

  const [activeTab, setActiveTab] = useState<'active' | 'upcoming' | 'detect'>('active');
  const [snackMsg, setSnackMsg] = useState<string | null>(null);

  // Dialog and form states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSubId, setEditSubId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...blankForm });
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Data Queries
  const subscriptions = useData(() => (userId ? getSubscriptions(userId) : []));
  const summary = useData(() => (userId ? getSubscriptionSummary(userId) : { monthlyTotal: 0, yearlyTotal: 0, count: 0 }));
  const upcomingRenewals = useData(() => (userId ? getUpcomingRenewals(userId, 30) : []));
  const detectedSuggestions = useData(() => (userId ? detectRecurringExpenses(userId) : []));

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

  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const handleOpenAddDialog = () => {
    setForm({
      name: '',
      amount: '',
      billing_cycle: 'monthly',
      next_billing_date: new Date().toISOString().split('T')[0],
      category: 'entertainment',
      notes: '',
    });
    setEditSubId(null);
    setDialogOpen(true);
  };

  const handleOpenEditDialog = (sub: Subscription) => {
    setForm({
      name: sub.name,
      amount: String(sub.amount / 100),
      billing_cycle: sub.billing_cycle,
      next_billing_date: sub.next_billing_date,
      category: sub.category,
      notes: sub.notes || '',
    });
    setEditSubId(sub.id);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.amount.trim() || !form.next_billing_date.trim()) {
      setSnackMsg('Please fill out all required fields.');
      return;
    }

    const amountPaise = rupeesToPaise(form.amount);
    if (isNaN(amountPaise) || amountPaise <= 0) {
      setSnackMsg('Please enter a valid amount.');
      return;
    }

    const data = {
      name: form.name.trim(),
      amount: amountPaise,
      billing_cycle: form.billing_cycle,
      next_billing_date: form.next_billing_date,
      category: form.category,
      notes: form.notes.trim() || null,
      status: 'active' as const,
    };

    if (editSubId) {
      editSubscription(editSubId, data);
      setSnackMsg(`Updated ${form.name}.`);
    } else {
      addSubscription(userId!, data);
      setSnackMsg(`Added ${form.name} to active subscriptions.`);
    }

    setDialogOpen(false);
    refresh();
  };

  const handleDelete = () => {
    if (confirmDeleteId) {
      deleteSubscription(confirmDeleteId);
      setSnackMsg('Subscription deleted.');
      setConfirmDeleteId(null);
      refresh();
    }
  };

  const handleToggleStatus = (sub: Subscription) => {
    toggleSubscriptionStatus(sub.id, sub.status);
    setSnackMsg(`${sub.status === 'active' ? 'Paused' : 'Resumed'} ${sub.name}.`);
    refresh();
  };

  const handleQuickAddDetected = (detected: DetectedSubscription) => {
    const data = {
      name: detected.name,
      amount: detected.amount,
      billing_cycle: detected.billing_cycle,
      next_billing_date: detected.suggestedNextDate,
      category: detected.category,
      notes: 'Automatically detected from historical expenses.',
      status: 'active' as const,
    };
    addSubscription(userId!, data);
    setSnackMsg(`Tracked detected subscription: ${detected.name}.`);
    refresh();
  };

  // Helper to render Category Pill style
  const categoryPill = (cat: string) => {
    const meta = CATEGORY_META[cat] || CATEGORY_META.other;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: meta.color + '15', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 10, gap: 4 }}>
        <MaterialCommunityIcons name={meta.icon as any} size={10} color={meta.color} />
        <Text style={{ fontSize: 9, fontWeight: '800', color: meta.color, textTransform: 'uppercase' }}>
          {meta.label}
        </Text>
      </View>
    );
  };

  return (
    <>
      <Screen>
        {/* KPI Summary Block */}
        <Row style={{ marginBottom: 12 }} gap={10}>
          <Kpi
            label="Monthly Outflow"
            value={formatINRCompact(summary.monthlyTotal)}
            subTone="warn"
            sub="Recurring expense drag"
          />
          <Kpi
            label="Yearly Projected"
            value={formatINRCompact(summary.yearlyTotal)}
            subTone="muted"
            sub="Cumulative annual cost"
          />
          <Kpi
            label="Active Subscriptions"
            value={String(summary.count)}
            subTone="good"
            sub="Tracked services"
          />
        </Row>

        {/* Tab Selection */}
        <SegmentedButtons
          value={activeTab}
          onValueChange={(v) => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setActiveTab(v as any);
          }}
          buttons={[
            { value: 'active', label: 'Active Subs', labelStyle: { fontSize: 11, fontWeight: '600' } },
            { value: 'upcoming', label: 'Upcoming', labelStyle: { fontSize: 11, fontWeight: '600' } },
            { value: 'detect', label: `Auto-Detect (${detectedSuggestions.length})`, labelStyle: { fontSize: 11, fontWeight: '600' } },
          ]}
          style={{ marginBottom: 16, height: 40 }}
        />

        {/* TAB 1: ACTIVE SUBSCRIPTIONS */}
        {activeTab === 'active' && (
          <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
            {subscriptions.length === 0 ? (
              <SectionCard>
                <EmptyState
                  icon="repeat-off"
                  title="No Tracked Subscriptions"
                  message="Log your memberships and subscriptions (like Netflix, Gym, broadband) manually or check the Auto-Detect tab to scan your historical expenses."
                />
                <Button mode="contained" icon="plus" onPress={handleOpenAddDialog} style={{ alignSelf: 'center', marginTop: 16, borderRadius: theme.roundness }}>
                  Log Subscription Manually
                </Button>
              </SectionCard>
            ) : (
              <View style={{ gap: 12 }}>
                {subscriptions.map((sub) => {
                  const meta = CATEGORY_META[sub.category] || CATEGORY_META.other;
                  const isPaused = sub.status === 'paused';
                  return (
                    <Card
                      key={sub.id}
                      style={{
                        borderColor: theme.colors.outlineVariant,
                        borderWidth: 1,
                        backgroundColor: theme.colors.surface,
                        borderRadius: theme.roundness,
                        elevation: 0,
                        opacity: isPaused ? 0.65 : 1,
                      }}
                    >
                      <Card.Content style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        {/* Icon Indicator */}
                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: meta.color + '15', justifyContent: 'center', alignItems: 'center' }}>
                          <MaterialCommunityIcons name={meta.icon as any} size={22} color={meta.color} />
                        </View>

                        {/* Details */}
                        <View style={{ flex: 1, gap: 3 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text variant="bodyLarge" style={{ fontWeight: '800', color: theme.colors.onSurface }}>
                              {sub.name}
                            </Text>
                            <Text variant="titleMedium" style={{ fontWeight: '800', color: isPaused ? theme.colors.onSurfaceVariant : theme.colors.primary }}>
                              {formatINR(sub.amount)}
                            </Text>
                          </View>
                          
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            {categoryPill(sub.category)}
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700' }}>
                              {sub.billing_cycle.toUpperCase()}
                            </Text>
                          </View>
                          
                          <Divider style={{ marginVertical: 4, opacity: 0.5 }} />

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                              Next Renewal: <Text style={{ fontWeight: '700', color: theme.colors.onSurface }}>{sub.next_billing_date}</Text>
                            </Text>
                            
                            <View style={{ flexDirection: 'row', gap: 4 }}>
                              {/* Pause/Resume */}
                              <IconButton
                                icon={isPaused ? 'play' : 'pause'}
                                size={16}
                                containerColor={theme.colors.secondaryContainer}
                                iconColor={theme.colors.onSecondaryContainer}
                                style={{ margin: 0 }}
                                onPress={() => handleToggleStatus(sub)}
                              />
                              {/* Edit */}
                              <IconButton
                                icon="pencil"
                                size={16}
                                containerColor={theme.colors.secondaryContainer}
                                iconColor={theme.colors.onSecondaryContainer}
                                style={{ margin: 0 }}
                                onPress={() => handleOpenEditDialog(sub)}
                              />
                              {/* Delete */}
                              <IconButton
                                icon="delete"
                                size={16}
                                containerColor={theme.colors.errorContainer}
                                iconColor={theme.colors.onErrorContainer}
                                style={{ margin: 0 }}
                                onPress={() => setConfirmDeleteId(sub.id)}
                              />
                            </View>
                          </View>
                        </View>
                      </Card.Content>
                    </Card>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}

        {/* TAB 2: UPCOMING RENEWALS */}
        {activeTab === 'upcoming' && (
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {upcomingRenewals.length === 0 ? (
              <SectionCard>
                <EmptyState
                  icon="alarm-off"
                  title="No Upcoming Renewals"
                  message="No active subscriptions are scheduled for renewal in the next 30 days."
                />
              </SectionCard>
            ) : (
              <SectionCard title="Upcoming Renewals (Next 30 Days)">
                <View style={{ gap: 14 }}>
                  {upcomingRenewals.map((r) => {
                    const meta = CATEGORY_META[r.category] || CATEGORY_META.other;
                    const isUrgent = r.daysLeft <= 3;
                    return (
                      <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        {/* Status dot */}
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isUrgent ? palette.danger : palette.good }} />
                        
                        {/* Details */}
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text variant="bodyMedium" style={{ fontWeight: '700' }}>{r.name}</Text>
                            <Text variant="bodyMedium" style={{ fontWeight: '800', color: theme.colors.primary }}>{formatINR(r.amount)}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                              Due on {r.next_billing_date}
                            </Text>
                            <Text variant="labelSmall" style={{ fontWeight: '700', color: isUrgent ? palette.danger : theme.colors.onSurfaceVariant }}>
                              {r.daysLeft === 0 ? 'Renewing Today' : r.daysLeft === 1 ? 'Renewing Tomorrow' : `In ${r.daysLeft} days`}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </SectionCard>
            )}
          </ScrollView>
        )}

        {/* TAB 3: AUTO-DETECTED SUBSCRIPTIONS */}
        {activeTab === 'detect' && (
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {detectedSuggestions.length === 0 ? (
              <SectionCard>
                <EmptyState
                  icon="eye-outline"
                  title="Scanning for Subscriptions..."
                  message="No new recurring transactions detected in your historical expenses. The scanner automatically flags expenses that repeat monthly or match known subscription brands."
                />
              </SectionCard>
            ) : (
              <View style={{ gap: 12 }}>
                <SectionCard title="Auto-Detected Recurring Bills">
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                    The following repeating expenses were detected in your transaction logs. Tap "Track Subscription" to start tracking their upcoming renewal timelines automatically.
                  </Text>
                  <View style={{ gap: 14 }}>
                    {detectedSuggestions.map((detected, idx) => {
                      const meta = CATEGORY_META[detected.category] || CATEGORY_META.other;
                      return (
                        <View
                          key={idx}
                          style={{
                            padding: 12,
                            backgroundColor: theme.colors.elevation.level1,
                            borderRadius: theme.roundness,
                            borderWidth: 1,
                            borderColor: theme.colors.outlineVariant,
                            gap: 8,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <MaterialCommunityIcons name={meta.icon as any} size={16} color={meta.color} />
                              <Text variant="bodyMedium" style={{ fontWeight: '800' }}>{detected.name}</Text>
                            </View>
                            <Text variant="bodyMedium" style={{ fontWeight: '800', color: theme.colors.primary }}>
                              {formatINR(detected.amount)}
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                              Detected {detected.detectedCount} times · Last: {detected.lastPaidDate}
                            </Text>
                            <Text variant="labelSmall" style={{ color: palette.good, fontWeight: '700' }}>
                              Next: {detected.suggestedNextDate}
                            </Text>
                          </View>

                          <Button
                            mode="contained-tonal"
                            compact
                            icon="repeat"
                            onPress={() => handleQuickAddDetected(detected)}
                            style={{ borderRadius: theme.roundness, marginTop: 4 }}
                            labelStyle={{ fontSize: 11 }}
                          >
                            Track Subscription
                          </Button>
                        </View>
                      );
                    })}
                  </View>
                </SectionCard>
              </View>
            )}
          </ScrollView>
        )}
      </Screen>

      {/* Manual Add / Edit Dialog */}
      <Portal>
        <Dialog visible={dialogOpen} onDismiss={() => setDialogOpen(false)} style={{ borderRadius: theme.roundness, maxHeight: '80%' }}>
          <Dialog.Title>{editSubId ? 'Edit Subscription' : 'Track Subscription'}</Dialog.Title>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}>
            <TextInput
              label="Service / Provider Name *"
              value={form.name}
              onChangeText={(v) => setField('name', v)}
              mode="outlined"
              dense
              style={{ marginBottom: 10 }}
            />
            <TextInput
              label="Billing Amount (₹) *"
              value={form.amount}
              onChangeText={(v) => setField('amount', v)}
              keyboardType="numeric"
              mode="outlined"
              dense
              style={{ marginBottom: 10 }}
            />

            <View style={{ marginBottom: 10 }}>
              <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                Billing Cycle *
              </Text>
              <SegmentedButtons
                value={form.billing_cycle}
                onValueChange={(v) => setField('billing_cycle', v as any)}
                buttons={[
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'quarterly', label: 'Quarterly' },
                  { value: 'yearly', label: 'Yearly' },
                ]}
                style={{ height: 36 }}
              />
            </View>

            {/* Category Dropdown */}
            <View style={{ marginBottom: 10 }}>
              <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                Category
              </Text>
              <Menu
                visible={categoryMenuOpen}
                onDismiss={() => setCategoryMenuOpen(false)}
                anchor={
                  <Button
                    mode="outlined"
                    onPress={() => setCategoryMenuOpen(true)}
                    contentStyle={{ justifyContent: 'space-between', flexDirection: 'row-reverse', height: 40 }}
                    style={{ width: '100%', borderRadius: theme.roundness, borderColor: theme.colors.outline }}
                  >
                    {CATEGORY_META[form.category]?.label || 'Select Category'}
                  </Button>
                }
              >
                {CATEGORIES.map((c) => (
                  <Menu.Item key={c.value} title={c.label} onPress={() => { setField('category', c.value); setCategoryMenuOpen(false); }} />
                ))}
              </Menu>
            </View>

            {/* Date Picker Button */}
            <Button
              mode="outlined"
              onPress={() => setShowDatePicker(true)}
              style={{ marginBottom: 10, borderRadius: theme.roundness }}
            >
              {form.next_billing_date ? `Next Billing: ${form.next_billing_date}` : 'Set Next Billing Date *'}
            </Button>

            {showDatePicker && (
              <DateTimePicker
                value={form.next_billing_date ? new Date(form.next_billing_date) : new Date()}
                mode="date"
                display="default"
                onChange={(event, date) => {
                  setShowDatePicker(false);
                  if (date) {
                    setField('next_billing_date', date.toISOString().split('T')[0]);
                  }
                }}
              />
            )}

            <TextInput
              label="Notes"
              value={form.notes}
              onChangeText={(v) => setField('notes', v)}
              mode="outlined"
              multiline
              numberOfLines={3}
              style={{ marginBottom: 10 }}
            />
          </ScrollView>
          <Dialog.Actions>
            <Button onPress={() => setDialogOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleSave}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog visible={confirmDeleteId !== null} onDismiss={() => setConfirmDeleteId(null)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title>Delete Subscription</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">Are you sure you want to delete this subscription? FinVault will stop tracking its upcoming renewal timeline.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button mode="contained" buttonColor={theme.colors.error} onPress={handleDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Floating Add Subscription button */}
      {activeTab === 'active' && subscriptions.length > 0 && (
        <BouncePressable
          onPress={handleOpenAddDialog}
          style={{
            position: 'absolute',
            right: 16,
            bottom: 24,
            zIndex: 10,
          }}
        >
          <IconButton
            icon="plus"
            size={28}
            containerColor={theme.colors.primary}
            iconColor={theme.colors.onPrimary}
            style={{ margin: 0, elevation: 4 }}
          />
        </BouncePressable>
      )}

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

export default SubscriptionTrackerScreen;
