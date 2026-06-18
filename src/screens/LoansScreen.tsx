import React, { useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  Dialog,
  FAB,
  HelperText,
  IconButton,
  Menu,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { all, insert, newId, remove, run } from '../db';
import type { Loan } from '../models/types';
import { debtHealth, loanStatus, loanSummary, remainingMonths } from '../services/finance';
import { LOAN_TYPES, LOAN_TYPE_LABELS, titleCase } from '../services/constants';
import { Screen, SectionCard, Kpi, Row, StatusChip, ProgressBar, LineItem, EmptyState } from '../components/ui';
import { GroupedBars } from '../components/charts';
import { chartColors, palette, statusColor } from '../theme';
import { formatINR, formatINRCompact, rupeesToPaise, pct } from '../utils/money';
import { nowISO, todayISO } from '../utils/date';

const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad'> = { active: 'good', closed: 'good', overdue: 'bad', defaulted: 'bad' };

const blankForm = { loan_type: 'home', provider: '', original: '', outstanding: '', rate: '', emi: '' };

const LoansScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const loans = useData(() => all<Loan>('SELECT * FROM loans WHERE user_id = ? ORDER BY created_at DESC', [userId]));
  const summary = useData(() => loanSummary(userId));
  const debt = useData(() => debtHealth(userId));

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ...blankForm });
  const [typeMenu, setTypeMenu] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pay, setPay] = useState<{ id: string; type: 'emi' | 'prepayment' } | null>(null);
  const [payAmt, setPayAmt] = useState('');

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const saveLoan = () => {
    const orig = rupeesToPaise(form.original || '0');
    if (orig <= 0) return;
    const outstanding = form.outstanding ? rupeesToPaise(form.outstanding) : orig;
    insert('loans', {
      id: newId(),
      user_id: userId,
      loan_type: form.loan_type,
      provider: form.provider || null,
      account_number: null,
      borrower_name: null,
      original_amount: orig,
      outstanding_amount: outstanding,
      interest_rate: parseFloat(form.rate || '0') || 0,
      emi_amount: rupeesToPaise(form.emi || '0'),
      start_date: todayISO(),
      end_date: null,
      next_due_date: null,
      prepayment_total: 0,
      notes: null,
      status: 'active',
      interest_type: null,
      created_at: nowISO(),
    });
    setForm({ ...blankForm });
    setAddOpen(false);
    refresh();
  };

  const doDelete = () => {
    if (confirmId) remove('loans', confirmId);
    setConfirmId(null);
    refresh();
  };

  const recordPayment = () => {
    if (!pay) return;
    const amt = rupeesToPaise(payAmt || '0');
    const loan = loans.find((l) => l.id === pay.id);
    if (loan && amt > 0) {
      const newOut = Math.max(loan.outstanding_amount - amt, 0);
      run('UPDATE loans SET outstanding_amount = ?, status = ? WHERE id = ?', [
        newOut,
        newOut <= 0 ? 'closed' : loan.status,
        loan.id,
      ]);
      if (pay.type === 'prepayment')
        run('UPDATE loans SET prepayment_total = prepayment_total + ? WHERE id = ?', [amt, loan.id]);
      insert('loan_payments', {
        id: newId(),
        loan_id: loan.id,
        user_id: userId,
        payment_type: pay.type,
        amount: amt,
        principal_component: amt,
        interest_component: 0,
        payment_date: todayISO(),
        note: null,
      });
    }
    setPay(null);
    setPayAmt('');
    refresh();
  };

  return (
    <>
      <Screen>
        <Row>
          <Kpi label="Outstanding" value={formatINR(summary.total_outstanding)} subTone="bad" sub={`${summary.active_count} active`} />
          <Kpi label="Monthly EMI" value={formatINR(summary.total_emi)} />
          <Kpi label="Interest left" value={formatINRCompact(summary.total_interest)} />
        </Row>

        {summary.distribution.length > 0 && (
          <SectionCard title="Original vs Outstanding">
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
              Original loan amount and current balance, side by side per type.
            </Text>
            <GroupedBars
              labels={summary.distribution.map((d) => d.label.replace(' Loan', ''))}
              formatValue={formatINRCompact}
              series={[
                { label: 'Original Loan Amount', color: chartColors.original, data: summary.distribution.map((d) => d.original / 100) },
                { label: 'Outstanding Amount', color: chartColors.current, data: summary.distribution.map((d) => d.outstanding / 100) },
              ]}
            />
          </SectionCard>
        )}

        <SectionCard title="Debt Health" right={<StatusChip label={summary.health.rating} tone={summary.health.score >= 75 ? 'good' : summary.health.score >= 50 ? 'warn' : 'bad'} />}>
          {debt.rows.map((r) => (
            <View key={r.label} style={{ marginBottom: 8 }}>
              <LineItem label={r.label} value={`${r.value}${r.suffix}`} valueColor={statusColor(r.band === 'safe' ? 'good' : r.band === 'moderate' ? 'warn' : 'bad')} />
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{r.hint}</Text>
            </View>
          ))}
          {debt.recommendations.map((rec, i) => (
            <Text key={i} variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>• {rec}</Text>
          ))}
        </SectionCard>

        <Text variant="titleMedium" style={{ fontWeight: '800', marginTop: 4 }}>Loan Portfolio</Text>
        {loans.length === 0 ? (
          <SectionCard><EmptyState icon="bank" title="No loans yet" message="Add a loan to track EMIs and repayment progress." /></SectionCard>
        ) : (
          loans.map((l) => {
            const st = loanStatus(l);
            const repaid = pct(l.original_amount - l.outstanding_amount, l.original_amount);
            return (
              <SectionCard key={l.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall" style={{ fontWeight: '800' }}>{l.provider || LOAN_TYPE_LABELS[l.loan_type]}</Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {LOAN_TYPE_LABELS[l.loan_type] || titleCase(l.loan_type)} · {l.interest_rate}% · {remainingMonths(l)} mo left
                    </Text>
                  </View>
                  <StatusChip label={titleCase(st)} tone={STATUS_TONE[st] || 'good'} />
                </View>
                <Row style={{ marginTop: 10 }}>
                  <Kpi flex label="Original" value={formatINR(l.original_amount)} />
                  <Kpi flex label="Outstanding" value={formatINR(l.outstanding_amount)} subTone="bad" />
                  <Kpi flex label="EMI" value={formatINR(l.emi_amount)} />
                </Row>
                <View style={{ marginTop: 8 }}>
                  <ProgressBar pct={repaid} color={statusColor('good')} />
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>{repaid}% repaid</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 4, marginTop: 6 }}>
                  <Button compact onPress={() => { setPay({ id: l.id, type: 'emi' }); setPayAmt(String(l.emi_amount / 100)); }}>Pay EMI</Button>
                  <Button compact onPress={() => { setPay({ id: l.id, type: 'prepayment' }); setPayAmt(''); }}>Prepay</Button>
                  <IconButton icon="delete" iconColor={palette.danger} size={20} onPress={() => setConfirmId(l.id)} accessibilityLabel="Delete loan" />
                </View>
              </SectionCard>
            );
          })
        )}
      </Screen>

      <FAB icon="plus" label="Add Loan" style={{ position: 'absolute', right: 16, bottom: 16 }} onPress={() => setAddOpen(true)} />

      <Portal>
        {/* Add loan */}
        <Dialog visible={addOpen} onDismiss={() => setAddOpen(false)}>
          <Dialog.Title>Add Loan</Dialog.Title>
          <Dialog.Content>
            <Menu
              visible={typeMenu}
              onDismiss={() => setTypeMenu(false)}
              anchor={<Button mode="outlined" onPress={() => setTypeMenu(true)} style={{ marginBottom: 8 }}>{LOAN_TYPE_LABELS[form.loan_type]}</Button>}
            >
              {LOAN_TYPES.map(([v, label]) => (
                <Menu.Item key={v} title={label} onPress={() => { set('loan_type', v); setTypeMenu(false); }} />
              ))}
            </Menu>
            <TextInput label="Provider" value={form.provider} onChangeText={(v) => set('provider', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <TextInput label="Original Amount (₹)" keyboardType="numeric" value={form.original} onChangeText={(v) => set('original', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <TextInput label="Outstanding (₹) — defaults to original" keyboardType="numeric" value={form.outstanding} onChangeText={(v) => set('outstanding', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <Row gap={8}>
              <TextInput label="Rate %" keyboardType="numeric" value={form.rate} onChangeText={(v) => set('rate', v)} mode="outlined" dense style={{ flex: 1 }} />
              <TextInput label="EMI (₹)" keyboardType="numeric" value={form.emi} onChangeText={(v) => set('emi', v)} mode="outlined" dense style={{ flex: 1 }} />
            </Row>
            <HelperText type={rupeesToPaise(form.original || '0') > 0 ? 'info' : 'error'} visible>
              Original amount is required and must be greater than 0.
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={saveLoan}>Add Loan</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Record payment */}
        <Dialog visible={!!pay} onDismiss={() => setPay(null)}>
          <Dialog.Title>{pay?.type === 'emi' ? 'Record EMI' : 'Record Prepayment'}</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Amount (₹)" keyboardType="numeric" value={payAmt} onChangeText={setPayAmt} mode="outlined" dense autoFocus />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPay(null)}>Cancel</Button>
            <Button mode="contained" onPress={recordPayment}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Confirm delete */}
        <Dialog visible={!!confirmId} onDismiss={() => setConfirmId(null)}>
          <Dialog.Title>Delete Loan</Dialog.Title>
          <Dialog.Content><Text>Delete this loan? This cannot be undone.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmId(null)}>Cancel</Button>
            <Button textColor={palette.danger} onPress={doDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default LoansScreen;
