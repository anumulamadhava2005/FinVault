import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, ScrollView, View } from 'react-native';
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
import { MaterialCommunityIcons } from '@expo/vector-icons';

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

const formatTargetDateLocal = (dateStr: string | null): string => {
  if (!dateStr) return 'No target date';
  try {
    const date = new Date(dateStr + 'T00:00:00');
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
    const formatted = date.toLocaleDateString('en-IN', options);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `Overdue (${formatted})`;
    } else if (diffDays === 0) {
      return `Due today (${formatted})`;
    } else if (diffDays === 1) {
      return `Due tomorrow (${formatted})`;
    } else if (diffDays <= 30) {
      return `Due in ${diffDays} days (${formatted})`;
    } else {
      const diffMonths = Math.round(diffDays / 30.44);
      return `Due in ${diffMonths} month${diffMonths > 1 ? 's' : ''} (${formatted})`;
    }
  } catch (_) {
    return dateStr;
  }
};

const AnimatedPressable: React.FC<{
  onPress?: () => void;
  style?: any;
  children: React.ReactNode;
  disabled?: boolean;
}> = ({ onPress, style, children, disabled }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.timing(scale, {
      toValue: 0.96,
      duration: 100,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.timing(scale, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const StaggeredAssetRow: React.FC<{
  asset: any;
  isLinked: boolean;
  onLink: () => void;
  allocPct: string;
  onAllocChange: (v: string) => void;
  index: number;
  theme: any;
  formatINR: (v: number) => string;
}> = ({ asset, isLinked, onLink, allocPct, onAllocChange, index, theme, formatINR }) => {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 220,
        delay: index * 40,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        useNativeDriver: true,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 220,
        delay: index * 40,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        opacity: fade,
        transform: [{ translateY: slide }],
        marginBottom: 10,
        borderWidth: 1,
        borderColor: isLinked ? theme.colors.primary : theme.colors.outlineVariant,
        borderRadius: theme.roundness || 8,
        padding: 12,
        backgroundColor: isLinked ? theme.colors.primaryContainer + '11' : theme.colors.surface,
      }}
    >
      <Pressable
        onPress={onLink}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <Checkbox
          status={isLinked ? 'checked' : 'unchecked'}
          onPress={onLink}
        />
        <View style={{ flex: 1 }}>
          <Text variant="titleSmall" style={{ fontWeight: '700' }}>
            {asset.name}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {formatINR(asset.current_value)}
          </Text>
        </View>
      </Pressable>
      {isLinked && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginLeft: 44,
            marginTop: 8,
            gap: 8,
          }}
        >
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Allocation:
          </Text>
          <TextInput
            value={allocPct}
            onChangeText={onAllocChange}
            keyboardType="numeric"
            mode="outlined"
            dense
            style={{ width: 64, height: 32 }}
          />
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            %
          </Text>
        </View>
      )}
    </Animated.View>
  );
};

const GoalsDashboardScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { view, setView, filterStatus, setFilterStatus, sortBy, setSortBy, searchQuery, setSearchQuery } =
    useGoalsStore();

  const { data: progressData, error: progressError } = useDataSafe(() => goalsProgress(userId || ''));
  const { data: assetsData } = useDataSafe(() =>
    all<Asset>('SELECT * FROM assets WHERE user_id = ? ORDER BY name', [userId || '']),
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
    try { generateGoalNotifications(userId || ''); } catch { /* non-critical */ }
  }, [userId, progressData]);

  const [addOpen, setAddOpen] = useState(false);
  const [step, setStep] = useState(1);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (addOpen) {
      fadeAnim.setValue(0);
      translateYAnim.setValue(12);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.bezier(0.23, 1, 0.32, 1),
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          toValue: 0,
          duration: 200,
          easing: Easing.bezier(0.23, 1, 0.32, 1),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [step, addOpen]);
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
      setStep(1);
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
        onPress={() => {
          setForm({ ...blank });
          setLinks({});
          setAllocPct({});
          setStep(1);
          setAddOpen(true);
        }}
      />

      <Portal>
        <Dialog visible={addOpen} onDismiss={() => { setAddOpen(false); setStep(1); }} style={{ maxHeight: '85%', borderRadius: theme.roundness || 12 }}>
          <Dialog.Title style={{ fontSize: 18, fontWeight: '700', paddingBottom: 8 }}>
            Add Goal — Step {step} of 3 ({step === 1 ? 'Details' : step === 2 ? 'Schedule' : 'Funding'})
          </Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 20, borderTopWidth: 0, borderBottomWidth: 0 }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: translateYAnim }], paddingVertical: 12 }}>
                {step === 1 ? (
                  <View>
                    <TextInput
                      label="Goal name"
                      value={form.name}
                      onChangeText={(v) => set('name', v)}
                      mode="outlined"
                      dense
                      style={{ marginBottom: 16 }}
                    />
                    
                    {/* Goal Type (Selectable) Selector Card */}
                    <Menu
                      visible={typeMenu}
                      onDismiss={() => setTypeMenu(false)}
                      anchor={
                        <AnimatedPressable
                          onPress={() => setTypeMenu(true)}
                          style={{
                            borderWidth: 1,
                            borderColor: theme.colors.outline,
                            borderRadius: theme.roundness || 8,
                            paddingHorizontal: 12,
                            paddingVertical: 12,
                            backgroundColor: theme.colors.surface,
                            marginBottom: 16,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <GoalTypeIcon goalType={form.goal_type} size={22} />
                            <View style={{ flex: 1 }}>
                              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                Goal Type (Selectable)
                              </Text>
                              <Text variant="bodyMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                                {typeLabel}
                              </Text>
                            </View>
                          </View>
                          <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.onSurfaceVariant} />
                        </AnimatedPressable>
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
                  </View>
                ) : step === 2 ? (
                  <View>
                    {/* Target Date Picker (Explicit Optional explanation) */}
                    <AnimatedPressable
                      onPress={() => setShowDatePicker(true)}
                      style={{
                        borderWidth: 1,
                        borderColor: theme.colors.outline,
                        borderRadius: theme.roundness || 8,
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        backgroundColor: theme.colors.surface,
                        marginBottom: 4,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          Target Date (Optional — Skip for no deadline)
                        </Text>
                        <Text
                          variant="bodyMedium"
                          style={{
                            fontWeight: '700',
                            color: form.target_date ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
                            marginTop: 2,
                          }}
                        >
                          {form.target_date ? formatTargetDateLocal(form.target_date) : 'No target date (Tap to set)'}
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="calendar" size={20} color={theme.colors.onSurfaceVariant} />
                    </AnimatedPressable>

                    {form.target_date ? (
                      <Button
                        compact
                        textColor={palette.danger}
                        onPress={() => set('target_date', '')}
                        style={{ marginBottom: 12, alignSelf: 'flex-start' }}
                      >
                        Clear date
                      </Button>
                    ) : (
                      <View style={{ marginBottom: 12 }} />
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
                  </View>
                ) : (
                  /* Asset selection cards list */
                  <View>
                    <Text variant="labelMedium" style={{ marginTop: 4, marginBottom: 10, fontWeight: '700' }}>
                      Link assets to fund this goal
                    </Text>
                    <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                      {assets.length === 0 ? (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          No assets to link yet.
                        </Text>
                      ) : (
                        assets.map((a, i) => (
                          <StaggeredAssetRow
                            key={a.id}
                            asset={a}
                            isLinked={!!links[a.id]}
                            onLink={() => {
                              setLinks((l) => ({ ...l, [a.id]: !l[a.id] }));
                              if (!allocPct[a.id]) setAllocPct((p) => ({ ...p, [a.id]: '100' }));
                            }}
                            allocPct={allocPct[a.id] ?? '100'}
                            onAllocChange={(v) =>
                              setAllocPct((p) => ({ ...p, [a.id]: v.replace(/[^0-9]/g, '') }))
                            }
                            index={i}
                            theme={theme}
                            formatINR={formatINR}
                          />
                        ))
                      )}
                    </ScrollView>
                  </View>
                )}
              </Animated.View>
            </ScrollView>
          </Dialog.ScrollArea>
          
          {/* Fitts' Law Button Grouping */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingHorizontal: 24, paddingBottom: 16 }}>
            {step === 1 ? (
              <>
                <AnimatedPressable
                  onPress={() => { setAddOpen(false); setStep(1); }}
                  style={{ paddingVertical: 10, paddingHorizontal: 16 }}
                >
                  <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>Cancel</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => setStep(2)}
                  style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: theme.roundness || 8,
                    paddingVertical: 10,
                    paddingHorizontal: 20,
                  }}
                >
                  <Text variant="labelLarge" style={{ color: theme.colors.onPrimary, fontWeight: '700' }}>Next</Text>
                </AnimatedPressable>
              </>
            ) : step === 2 ? (
              <>
                <AnimatedPressable
                  onPress={() => setStep(1)}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.outline,
                    borderRadius: theme.roundness || 8,
                    paddingVertical: 10,
                    paddingHorizontal: 20,
                  }}
                >
                  <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: '700' }}>Back</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={() => setStep(3)}
                  style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: theme.roundness || 8,
                    paddingVertical: 10,
                    paddingHorizontal: 20,
                  }}
                >
                  <Text variant="labelLarge" style={{ color: theme.colors.onPrimary, fontWeight: '700' }}>Next</Text>
                </AnimatedPressable>
              </>
            ) : (
              <>
                <AnimatedPressable
                  onPress={() => setStep(2)}
                  style={{
                    borderWidth: 1,
                    borderColor: theme.colors.outline,
                    borderRadius: theme.roundness || 8,
                    paddingVertical: 10,
                    paddingHorizontal: 20,
                  }}
                >
                  <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: '700' }}>Back</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  onPress={saveGoal}
                  style={{
                    backgroundColor: theme.colors.primary,
                    borderRadius: theme.roundness || 8,
                    paddingVertical: 10,
                    paddingHorizontal: 20,
                  }}
                >
                  <Text variant="labelLarge" style={{ color: theme.colors.onPrimary, fontWeight: '700' }}>Create Goal</Text>
                </AnimatedPressable>
              </>
            )}
          </View>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog visible={!!confirmId} onDismiss={() => setConfirmId(null)} style={{ borderRadius: theme.roundness }}>
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
