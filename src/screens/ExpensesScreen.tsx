import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, FAB, IconButton, Menu, Portal, Text, TextInput, useTheme } from 'react-native-paper';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { all, insert, newId, remove } from '../db';
import type { Expense, ExpenseCategory } from '../models/types';
import { categoryBreakdown } from '../services/finance';
import { Screen, SectionCard, Kpi, Row, ProgressBar, EmptyState, LineItem } from '../components/ui';
import { palette, statusColor } from '../theme';
import { formatINR, rupeesToPaise } from '../utils/money';
import { formatDisplayDate, todayISO } from '../utils/date';

const ExpensesScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const categories = useData(() => all<ExpenseCategory>('SELECT * FROM expense_categories WHERE user_id = ? OR is_system = 1 ORDER BY sort_order', [userId]));
  const breakdown = useData(() => categoryBreakdown(userId, year, month));
  const expenses = useData(() =>
    all<Expense & { cat_name: string; color_hex: string }>(
      `SELECT e.*, c.name AS cat_name, c.color_hex FROM expenses e JOIN expense_categories c ON c.id = e.category_id
       WHERE e.user_id = ? ORDER BY e.expense_date DESC LIMIT 50`,
      [userId],
    ),
  );
  const budgetTotal = categories.reduce((s, c) => s + c.budget_amount, 0);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ category_id: '', amount: '', description: '', date: todayISO() });
  const [catMenu, setCatMenu] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const catName = categories.find((c) => c.id === form.category_id)?.name || 'Select category';

  const save = () => {
    const amount = rupeesToPaise(form.amount || '0');
    const catId = form.category_id || categories[0]?.id;
    if (amount <= 0 || !catId) return;
    insert('expenses', {
      id: newId(),
      user_id: userId,
      category_id: catId,
      amount,
      description: form.description || '',
      expense_date: form.date,
      spent_by_id: null,
      notes: null,
    });
    setForm({ category_id: '', amount: '', description: '', date: todayISO() });
    setAddOpen(false);
    refresh();
  };

  const doDelete = () => {
    if (confirmId) remove('expenses', confirmId);
    setConfirmId(null);
    refresh();
  };

  return (
    <>
      <Screen>
        <Row>
          <Kpi label="Spent this month" value={formatINR(breakdown.total)} subTone="bad" />
          <Kpi label="Budget" value={formatINR(budgetTotal)} sub={budgetTotal ? `${Math.round((breakdown.total / budgetTotal) * 100)}% used` : undefined} />
        </Row>

        <SectionCard title="By Category">
          {breakdown.categories.length === 0 ? (
            <Text style={{ color: theme.colors.onSurfaceVariant }}>No expenses logged this month.</Text>
          ) : (
            breakdown.categories.map((c) => (
              <View key={c.id} style={{ marginBottom: 10 }}>
                <LineItem label={c.name} value={`${formatINR(c.amount)}${c.budget ? ` / ${formatINR(c.budget)}` : ''}`} />
                <ProgressBar pct={c.utilized} color={c.over_budget ? palette.danger : c.utilized > 75 ? palette.warn : palette.good} />
              </View>
            ))
          )}
        </SectionCard>

        <Text variant="titleMedium" style={{ fontWeight: '800', marginTop: 4 }}>Recent Expenses</Text>
        {expenses.length === 0 ? (
          <SectionCard><EmptyState icon="cash-multiple" title="No expenses yet" message="Log an expense to start tracking your spending." /></SectionCard>
        ) : (
          <SectionCard>
            {expenses.map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{e.description || e.cat_name}</Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{e.cat_name} · {formatDisplayDate(e.expense_date)}</Text>
                </View>
                <Text variant="titleSmall" style={{ fontWeight: '700' }}>{formatINR(e.amount)}</Text>
                <IconButton icon="delete" iconColor={palette.danger} size={18} onPress={() => setConfirmId(e.id)} accessibilityLabel="Delete expense" />
              </View>
            ))}
          </SectionCard>
        )}
      </Screen>

      <FAB icon="plus" label="Add Expense" style={{ position: 'absolute', right: 16, bottom: 16 }} onPress={() => setAddOpen(true)} />

      <Portal>
        <Dialog visible={addOpen} onDismiss={() => setAddOpen(false)}>
          <Dialog.Title>Add Expense</Dialog.Title>
          <Dialog.Content>
            <Menu visible={catMenu} onDismiss={() => setCatMenu(false)} anchor={<Button mode="outlined" onPress={() => setCatMenu(true)} style={{ marginBottom: 8 }}>{catName}</Button>}>
              {categories.map((c) => <Menu.Item key={c.id} title={c.name} onPress={() => { set('category_id', c.id); setCatMenu(false); }} />)}
            </Menu>
            <TextInput label="Amount (₹)" keyboardType="numeric" value={form.amount} onChangeText={(v) => set('amount', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <TextInput label="Description" value={form.description} onChangeText={(v) => set('description', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <TextInput label="Date (YYYY-MM-DD)" value={form.date} onChangeText={(v) => set('date', v)} mode="outlined" dense />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={save}>Add</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={!!confirmId} onDismiss={() => setConfirmId(null)}>
          <Dialog.Title>Delete Expense</Dialog.Title>
          <Dialog.Content><Text>Delete this expense? This cannot be undone.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmId(null)}>Cancel</Button>
            <Button textColor={palette.danger} onPress={doDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default ExpensesScreen;
