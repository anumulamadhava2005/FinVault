import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, FAB, IconButton, Menu, Portal, Text, TextInput, useTheme } from 'react-native-paper';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { all, insert, newId, remove } from '../db';
import type { InsurancePolicy } from '../models/types';
import { annualPremium, policyStatus, protectSummary } from '../services/finance';
import { POLICY_TYPES, POLICY_TYPE_LABELS, titleCase } from '../services/constants';
import { Screen, SectionCard, Kpi, Row, StatusChip, EmptyState } from '../components/ui';
import { DistributionPie } from '../components/charts';
import { palette } from '../theme';
import { formatINR, formatINRCompact, rupeesToPaise } from '../utils/money';
import { nowISO } from '../utils/date';

const FREQS = ['monthly', 'quarterly', 'half-yearly', 'yearly', 'one-time'];
const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad'> = { active: 'good', renewed: 'good', expiring: 'warn', lapsed: 'bad' };
const blank = { policy_type: 'life', policy_name: '', provider: '', coverage: '', premium: '', frequency: 'yearly' };

const ProtectScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const policies = useData(() => all<InsurancePolicy>('SELECT * FROM insurance_policies WHERE user_id = ? ORDER BY created_at DESC', [userId]));
  const summary = useData(() => protectSummary(userId));

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...blank });
  const [typeMenu, setTypeMenu] = useState(false);
  const [freqMenu, setFreqMenu] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.policy_name.trim()) return;
    insert('insurance_policies', {
      id: newId(),
      user_id: userId,
      policy_type: form.policy_type,
      policy_name: form.policy_name.trim(),
      provider: form.provider || null,
      policy_number: null,
      holder_name: null,
      coverage_amount: rupeesToPaise(form.coverage || '0'),
      premium_amount: rupeesToPaise(form.premium || '0'),
      premium_frequency: form.frequency,
      start_date: null,
      expiry_date: null,
      next_due_date: null,
      nominee_name: null,
      nominee_relationship: null,
      notes: null,
      status: 'active',
      claim_ratio: null,
      riders: null,
      tax_benefit: null,
      created_at: nowISO(),
    });
    setForm({ ...blank });
    setAddOpen(false);
    refresh();
  };

  const doDelete = () => {
    if (confirmId) remove('insurance_policies', confirmId);
    setConfirmId(null);
    refresh();
  };

  return (
    <>
      <Screen>
        <Row>
          <Kpi label="Total Cover" value={formatINRCompact(summary.total_cover)} subTone="good" />
          <Kpi label="Annual Premium" value={formatINRCompact(summary.annual_premium)} />
        </Row>
        <Row>
          <Kpi label="Life Cover" value={formatINRCompact(summary.life_cover)} />
          <Kpi label="Health Cover" value={formatINRCompact(summary.health_cover)} />
        </Row>

        {summary.distribution.length > 0 && (
          <SectionCard title="Coverage by Type">
            <DistributionPie data={summary.distribution.map((d) => ({ name: d.label.split(' ')[0], value: d.coverage / 100, color: d.color }))} />
          </SectionCard>
        )}

        <Text variant="titleMedium" style={{ fontWeight: '800', marginTop: 4 }}>Policies</Text>
        {policies.length === 0 ? (
          <SectionCard><EmptyState icon="shield-check" title="No policies yet" message="Add your insurance policies to track coverage and premiums." /></SectionCard>
        ) : (
          policies.map((p) => {
            const st = policyStatus(p);
            return (
              <SectionCard key={p.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall" style={{ fontWeight: '800' }}>{p.policy_name}</Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {POLICY_TYPE_LABELS[p.policy_type] || titleCase(p.policy_type)}{p.provider ? ` · ${p.provider}` : ''}
                    </Text>
                  </View>
                  <StatusChip label={titleCase(st)} tone={STATUS_TONE[st] || 'good'} />
                </View>
                <Row style={{ marginTop: 10 }}>
                  <Kpi flex label="Coverage" value={formatINR(p.coverage_amount)} />
                  <Kpi flex label="Premium" value={formatINR(p.premium_amount)} sub={p.premium_frequency} />
                  <Kpi flex label="Annual" value={formatINR(annualPremium(p))} />
                </Row>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
                  <IconButton icon="delete" iconColor={palette.danger} size={20} onPress={() => setConfirmId(p.id)} accessibilityLabel="Delete policy" />
                </View>
              </SectionCard>
            );
          })
        )}
      </Screen>

      <FAB icon="plus" label="Add Policy" style={{ position: 'absolute', right: 16, bottom: 16 }} onPress={() => setAddOpen(true)} />

      <Portal>
        <Dialog visible={addOpen} onDismiss={() => setAddOpen(false)}>
          <Dialog.Title>Add Policy</Dialog.Title>
          <Dialog.Content>
            <Menu visible={typeMenu} onDismiss={() => setTypeMenu(false)} anchor={<Button mode="outlined" onPress={() => setTypeMenu(true)} style={{ marginBottom: 8 }}>{POLICY_TYPE_LABELS[form.policy_type]}</Button>}>
              {POLICY_TYPES.map(([v, label]) => <Menu.Item key={v} title={label} onPress={() => { set('policy_type', v); setTypeMenu(false); }} />)}
            </Menu>
            <TextInput label="Policy name" value={form.policy_name} onChangeText={(v) => set('policy_name', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <TextInput label="Provider" value={form.provider} onChangeText={(v) => set('provider', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <TextInput label="Coverage / Sum Assured (₹)" keyboardType="numeric" value={form.coverage} onChangeText={(v) => set('coverage', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <Row gap={8}>
              <TextInput label="Premium (₹)" keyboardType="numeric" value={form.premium} onChangeText={(v) => set('premium', v)} mode="outlined" dense style={{ flex: 1 }} />
              <Menu visible={freqMenu} onDismiss={() => setFreqMenu(false)} anchor={<Button mode="outlined" onPress={() => setFreqMenu(true)} style={{ flex: 1 }}>{form.frequency}</Button>}>
                {FREQS.map((f) => <Menu.Item key={f} title={f} onPress={() => { set('frequency', f); setFreqMenu(false); }} />)}
              </Menu>
            </Row>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={save}>Add Policy</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={!!confirmId} onDismiss={() => setConfirmId(null)}>
          <Dialog.Title>Delete Policy</Dialog.Title>
          <Dialog.Content><Text>Delete this policy? This cannot be undone.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmId(null)}>Cancel</Button>
            <Button textColor={palette.danger} onPress={doDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default ProtectScreen;
