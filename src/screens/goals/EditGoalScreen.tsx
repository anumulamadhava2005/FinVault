import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import {
  Button,
  Checkbox,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../context/AppContext';
import { useDataSafe } from '../../hooks/useData';
import { all, first, insert, newId, tx } from '../../db';
import type { Asset, FinancialGoal } from '../../models/types';
import { Screen, SectionCard, EmptyState } from '../../components/ui';
import { palette } from '../../theme';
import { formatINR, paiseToRupees, rupeesToPaise } from '../../utils/money';
import { isValidISODate } from '../../utils/date';
import { GOAL_TYPES, GOAL_TYPE_COLORS } from '../../services/constants';
import GoalTypeIcon from '../../components/goals/GoalTypeIcon';

const EditGoalScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, refresh } = useApp();
  const router = useRouter();
  const theme = useTheme();

  const { data: goal, error } = useDataSafe<FinancialGoal | null>(() =>
    first<FinancialGoal>('SELECT * FROM financial_goals WHERE id = ?', [id ?? '']),
  );

  const { data: assetsData } = useDataSafe(() =>
    all<Asset>('SELECT * FROM assets WHERE user_id = ? ORDER BY name', [userId]),
  );

  const { data: existingLinks } = useDataSafe(() =>
    all<{ asset_id: string; allocation_pct: number }>('SELECT asset_id, allocation_pct FROM goal_asset_links WHERE goal_id = ?', [id ?? '']),
  );

  const [form, setForm] = useState({
    name: '',
    goal_type: 'retirement',
    target: '',
    target_date: '',
    monthly: '',
    notes: '',
  });
  const [links, setLinks] = useState<Record<string, boolean>>({});
  const [allocPct, setAllocPct] = useState<Record<string, string>>({});
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (goal && !initialized) {
      setForm({
        name: goal.name,
        goal_type: goal.goal_type,
        target: String(paiseToRupees(goal.target_amount)),
        target_date: goal.target_date ?? '',
        monthly: goal.monthly_needed ? String(paiseToRupees(goal.monthly_needed)) : '',
        notes: goal.notes ?? '',
      });
      const linkMap: Record<string, boolean> = {};
      const pctMap: Record<string, string> = {};
      (existingLinks ?? []).forEach((l) => {
        linkMap[l.asset_id] = true;
        pctMap[l.asset_id] = String(l.allocation_pct ?? 100);
      });
      setLinks(linkMap);
      setAllocPct(pctMap);
      setInitialized(true);
    }
  }, [goal, existingLinks, initialized]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const dateValid = !form.target_date || isValidISODate(form.target_date);
  const parsedDate = form.target_date ? new Date(form.target_date + 'T00:00:00') : new Date();
  const assets = assetsData ?? [];
  const typeLabel = GOAL_TYPES.find(([v]) => v === form.goal_type)?.[1] ?? 'Custom';

  const saveGoal = () => {
    const target = rupeesToPaise(form.target || '0');
    if (!form.name.trim() || target <= 0 || !dateValid) return;
    try {
      const goalColor = GOAL_TYPE_COLORS[form.goal_type] ?? '#2F8F6F';
      tx((db) => {
        db.runSync(
          `UPDATE financial_goals SET goal_type=?, target_amount=?, monthly_needed=?, target_date=?, color_hex=?, notes=? WHERE id=?`,
          [
            form.goal_type,
            target,
            rupeesToPaise(form.monthly || '0'),
            form.target_date || null,
            goalColor,
            form.notes || null,
            id ?? '',
          ],
        );
        db.runSync('DELETE FROM goal_asset_links WHERE goal_id = ?', [id ?? '']);
        Object.entries(links).forEach(([assetId, on]) => {
          if (on) {
            const pct = Math.min(100, Math.max(1, parseInt(allocPct[assetId] || '100', 10) || 100));
            db.runSync(
              'INSERT INTO goal_asset_links (id, goal_id, asset_id, allocation_pct) VALUES (?,?,?,?)',
              [newId(), id ?? '', assetId, pct],
            );
          }
        });
      });
      refresh();
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to save goal. Please try again.');
    }
  };

  if (error) {
    return (
      <Screen>
        <SectionCard>
          <EmptyState icon="alert-circle" title="Failed to load goal" message={error} />
        </SectionCard>
      </Screen>
    );
  }

  if (!goal) {
    return (
      <Screen>
        <SectionCard>
          <Text variant="bodyMedium">Goal not found.</Text>
        </SectionCard>
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Edit Goal' }} />
      <Screen>
        <SectionCard style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <GoalTypeIcon goalType={form.goal_type} size={28} />
            <Text variant="titleMedium" style={{ fontWeight: '700' }}>{typeLabel}</Text>
          </View>
          <TextInput
            label="Goal name"
            value={form.name}
            mode="outlined"
            dense
            disabled
            style={{ marginBottom: 8 }}
          />
          <View style={{
            borderWidth: 1,
            borderColor: theme.colors.outline,
            borderRadius: theme.roundness,
            paddingHorizontal: 12,
            paddingVertical: 12,
            backgroundColor: theme.colors.surfaceVariant,
            opacity: 0.72,
            marginBottom: 8,
          }}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 2 }}>Goal type</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{typeLabel}</Text>
          </View>
          <TextInput
            label="Target amount (₹)"
            keyboardType="numeric"
            value={form.target}
            onChangeText={(v) => set('target', v)}
            mode="outlined"
            dense
            style={{ marginBottom: 8 }}
          />
          <Button mode="outlined" onPress={() => setShowDatePicker(true)} style={{ marginBottom: 4, borderRadius: theme.roundness }}>
            {form.target_date ? `Target date: ${form.target_date}` : 'Set target date (optional)'}
          </Button>
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
          <TextInput
            label="Notes (optional)"
            value={form.notes}
            onChangeText={(v) => set('notes', v)}
            mode="outlined"
            dense
            multiline
            numberOfLines={2}
          />
        </SectionCard>

        <SectionCard title="Linked Assets" style={{ marginBottom: 12 }}>
          {assets.length === 0 ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>No assets to link yet.</Text>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 48, marginBottom: 6, gap: 8 }}>
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
        </SectionCard>

        <SectionCard style={{ marginBottom: 24 }}>
          <Button
            mode="contained"
            onPress={saveGoal}
            style={{ borderRadius: theme.roundness }}
            disabled={!form.name.trim() || rupeesToPaise(form.target || '0') <= 0 || !dateValid}
          >
            Save Changes
          </Button>
        </SectionCard>
      </Screen>
    </>
  );
};

export default EditGoalScreen;
