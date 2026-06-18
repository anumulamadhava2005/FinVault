import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, FAB, IconButton, Menu, Portal, Text, TextInput, useTheme } from 'react-native-paper';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { all, first, insert, newId, remove } from '../db';
import type { Asset, AssetType, User } from '../models/types';
import { benchmarkComparison, portfolioSummary } from '../services/finance';
import { Screen, SectionCard, Kpi, Row, EmptyState } from '../components/ui';
import { DistributionPie, GroupedBars } from '../components/charts';
import { chartColors, palette } from '../theme';
import { formatINR, formatINRCompact, rupeesToPaise, pct } from '../utils/money';
import { nowISO } from '../utils/date';

const PIE = ['#4A7C6F', '#7FB5A8', '#D4956A', '#2D3142', '#F0B429', '#52A77E', '#316357', '#9DD1C2'];
const blank = { name: '', type_id: '', invested: '', current: '', quantity: '' };

const AssetsScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const user = useData(() => first<User>('SELECT * FROM users WHERE id = ?', [userId]));
  const assetTypes = useData(() => all<AssetType>('SELECT * FROM asset_types ORDER BY sort_order'));
  const assets = useData(() =>
    all<Asset & { type_name: string }>(
      `SELECT a.*, t.name AS type_name FROM assets a JOIN asset_types t ON t.id = a.asset_type_id
       WHERE a.user_id = ? ORDER BY a.current_value DESC`,
      [userId],
    ),
  );
  const pf = useData(() => portfolioSummary(userId));
  const bench = useData(() => benchmarkComparison(userId, user?.risk_profile || 'moderate'));

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...blank });
  const [typeMenu, setTypeMenu] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const typeName = assetTypes.find((t) => t.id === form.type_id)?.name || 'Select type';

  const save = () => {
    const typeId = form.type_id || assetTypes[0]?.id;
    if (!form.name.trim() || !typeId) return;
    insert('assets', {
      id: newId(),
      user_id: userId,
      asset_type_id: typeId,
      name: form.name.trim(),
      invested_amount: rupeesToPaise(form.invested || '0'),
      current_value: rupeesToPaise(form.current || form.invested || '0'),
      quantity: parseFloat(form.quantity || '0') || 0,
      purchase_date: null,
      notes: null,
      created_at: nowISO(),
    });
    setForm({ ...blank });
    setAddOpen(false);
    refresh();
  };

  const doDelete = () => {
    if (confirmId) remove('assets', confirmId);
    setConfirmId(null);
    refresh();
  };

  return (
    <>
      <Screen>
        <Row>
          <Kpi label="Portfolio Value" value={formatINRCompact(pf.total_value)} />
          <Kpi label="Invested" value={formatINRCompact(pf.total_invested)} />
          <Kpi label="P&L" value={`${pf.pnl_pct}%`} subTone={pf.total_pnl >= 0 ? 'good' : 'bad'} sub={formatINRCompact(pf.total_pnl)} />
        </Row>

        {pf.allocation.length > 0 && (
          <SectionCard title="Allocation">
            <DistributionPie data={pf.allocation.map((a, i) => ({ name: a.type, value: a.value / 100, color: PIE[i % PIE.length] }))} />
          </SectionCard>
        )}

        {bench.rows.length > 0 && (
          <SectionCard title="Allocation vs Benchmark" right={<Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{bench.risk_profile}</Text>}>
            <GroupedBars
              labels={bench.rows.map((r) => r.type.split(' ')[0])}
              formatValue={(n) => `${n}%`}
              series={[
                { label: 'Recommended %', color: chartColors.recommended, data: bench.rows.map((r) => r.recommended) },
                { label: 'Your %', color: chartColors.yours, data: bench.rows.map((r) => r.actual) },
              ]}
            />
          </SectionCard>
        )}

        <Text variant="titleMedium" style={{ fontWeight: '800', marginTop: 4 }}>Holdings</Text>
        {assets.length === 0 ? (
          <SectionCard><EmptyState icon="chart-line" title="No assets yet" message="Add your investments to track value and allocation." /></SectionCard>
        ) : (
          assets.map((a) => {
            const pnl = a.current_value - a.invested_amount;
            return (
              <SectionCard key={a.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall" style={{ fontWeight: '800' }}>{a.name}</Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{a.type_name}</Text>
                  </View>
                  <IconButton icon="delete" iconColor={palette.danger} size={20} onPress={() => setConfirmId(a.id)} accessibilityLabel="Delete asset" />
                </View>
                <Row style={{ marginTop: 6 }}>
                  <Kpi flex label="Invested" value={formatINR(a.invested_amount)} />
                  <Kpi flex label="Current" value={formatINR(a.current_value)} />
                  <Kpi flex label="P&L" value={formatINR(pnl)} subTone={pnl >= 0 ? 'good' : 'bad'} sub={`${pct(pnl, a.invested_amount)}%`} />
                </Row>
              </SectionCard>
            );
          })
        )}
      </Screen>

      <FAB icon="plus" label="Add Asset" style={{ position: 'absolute', right: 16, bottom: 16 }} onPress={() => setAddOpen(true)} />

      <Portal>
        <Dialog visible={addOpen} onDismiss={() => setAddOpen(false)}>
          <Dialog.Title>Add Asset</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Name" value={form.name} onChangeText={(v) => set('name', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <Menu visible={typeMenu} onDismiss={() => setTypeMenu(false)} anchor={<Button mode="outlined" onPress={() => setTypeMenu(true)} style={{ marginBottom: 8 }}>{typeName}</Button>}>
              {assetTypes.map((t) => <Menu.Item key={t.id} title={t.name} onPress={() => { set('type_id', t.id); setTypeMenu(false); }} />)}
            </Menu>
            <Row gap={8}>
              <TextInput label="Invested (₹)" keyboardType="numeric" value={form.invested} onChangeText={(v) => set('invested', v)} mode="outlined" dense style={{ flex: 1 }} />
              <TextInput label="Current (₹)" keyboardType="numeric" value={form.current} onChangeText={(v) => set('current', v)} mode="outlined" dense style={{ flex: 1 }} />
            </Row>
            <TextInput label="Quantity (optional)" keyboardType="numeric" value={form.quantity} onChangeText={(v) => set('quantity', v)} mode="outlined" dense style={{ marginTop: 8 }} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={save}>Add Asset</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={!!confirmId} onDismiss={() => setConfirmId(null)}>
          <Dialog.Title>Delete Asset</Dialog.Title>
          <Dialog.Content><Text>Delete this asset? This cannot be undone.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmId(null)}>Cancel</Button>
            <Button textColor={palette.danger} onPress={doDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default AssetsScreen;
