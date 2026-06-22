import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../context/AppContext';
import { useDataSafe } from '../../hooks/useData';
import { all, remove } from '../../db';
import type { Asset } from '../../models/types';
import { goalsProgress } from '../../services/finance';
import { GOAL_TYPE_LABELS } from '../../services/constants';
import { Screen, SectionCard, Kpi, Row, StatusChip, ProgressBar, EmptyState } from '../../components/ui';
import { palette, statusColor } from '../../theme';
import { formatINR, scoreColor } from '../../utils/money';
import { formatDisplayDate } from '../../utils/date';
import GoalTypeIcon from '../../components/goals/GoalTypeIcon';

const GoalDetailScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, refresh } = useApp();
  const router = useRouter();
  const theme = useTheme();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: goal, error } = useDataSafe(() => {
    const prog = goalsProgress(userId!);
    return prog.goals.find((g) => g.id === id) ?? null;
  });

  const { data: linkedAssets, error: assetsError } = useDataSafe(() =>
    all<Asset & { allocation_pct: number }>(
      `SELECT a.*, gal.allocation_pct FROM goal_asset_links gal
       JOIN assets a ON a.id = gal.asset_id WHERE gal.goal_id = ?`,
      [id ?? ''],
    ),
  );

  const { data: sharedAssets } = useDataSafe(() =>
    all<{ asset_id: string }>(
      `SELECT DISTINCT gal.asset_id FROM goal_asset_links gal
       WHERE gal.asset_id IN (SELECT asset_id FROM goal_asset_links WHERE goal_id = ?)
       AND gal.goal_id != ?`,
      [id ?? '', id ?? ''],
    ),
  );

  const handleDelete = () => {
    try {
      remove('financial_goals', id ?? '');
      refresh();
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to delete goal. Please try again.');
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

  const typeLabel = GOAL_TYPE_LABELS[goal.goal_type] ?? goal.goal_type;
  const assets = linkedAssets ?? [];

  return (
    <>
      <Stack.Screen options={{ title: goal.name }} />
      <Screen>
        <SectionCard style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <GoalTypeIcon goalType={goal.goal_type} size={32} />
            <View style={{ flex: 1 }}>
              <Text variant="titleLarge" style={{ fontWeight: '700' }}>{goal.name}</Text>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>{typeLabel}</Text>
            </View>
            <StatusChip label={goal.status_label} tone={goal.status_tone} icon={goal.status_icon} />
          </View>
        </SectionCard>

        <SectionCard title="Progress" style={{ marginBottom: 12 }}>
          <Row>
            <Kpi label="Current" value={formatINR(goal.current)} />
            <Kpi label="Target" value={formatINR(goal.target_amount)} />
          </Row>
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{goal.pct}% complete</Text>
              {goal.expected_pct > 0 && goal.expected_pct < 100 && (
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{goal.expected_pct}% expected by now</Text>
              )}
            </View>
            <ProgressBar pct={goal.pct} color={statusColor(scoreColor(goal.pct))} markerPct={goal.expected_pct} height={12} />
          </View>
          {goal.status !== 'completed' && goal.required_monthly > 0 && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
              Save ~{formatINR(goal.required_monthly)}/mo to finish on time
            </Text>
          )}
        </SectionCard>

        <SectionCard title="Details" style={{ marginBottom: 12 }}>
          <Row>
            <Kpi label="Remaining" value={formatINR(Math.max(goal.target_amount - goal.current, 0))} />
            <Kpi label="Linked Assets" value={String(goal.linked)} />
          </Row>
          {goal.target_date ? (
            <View style={{ marginTop: 12 }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textTransform: 'uppercase' }}>Target date</Text>
              <Text variant="bodyMedium" style={{ fontWeight: '700', marginTop: 4 }}>{formatDisplayDate(goal.target_date)}</Text>
            </View>
          ) : null}
          {goal.notes ? (
            <View style={{ marginTop: 12 }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textTransform: 'uppercase' }}>Notes</Text>
              <Text variant="bodyMedium" style={{ marginTop: 4 }}>{goal.notes}</Text>
            </View>
          ) : null}
        </SectionCard>

        {sharedAssets && sharedAssets.length > 0 && (
          <SectionCard style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Text style={{ color: palette.warn, fontSize: 16 }}>⚠</Text>
              <Text variant="bodySmall" style={{ color: palette.warn, flex: 1, lineHeight: 18 }}>
                {sharedAssets.length === 1 ? '1 linked asset is' : `${sharedAssets.length} linked assets are`} also counted in other goals — values may be double-counted.
              </Text>
            </View>
          </SectionCard>
        )}

        {assetsError ? (
          <SectionCard title="Linked Assets" style={{ marginBottom: 12 }}>
            <Text variant="bodySmall" style={{ color: palette.danger }}>
              Failed to load linked assets.
            </Text>
          </SectionCard>
        ) : assets.length === 0 ? (
          <SectionCard title="Linked Assets" style={{ marginBottom: 12 }}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
              No assets linked yet. Tap Edit to link assets and track progress.
            </Text>
          </SectionCard>
        ) : (
          <SectionCard title="Linked Assets" style={{ marginBottom: 12 }}>
            <View style={{ gap: 6 }}>
              {assets.map((a) => (
                <View key={a.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
                  <Text variant="bodyMedium" style={{ flex: 1 }}>{a.name}</Text>
                  {a.allocation_pct < 100 && (
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginRight: 8 }}>
                      {a.allocation_pct}%
                    </Text>
                  )}
                  <Text variant="bodyMedium" style={{ fontWeight: '700' }}>{formatINR(a.current_value)}</Text>
                </View>
              ))}
            </View>
          </SectionCard>
        )}

        <SectionCard style={{ marginBottom: 24 }}>
          <Row gap={8}>
            <Button
              mode="contained"
              icon="pencil"
              style={{ flex: 1, borderRadius: theme.roundness }}
              onPress={() => router.push(`/goals/${id}/edit` as any)}
            >
              Edit
            </Button>
            <Button
              mode="outlined"
              icon="delete"
              textColor={palette.danger}
              style={{ flex: 1, borderRadius: theme.roundness }}
              onPress={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          </Row>
        </SectionCard>
      </Screen>

      <Portal>
        <Dialog visible={confirmDelete} onDismiss={() => setConfirmDelete(false)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title>Delete Goal</Dialog.Title>
          <Dialog.Content>
            <Text>Delete "{goal.name}"? This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(false)}>Cancel</Button>
            <Button textColor={palette.danger} onPress={handleDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default GoalDetailScreen;
