import React, { useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  Checkbox,
  Dialog,
  FAB,
  Menu,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { all, insert, newId, remove } from '../db';
import type { Asset } from '../models/types';
import { goalsProgress } from '../services/finance';
import { GOAL_TYPES } from '../services/constants';
import { Screen, SectionCard, Kpi, Row, StatusChip, ProgressBar, EmptyState } from '../components/ui';
import { GroupedBars } from '../components/charts';
import { chartColors, palette, statusColor } from '../theme';
import { formatINR, formatINRCompact, rupeesToPaise } from '../utils/money';
import { isValidISODate, nowISO } from '../utils/date';

const blank = { name: '', goal_type: 'retirement', target: '', target_date: '', monthly: '' };

const GoalsScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const progress = useData(() => goalsProgress(userId!));
  const assets = useData(() => all<Asset>('SELECT * FROM assets WHERE user_id = ? ORDER BY name', [userId!]));

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...blank });
  const [typeMenu, setTypeMenu] = useState(false);
  const [links, setLinks] = useState<Record<string, boolean>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const dateValid = !form.target_date || isValidISODate(form.target_date);

  const saveGoal = () => {
    const target = rupeesToPaise(form.target || '0');
    if (!form.name.trim() || target <= 0 || !dateValid) return;
    const id = newId();
    insert('financial_goals', {
      id,
      user_id: userId!,
      name: form.name.trim(),
      goal_type: form.goal_type,
      target_amount: target,
      monthly_needed: rupeesToPaise(form.monthly || '0'),
      target_date: form.target_date || null,
      priority: 'medium',
      icon: 'flag',
      color_hex: '#2F8F6F',
      notes: null,
      is_completed: false,
      created_at: nowISO(),
    });
    Object.entries(links).forEach(([assetId, on]) => {
      if (on) insert('goal_asset_links', { id: newId(), goal_id: id, asset_id: assetId, allocation_pct: 100 });
    });
    setForm({ ...blank });
    setLinks({});
    setAddOpen(false);
    refresh();
  };

  const doDelete = () => {
    if (confirmId) remove('financial_goals', confirmId);
    setConfirmId(null);
    refresh();
  };

  const typeLabel = GOAL_TYPES.find(([v]) => v === form.goal_type)?.[1] || 'Custom';

  return (
    <>
      <Screen>
        <SectionCard title="Goal Funds" right={<Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{progress.on_track}/{progress.count} on track</Text>}>
          <Row>
            <Kpi label="Total Target" value={formatINRCompact(progress.total_target)} />
            <Kpi label="Achieved" value={formatINRCompact(progress.total_current)} subTone="good" sub={`${progress.overall_pct}%`} />
          </Row>
        </SectionCard>

        {progress.goals.length > 0 && (
          <SectionCard title="Achieved vs Target">
            <GroupedBars
              labels={progress.goals.map((g) => g.name.split(' ')[0])}
              formatValue={formatINRCompact}
              series={[
                { label: 'Target', color: chartColors.target, data: progress.goals.map((g) => g.target_amount / 100) },
                { label: 'Achieved', color: chartColors.achieved, data: progress.goals.map((g) => g.current / 100) },
              ]}
            />
          </SectionCard>
        )}

        {progress.goals.length === 0 ? (
          <SectionCard><EmptyState icon="flag-checkered" title="No goals yet" message="Define a target and link assets that fund it." /></SectionCard>
        ) : (
          progress.goals.map((g) => (
            <SectionCard key={g.id} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700', flex: 1 }}>{g.name}</Text>
                <StatusChip label={g.status_label} tone={g.status_tone} icon={g.status_icon} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textTransform: 'uppercase' }}>Progress</Text>
                <Text variant="labelMedium" style={{ fontWeight: '700' }}>{formatINR(g.current)} / {formatINR(g.target_amount)}</Text>
              </View>
              <View style={{ marginTop: 8 }}>
                <ProgressBar pct={g.pct} color={statusColor(g.status_tone)} markerPct={g.expected_pct} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{g.pct}% complete</Text>
                  {g.status !== 'completed' && g.required_monthly > 0 ? (
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Save ~{formatINR(g.required_monthly)}/mo</Text>
                  ) : null}
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Target {g.target_date || '—'} · {g.linked} linked asset{g.linked === 1 ? '' : 's'}
                </Text>
                <Button mode="text" compact textColor={palette.danger} onPress={() => setConfirmId(g.id)} style={{ margin: 0, padding: 0 }}>Delete</Button>
              </View>
            </SectionCard>
          ))
        )}
      </Screen>

      <FAB icon="plus" label="Add Goal" style={{ position: 'absolute', right: 16, bottom: 28 }} onPress={() => setAddOpen(true)} />

      <Portal>
        <Dialog visible={addOpen} onDismiss={() => setAddOpen(false)} style={{ maxHeight: '85%', borderRadius: theme.roundness }}>
          <Dialog.Title>Add Goal</Dialog.Title>
          <Dialog.ScrollArea>
            <View style={{ paddingVertical: 12 }}>
              <TextInput label="Goal name" value={form.name} onChangeText={(v) => set('name', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
              <Menu
                visible={typeMenu}
                onDismiss={() => setTypeMenu(false)}
                anchor={<Button mode="outlined" onPress={() => setTypeMenu(true)} style={{ marginBottom: 8 }}>{typeLabel}</Button>}
              >
                {GOAL_TYPES.map(([v, label]) => (
                  <Menu.Item key={v} title={label} onPress={() => { set('goal_type', v); setTypeMenu(false); }} />
                ))}
              </Menu>
              <TextInput label="Target amount (₹)" keyboardType="numeric" value={form.target} onChangeText={(v) => set('target', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
              <TextInput label="Target date (YYYY-MM-DD)" value={form.target_date} onChangeText={(v) => set('target_date', v)} mode="outlined" dense error={!dateValid} style={{ marginBottom: 8 }} />
              <TextInput label="Monthly contribution (₹)" keyboardType="numeric" value={form.monthly} onChangeText={(v) => set('monthly', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
              <Text variant="labelMedium" style={{ marginTop: 4, marginBottom: 4 }}>Link assets (fund this goal)</Text>
              {assets.length === 0 ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>No assets to link yet.</Text>
              ) : (
                assets.map((a) => (
                  <Checkbox.Item
                    key={a.id}
                    label={`${a.name}  (${formatINR(a.current_value)})`}
                    status={links[a.id] ? 'checked' : 'unchecked'}
                    onPress={() => setLinks((l) => ({ ...l, [a.id]: !l[a.id] }))}
                    position="leading"
                    style={{ paddingVertical: 0 }}
                  />
                ))
              )}
            </View>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setAddOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={saveGoal}>Create Goal</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={!!confirmId} onDismiss={() => setConfirmId(null)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title>Delete Goal</Dialog.Title>
          <Dialog.Content><Text>Delete this goal? This action cannot be undone.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmId(null)}>Cancel</Button>
            <Button textColor={palette.danger} onPress={doDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default GoalsScreen;
