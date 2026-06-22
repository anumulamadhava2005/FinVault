import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import {
  Button,
  Checkbox,
  Dialog,
  FAB,
  Menu,
  Portal,
  Searchbar,
  SegmentedButtons,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../../context/AppContext';
import { useDataSafe } from '../../hooks/useData';
import { all, insert, newId, remove } from '../../db';
import type { Asset } from '../../models/types';
import { goalsProgress } from '../../services/finance';
import { GOAL_TYPES, GOAL_TYPE_COLORS } from '../../services/constants';
import {
  Screen,
  SectionCard,
  Kpi,
  Row,
  StatusChip,
  ProgressBar,
  EmptyState,
} from '../../components/ui';
import { GroupedBars } from '../../components/charts';
import { chartColors, palette, statusColor } from '../../theme';
import { formatINR, formatINRCompact, rupeesToPaise, scoreColor } from '../../utils/money';
import { nowISO } from '../../utils/date';
import GoalTypeIcon from '../../components/goals/GoalTypeIcon';
import GoalRingCard from '../../components/goals/GoalRingCard';
import GoalTimeline, { type TimelineGoal } from '../../components/goals/GoalTimeline';
import { useGoalsStore } from '../../stores/goalsStore';
import type { GoalFilterStatus } from '../../stores/goalsStore';
import { generateGoalNotifications } from '../../services/notificationService';

const blank = { name: '', goal_type: 'retirement', target: '', target_date: '', monthly: '' };

const FILTER_LABELS: Record<GoalFilterStatus, string> = {
  all: 'All',
  on_track: 'On Track',
  behind: 'Behind',
  overdue: 'Overdue',
  completed: 'Completed',
};

const SORT_LABELS = {
  target_date: 'Target Date',
  pct: 'Progress %',
  name: 'Name',
};

const GoalsDashboardScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { view, setView, filterStatus, setFilterStatus, sortBy, setSortBy, searchQuery, setSearchQuery } =
    useGoalsStore();

  const { data: progressData, error: progressError } = useDataSafe(() => goalsProgress(userId));
  const { data: assetsData } = useDataSafe(() =>
    all<Asset>('SELECT * FROM assets WHERE user_id = ? ORDER BY name', [userId]),
  );

  const progress = progressData ?? {
    goals: [],
    total_target: 0,
    total_current: 0,
    count: 0,
    on_track: 0,
    overall_pct: 0,
  };
  const assets = assetsData ?? [];

  // Generate goal notifications on screen load
  useEffect(() => {
    try { generateGoalNotifications(userId); } catch { /* non-critical */ }
  }, [userId, progressData]);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...blank });
  const [typeMenu, setTypeMenu] = useState(false);
  const [sortMenu, setSortMenu] = useState(false);
  const [filterMenu, setFilterMenu] = useState(false);
  const [links, setLinks] = useState<Record<string, boolean>>({});
  const [allocPct, setAllocPct] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [snackbar, setSnackbar] = useState('');

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const typeLabel = GOAL_TYPES.find(([v]) => v === form.goal_type)?.[1] ?? 'Custom';
  const parsedDate = form.target_date ? new Date(form.target_date + 'T00:00:00') : new Date();

  // Derived: filtered + sorted goals
  const filteredGoals = useMemo(() => {
    let goals = progress.goals;
    if (filterStatus !== 'all') goals = goals.filter((g) => g.status === filterStatus);
    if (searchQuery.trim())
      goals = goals.filter((g) =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    return [...goals].sort((a, b) => {
      if (sortBy === 'target_date')
        return (a.target_date ?? '9999') < (b.target_date ?? '9999') ? -1 : 1;
      if (sortBy === 'pct') return b.pct - a.pct;
      return a.name.localeCompare(b.name);
    });
  }, [progress.goals, filterStatus, searchQuery, sortBy]);

  // Timeline: all goals with a target_date, sorted ascending (not filtered)
  const timelineGoals = useMemo(
    (): TimelineGoal[] =>
      progress.goals
        .filter((g): g is (typeof g) & { target_date: string } => !!g.target_date)
        .sort((a, b) => (a.target_date < b.target_date ? -1 : 1))
        .map((g) => ({
          id: g.id,
          name: g.name,
          goal_type: g.goal_type,
          color_hex: g.color_hex ?? '',
          target_date: g.target_date,
          pct: g.pct,
          status_tone: g.status_tone,
        })),
    [progress.goals],
  );

  const saveGoal = () => {
    const target = rupeesToPaise(form.target || '0');
    if (!form.name.trim() || target <= 0) return;
    try {
      const id = newId();
      insert('financial_goals', {
        id,
        user_id: userId,
        name: form.name.trim(),
        goal_type: form.goal_type,
        target_amount: target,
        monthly_needed: rupeesToPaise(form.monthly || '0'),
        target_date: form.target_date || null,
        priority: 'medium',
        icon: 'flag',
        color_hex: GOAL_TYPE_COLORS[form.goal_type] ?? '#2F8F6F',
        notes: null,
        is_completed: false,
        created_at: nowISO(),
      });
      const assetIdSet = new Set(assets.map((a) => a.id));
      Object.entries(links).forEach(([assetId, on]) => {
        if (on && assetIdSet.has(assetId)) {
          const pct = Math.min(100, Math.max(1, parseInt(allocPct[assetId] || '100', 10) || 100));
          insert('goal_asset_links', {
            id: newId(),
            goal_id: id,
            asset_id: assetId,
            allocation_pct: pct,
          });
        }
      });
      setForm({ ...blank });
      setLinks({});
      setAllocPct({});
      setAddOpen(false);
      refresh();
    } catch {
      Alert.alert('Error', 'Failed to create goal. Please try again.');
    }
  };

  const doDelete = () => {
    if (!confirmId) return;
    try {
      remove('financial_goals', confirmId);
      refresh();
    } catch {
      Alert.alert('Error', 'Failed to delete goal. Please try again.');
    } finally {
      setConfirmId(null);
    }
  };

  if (progressError) {
    return (
      <Screen>
        <SectionCard>
          <EmptyState
            icon="alert-circle"
            title="Failed to load goals"
            message={progressError}
          />
        </SectionCard>
      </Screen>
    );
  }

  return (
    <>
      <Screen>
        {/* Summary */}
        <SectionCard
          title="Goal Funds"
          right={
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {progress.on_track}/{progress.count} on track
            </Text>
          }
        >
          <Row>
            <Kpi label="Total Target" value={formatINRCompact(progress.total_target)} />
            <Kpi
              label="Achieved"
              value={formatINRCompact(progress.total_current)}
              subTone="good"
              sub={`${progress.overall_pct}%`}
            />
          </Row>
          {progress.count > 0 && (
            <View style={{ marginTop: 8 }}>
              <ProgressBar
                pct={progress.overall_pct}
                color={statusColor(scoreColor(progress.overall_pct))}
              />
            </View>
          )}
        </SectionCard>

        {/* View toggle */}
        <SegmentedButtons
          value={view}
          onValueChange={(v) => setView(v as 'cards' | 'focus')}
          buttons={[
            { value: 'cards', label: 'Cards', icon: 'view-agenda' },
            { value: 'focus', label: 'Focus', icon: 'circle-slice-8' },
          ]}
          style={{ marginHorizontal: 16, marginTop: 8 }}
        />

        {/* Search bar */}
        <Searchbar
          placeholder="Search goals…"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{ marginHorizontal: 16, marginTop: 10, elevation: 1 }}
          inputStyle={{ fontSize: 14 }}
        />

        {/* Filter + sort menus */}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 16, gap: 8 }}
        >
          <Menu
            visible={filterMenu}
            onDismiss={() => setFilterMenu(false)}
            anchor={
              <Button
                compact
                icon="filter-variant"
                onPress={() => setFilterMenu(true)}
                mode={filterStatus !== 'all' ? 'contained-tonal' : 'text'}
              >
                {FILTER_LABELS[filterStatus]}
              </Button>
            }
          >
            {(Object.keys(FILTER_LABELS) as GoalFilterStatus[]).map((s) => (
              <Menu.Item
                key={s}
                title={FILTER_LABELS[s]}
                onPress={() => { setFilterStatus(s); setFilterMenu(false); }}
              />
            ))}
          </Menu>
          <Menu
            visible={sortMenu}
            onDismiss={() => setSortMenu(false)}
            anchor={
              <Button
                compact
                icon="sort"
                onPress={() => setSortMenu(true)}
              >
                {SORT_LABELS[sortBy]}
              </Button>
            }
          >
            {(Object.keys(SORT_LABELS) as (keyof typeof SORT_LABELS)[]).map((k) => (
              <Menu.Item
                key={k}
                title={SORT_LABELS[k]}
                onPress={() => { setSortBy(k); setSortMenu(false); }}
              />
            ))}
          </Menu>
        </View>

        {/* Chart — Achieved vs Target (uses filteredGoals when filter active) */}
        {filteredGoals.length > 0 && (
          <SectionCard title="Achieved vs Target">
            <GroupedBars
              labels={filteredGoals.map((g) => g.name)}
              formatValue={formatINRCompact}
              series={[
                {
                  label: 'Target',
                  color: chartColors.goalTarget,
                  data: filteredGoals.map((g) => g.target_amount / 100),
                },
                {
                  label: 'Achieved',
                  color: chartColors.achieved,
                  data: filteredGoals.map((g) => g.current / 100),
                },
              ]}
            />
          </SectionCard>
        )}

        {/* Goals list — Cards or Focus */}
        {filteredGoals.length === 0 ? (
          <SectionCard>
            <EmptyState
              icon="flag-checkered"
              title={progress.goals.length === 0 ? 'No goals yet' : 'No matching goals'}
              message={
                progress.goals.length === 0
                  ? 'Define a target and link assets that fund it.'
                  : 'Try adjusting your search or filter.'
              }
            />
          </SectionCard>
        ) : view === 'cards' ? (
          filteredGoals.map((g) => (
            <SectionCard key={g.id} onPress={() => router.push(`/goals/${g.id}` as any)}>
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <GoalTypeIcon goalType={g.goal_type} size={22} />
                  <Text variant="titleSmall" style={{ fontWeight: '800', flex: 1 }}>
                    {g.name}
                  </Text>
                </View>
                <StatusChip label={g.status_label} tone={g.status_tone} icon={g.status_icon} />
              </View>
              <View
                style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}
              >
                <Text
                  variant="labelSmall"
                  style={{ color: theme.colors.onSurfaceVariant, textTransform: 'uppercase' }}
                >
                  Progress
                </Text>
                <Text variant="labelMedium" style={{ fontWeight: '700' }}>
                  {formatINR(g.current)} / {formatINR(g.target_amount)}
                </Text>
              </View>
              <View style={{ marginTop: 4 }}>
                <ProgressBar
                  pct={g.pct}
                  color={statusColor(scoreColor(g.pct))}
                  markerPct={g.expected_pct}
                />
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    marginTop: 4,
                  }}
                >
                  {/* Long-press reveals expected_pct tooltip */}
                  <Pressable
                    onLongPress={() =>
                      setSnackbar(`${g.expected_pct}% expected by today (linear pace)`)
                    }
                  >
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {g.pct}% complete
                    </Text>
                  </Pressable>
                  {g.status !== 'completed' && g.required_monthly > 0 ? (
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      Save ~{formatINR(g.required_monthly)}/mo
                    </Text>
                  ) : null}
                </View>
                {g.status === 'overdue' && g.current < g.target_amount && (
                  <Text
                    variant="labelSmall"
                    style={{ color: palette.danger, fontWeight: '700', marginTop: 2 }}
                  >
                    Shortfall: {formatINR(g.target_amount - g.current)}
                  </Text>
                )}
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 8,
                }}
              >
                <Text
                  variant="labelSmall"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  Target {g.target_date || '—'} · {g.linked} linked asset
                  {g.linked === 1 ? '' : 's'}
                </Text>
                <Button
                  compact
                  textColor={palette.danger}
                  onPress={() => setConfirmId(g.id)}
                >
                  Delete
                </Button>
              </View>
            </SectionCard>
          ))
        ) : (
          /* Focus view — 2-column ring cards */
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              paddingTop: 8,
            }}
          >
            {filteredGoals.map((g) => (
              <GoalRingCard
                key={g.id}
                goal={g}
                onDelete={setConfirmId}
                onPress={() => router.push(`/goals/${g.id}` as any)}
              />
            ))}
          </View>
        )}

        {/* Goal Timeline (cards view only, all goals with target_date) */}
        {view === 'cards' && timelineGoals.length > 0 && (
          <SectionCard title="Goal Timeline">
            <GoalTimeline goals={timelineGoals} />
          </SectionCard>
        )}
      </Screen>

      <FAB
        icon="plus"
        label="Add Goal"
        style={{ position: 'absolute', right: 16, bottom: Math.max(insets.bottom, 16) + 16 }}
        onPress={() => setAddOpen(true)}
      />

      <Portal>
        {/* Add Goal dialog */}
        <Dialog visible={addOpen} onDismiss={() => setAddOpen(false)} style={{ maxHeight: '85%' }}>
          <Dialog.Title>Add Goal</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView keyboardShouldPersistTaps="handled">
            <View style={{ paddingVertical: 12 }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}
              >
                <GoalTypeIcon goalType={form.goal_type} size={28} />
                <Text variant="titleSmall" style={{ fontWeight: '700' }}>
                  {typeLabel}
                </Text>
              </View>
              <TextInput
                label="Goal name"
                value={form.name}
                onChangeText={(v) => set('name', v)}
                mode="outlined"
                dense
                style={{ marginBottom: 8 }}
              />
              <Menu
                visible={typeMenu}
                onDismiss={() => setTypeMenu(false)}
                anchor={
                  <Pressable
                    onPress={() => setTypeMenu(true)}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.outline,
                      borderRadius: 4,
                      paddingHorizontal: 12,
                      paddingVertical: 14,
                      backgroundColor: theme.colors.surface,
                      marginBottom: 8,
                    }}
                  >
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 2 }}>Goal type</Text>
                    <Text variant="bodyMedium">{typeLabel}</Text>
                  </Pressable>
                }
              >
                {GOAL_TYPES.map(([v, label]) => (
                  <Menu.Item
                    key={v}
                    title={label}
                    onPress={() => {
                      set('goal_type', v);
                      setTypeMenu(false);
                    }}
                  />
                ))}
              </Menu>
              <TextInput
                label="Target amount (₹)"
                keyboardType="numeric"
                value={form.target}
                onChangeText={(v) => set('target', v)}
                mode="outlined"
                dense
                style={{ marginBottom: 8 }}
              />
              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.outline,
                  borderRadius: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 14,
                  backgroundColor: theme.colors.surface,
                  marginBottom: 4,
                }}
              >
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 2 }}>Target date (optional)</Text>
                <Text variant="bodyMedium" style={{ color: form.target_date ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}>
                  {form.target_date ? form.target_date : 'Tap to set date'}
                </Text>
              </Pressable>
              {form.target_date ? (
                <Button
                  compact
                  textColor={palette.danger}
                  onPress={() => set('target_date', '')}
                  style={{ marginBottom: 8, alignSelf: 'flex-start' }}
                >
                  Clear date
                </Button>
              ) : (
                <View style={{ marginBottom: 8 }} />
              )}
              {showDatePicker && (
                <DateTimePicker
                  value={parsedDate}
                  mode="date"
                  minimumDate={new Date()}
                  onChange={(_e, date) => {
                    setShowDatePicker(false);
                    if (date) set('target_date', date.toISOString().slice(0, 10));
                  }}
                />
              )}
              <TextInput
                label="Monthly contribution (₹)"
                keyboardType="numeric"
                value={form.monthly}
                onChangeText={(v) => set('monthly', v)}
                mode="outlined"
                dense
                style={{ marginBottom: 8 }}
              />
              <Text variant="labelMedium" style={{ marginTop: 4, marginBottom: 4 }}>
                Link assets (fund this goal)
              </Text>
              {assets.length === 0 ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  No assets to link yet.
                </Text>
              ) : (
                assets.map((a) => (
                  <View key={a.id}>
                    <Checkbox.Item
                      label={`${a.name}  (${formatINR(a.current_value)})`}
                      status={links[a.id] ? 'checked' : 'unchecked'}
                      onPress={() => {
                        setLinks((l) => ({ ...l, [a.id]: !l[a.id] }));
                        if (!allocPct[a.id]) setAllocPct((p) => ({ ...p, [a.id]: '100' }));
                      }}
                      position="leading"
                      style={{ paddingVertical: 0 }}
                    />
                    {links[a.id] && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 48, marginBottom: 4, gap: 8 }}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Allocation:</Text>
                        <TextInput
                          value={allocPct[a.id] ?? '100'}
                          onChangeText={(v) => setAllocPct((p) => ({ ...p, [a.id]: v.replace(/[^0-9]/g, '') }))}
                          keyboardType="numeric"
                          mode="outlined"
                          dense
                          style={{ width: 64 }}
                        />
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>%</Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setAddOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={saveGoal}>
              Create Goal
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog visible={!!confirmId} onDismiss={() => setConfirmId(null)}>
          <Dialog.Title>Delete Goal</Dialog.Title>
          <Dialog.Content>
            <Text>Delete this goal? This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmId(null)}>Cancel</Button>
            <Button textColor={palette.danger} onPress={doDelete}>
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Expected-pct tooltip snackbar */}
      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar('')}
        duration={3000}
      >
        {snackbar}
      </Snackbar>
    </>
  );
};

export default GoalsDashboardScreen;
