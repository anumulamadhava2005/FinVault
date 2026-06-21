import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { Button, Dialog, FAB, IconButton, Menu, Portal, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { DistributionPie, TrendLine } from '../components/charts';
import { EmptyState, Kpi, LineItem, ProgressBar, Row, Screen, SectionCard } from '../components/ui';
import { useApp } from '../context/AppContext';
import { all, insert, newId, remove, update, tx } from '../db';
import { useData } from '../hooks/useData';
import type { Expense, ExpenseCategory } from '../models/types';
import { categoryBreakdown, incomeExpenseSeries, expenseAnalytics, generateSpendingInsights } from '../services/finance';
import { chartColors, palette } from '../theme';
import { formatDisplayDate, localISODate, todayISO } from '../utils/date';
import { formatINR, rupeesToPaise } from '../utils/money';

const categoryIconFor = (name: string) => {
  const key = name.toLowerCase();
  if (key.includes('food') || key.includes('dine')) return 'silverware-fork-knife';
  if (key.includes('travel') || key.includes('trip')) return 'airplane';
  if (key.includes('home') || key.includes('rent') || key.includes('house')) return 'home';
  if (key.includes('health') || key.includes('medical')) return 'medical-bag';
  if (key.includes('bill') || key.includes('utility') || key.includes('power')) return 'flash';
  if (key.includes('shopping') || key.includes('store')) return 'shopping';
  if (key.includes('fuel') || key.includes('transport') || key.includes('car')) return 'car';
  if (key.includes('education') || key.includes('school')) return 'school';
  if (key.includes('gift') || key.includes('fun')) return 'gift';
  if (key.includes('salary') || key.includes('income')) return 'cash';
  return 'currency-inr';
};

const ExpensesScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const now = new Date();

  const [trendType, setTrendType] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);

  const [trendMenu, setTrendMenu] = useState(false);
  const [yearMenu, setYearMenu] = useState(false);
  const [monthMenu, setMonthMenu] = useState(false);

  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const categories = useData(() => all<ExpenseCategory>('SELECT * FROM expense_categories WHERE user_id = ? OR is_system = 1 ORDER BY sort_order', [userId]));
  const expenses = useData(() =>
    all<Expense & { cat_name: string; color_hex: string }>(
      `SELECT e.*, c.name AS cat_name, c.color_hex
       FROM expenses e
       JOIN expense_categories c ON c.id = e.category_id
       WHERE e.user_id = ?
       ORDER BY e.expense_date DESC
       LIMIT 50`,
      [userId],
    ),
  );

  const analytics = expenseAnalytics(userId, trendType, selectedYear, selectedMonth);
  const insights = generateSpendingInsights(userId, trendType, selectedYear, selectedMonth);

  const budgetTotal = categories.reduce((s, c) => s + c.budget_amount, 0);
  const topCategory = analytics.categories[0];

  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ category_id: '', amount: '', description: '', date: todayISO() });
  const [catMenu, setCatMenu] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const catName = categories.find((c) => c.id === form.category_id)?.name || 'Select category';

  const openNewExpense = () => {
    setEditingId(null);
    setForm({ category_id: categories[0]?.id || '', amount: '', description: '', date: todayISO() });
    setAddOpen(true);
  };

  const openEditExpense = (expense: Expense & { cat_name: string; color_hex: string }) => {
    setConfirmId(null);
    setEditingId(expense.id);
    setForm({
      category_id: expense.category_id,
      amount: (expense.amount / 100).toFixed(2),
      description: expense.description,
      date: expense.expense_date,
    });
    setAddOpen(true);
  };

  const closeEditor = () => {
    setAddOpen(false);
    setCatMenu(false);
    setDatePickerOpen(false);
    setEditingId(null);
  };

  const openDatePicker = () => setDatePickerOpen(true);

  const onDateChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS !== 'web') setDatePickerOpen(false);
    if (!selectedDate) return;
    const iso = localISODate(selectedDate);
    set('date', iso);
  };

  const save = () => {
    const amount = rupeesToPaise(form.amount || '0');
    const catId = form.category_id || categories[0]?.id;
    if (amount <= 0 || !catId) return;
    if (editingId) {
      update('expenses', editingId, {
        category_id: catId,
        amount,
        description: form.description || '',
        expense_date: form.date,
      });
    } else {
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
    }
    setForm({ category_id: '', amount: '', description: '', date: todayISO() });
    closeEditor();
    refresh();
  };

  const doDelete = () => {
    if (confirmId) remove('expenses', confirmId);
    setConfirmId(null);
    refresh();
  };

  const handleCsvImport = () => {
    if (!csvText.trim()) return;

    const lines = csvText.split(/\r?\n/);
    if (lines.length <= 1) {
      setImportResult({ success: 0, failed: 0, errors: ['No data found or only header row exists.'] });
      setCsvOpen(false);
      return;
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const dateIdx = headers.indexOf('expense_date') !== -1 ? headers.indexOf('expense_date') : headers.indexOf('date');
    const catIdx = headers.indexOf('category') !== -1 ? headers.indexOf('category') : headers.indexOf('category_name');
    const amountIdx = headers.indexOf('amount');
    const descIdx = headers.indexOf('description') !== -1 ? headers.indexOf('description') : headers.indexOf('desc');
    const notesIdx = headers.indexOf('notes');

    if (dateIdx === -1 || amountIdx === -1 || descIdx === -1) {
      setImportResult({
        success: 0,
        failed: 0,
        errors: ['CSV must contain headers: expense_date, amount, description.'],
      });
      setCsvOpen(false);
      return;
    }

    const allCats = all<ExpenseCategory>('SELECT * FROM expense_categories');
    const catIndex = new Map<string, string>();
    for (const c of allCats) {
      catIndex.set(c.name.toLowerCase(), c.id);
      catIndex.set(c.name.toLowerCase().replace(/ /g, '-'), c.id);
    }

    let successCount = 0;
    const errors: string[] = [];
    let createdCategories = 0;

    tx((database) => {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Tolerant comma splitting
        const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
        const row = matches.map((val) => val.replace(/^"|"$/g, '').trim());

        const dateStr = row[dateIdx] || '';
        const catName = row[catIdx] || 'Uncategorized';
        const amountRaw = (row[amountIdx] || '').replace(/[₹,]/g, '').trim();
        const description = row[descIdx] || '';
        const notes = notesIdx !== -1 ? row[notesIdx] || null : null;

        const rowNum = i + 1;

        if (!dateStr || !description || !amountRaw) {
          errors.push(`Row ${rowNum}: missing required field (date, amount, description).`);
          continue;
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          errors.push(`Row ${rowNum}: invalid date format '${dateStr}' (expected YYYY-MM-DD).`);
          continue;
        }

        const amount = parseFloat(amountRaw);
        if (isNaN(amount) || amount <= 0) {
          errors.push(`Row ${rowNum}: invalid amount '${amountRaw}' (must be a number > 0).`);
          continue;
        }

        let categoryId = catIndex.get(catName.toLowerCase());
        if (!categoryId) {
          if (createdCategories >= 10) {
            errors.push(`Row ${rowNum}: category limit reached, skipped new category '${catName}'.`);
            continue;
          }
          const newCatId = newId();
          const slug = catName.toLowerCase().replace(/ /g, '-');
          database.runSync(
            `INSERT INTO expense_categories (id, user_id, name, is_system, budget_amount, sort_order, color_hex)
             VALUES (?, ?, ?, 0, 0, 100, '#6B7280')`,
            [newCatId, userId, catName],
          );
          categoryId = newCatId;
          catIndex.set(catName.toLowerCase(), categoryId);
          catIndex.set(slug, categoryId);
          createdCategories++;
        }

        const paise = rupeesToPaise(amountRaw);
        database.runSync(
          `INSERT INTO expenses (id, user_id, category_id, amount, description, expense_date, spent_by_id, notes)
           VALUES (?, ?, ?, ?, ?, ?, null, ?)`,
          [newId(), userId, categoryId, paise, description, dateStr, notes],
        );
        successCount++;
      }
    });

    setImportResult({ success: successCount, failed: errors.length, errors });
    setCsvOpen(false);
    refresh();
  };

  return (
    <>
      <Screen>
        <SegmentedButtons
          value={trendType}
          onValueChange={(v) => setTrendType(v as 'monthly' | 'yearly')}
          buttons={[
            { value: 'monthly', label: 'Month-to-Month', icon: 'chart-timeline-variant' },
            { value: 'yearly', label: 'Year-to-Year', icon: 'calendar-sync' },
          ]}
          style={{ marginBottom: 12 }}
        />

        {trendType === 'monthly' && (
          <Row style={{ marginBottom: 12, justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 2 }}>
              <Menu
                visible={yearMenu}
                onDismiss={() => setYearMenu(false)}
                anchor={
                  <Button
                    mode="outlined"
                    onPress={() => setYearMenu(true)}
                    icon="chevron-down"
                    contentStyle={{ flexDirection: 'row-reverse' }}
                    labelStyle={{ fontSize: 13 }}
                    style={{ width: '100%' }}
                  >
                    {selectedYear}
                  </Button>
                }
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <Menu.Item key={y} title={String(y)} onPress={() => { setSelectedYear(y); setYearMenu(false); }} />
                ))}
              </Menu>
            </View>

            <View style={{ flex: 3 }}>
              <Menu
                visible={monthMenu}
                onDismiss={() => setMonthMenu(false)}
                anchor={
                  <Button
                    mode="outlined"
                    onPress={() => setMonthMenu(true)}
                    icon="chevron-down"
                    contentStyle={{ flexDirection: 'row-reverse' }}
                    labelStyle={{ fontSize: 13 }}
                    style={{ width: '100%' }}
                  >
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][selectedMonth - 1]}
                  </Button>
                }
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <Menu.Item
                    key={i + 1}
                    title={['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][i]}
                    onPress={() => { setSelectedMonth(i + 1); setMonthMenu(false); }}
                  />
                ))}
              </Menu>
            </View>
          </Row>
        )}

        <Row>
          <Kpi label="Total Spent" value={formatINR(analytics.summary.total)} subTone="bad" />
          <Kpi
            label="Budget"
            value={formatINR(budgetTotal)}
            sub={budgetTotal ? `${Math.round((analytics.summary.total / budgetTotal) * 100)}% used` : undefined}
          />
        </Row>
        <Row style={{ marginTop: 4 }}>
          <Kpi label="Avg Daily" value={formatINR(analytics.summary.avg_daily)} />
          <Kpi label="Transactions" value={String(analytics.summary.count)} sub="logged this period" />
        </Row>

        <SectionCard title={`${trendType === 'monthly' ? 'Monthly' : 'Yearly'} Trend` + (analytics.trend.change_pct !== 0 ? ` (${analytics.trend.direction})` : '')}>
          <TrendLine
            labels={analytics.labels}
            legend={['Expense']}
            datasets={[{ data: analytics.values.map((v) => v / 100), color: chartColors.expense }]}
          />
          {analytics.trend.change_pct !== 0 && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
              {analytics.trend.change_pct > 0 ? 'Increased' : 'Decreased'} by {Math.abs(analytics.trend.change_pct)}% vs {analytics.trend.prev_label}
            </Text>
          )}
        </SectionCard>

        {analytics.categories.length > 0 ? (
          <SectionCard title="Category Split">
            <DistributionPie data={analytics.categories.map((c) => ({ name: c.name, value: c.amount / 100, color: c.color }))} />
          </SectionCard>
        ) : null}

        <SectionCard title="By Category">
          {analytics.categories.length === 0 ? (
            <Text style={{ color: theme.colors.onSurfaceVariant }}>No expenses logged this period.</Text>
          ) : (
            analytics.categories.map((c) => (
              <View key={c.id} style={{ marginBottom: 10 }}>
                <LineItem label={c.name} value={`${formatINR(c.amount)}${c.budget ? ` / ${formatINR(c.budget)}` : ''}`} valueColor={c.color} />
                <ProgressBar pct={c.utilized} color={c.over_budget ? palette.danger : c.utilized > 75 ? palette.warn : palette.good} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {c.pct ? `${c.pct}% of period` : 'No spend yet'}
                  </Text>
                  {c.prev > 0 && (
                    <Text variant="labelSmall" style={{ color: c.change_pct > 0 ? palette.danger : palette.good, fontWeight: '700' }}>
                      {c.change_pct > 0 ? '▲' : '▼'} {Math.abs(c.change_pct)}% vs prev
                    </Text>
                  )}
                </View>
              </View>
            ))
          )}
        </SectionCard>

        <SectionCard title="Spending Insights" style={{ backgroundColor: theme.dark ? '#1a2421' : '#f0fdf4' }}>
          {insights.map((insight, idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginVertical: 4 }}>
              <MaterialCommunityIcons
                name={insight.includes('increased') || insight.includes('▲') ? 'trending-up' : insight.includes('dropped') || insight.includes('▼') ? 'trending-down' : 'lightbulb-outline'}
                size={16}
                color={insight.includes('increased') ? palette.danger : insight.includes('dropped') || insight.includes('save') ? palette.good : theme.colors.primary}
                style={{ marginRight: 8, marginTop: 2 }}
              />
              <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurface }}>
                {insight}
              </Text>
            </View>
          ))}
        </SectionCard>

        <SectionCard title="Bulk Operations">
          <Button mode="outlined" icon="file-upload" onPress={() => { setCsvOpen(true); setCsvText(''); setImportResult(null); }}>
            Import Expenses from CSV
          </Button>
        </SectionCard>

        {topCategory ? (
          <SectionCard title="Quick Summary">
            <LineItem label="Top category" value={`${topCategory.name} · ${formatINR(topCategory.amount)}`} valueColor={topCategory.color} />
            <LineItem label="Categories used" value={`${analytics.categories.length}`} />
            <LineItem label="Budget used" value={budgetTotal ? `${Math.round((analytics.summary.total / budgetTotal) * 100)}%` : 'No budget set'} />
          </SectionCard>
        ) : null}

        <Text variant="titleMedium" style={{ fontWeight: '800', marginTop: 4 }}>
          Recent Expenses
        </Text>
        {expenses.length === 0 ? (
          <SectionCard>
            <EmptyState icon="cash-multiple" title="No expenses yet" message="Log an expense to start tracking your spending." />
          </SectionCard>
        ) : (
          <SectionCard>
            {expenses.map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: e.color_hex, marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                    {e.description || e.cat_name}
                  </Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {e.cat_name} · {formatDisplayDate(e.expense_date)}
                  </Text>
                </View>
                <Text variant="titleSmall" style={{ fontWeight: '700' }}>
                  {formatINR(e.amount)}
                </Text>
                <IconButton icon="pencil" size={18} onPress={() => openEditExpense(e)} accessibilityLabel="Edit expense" />
                <IconButton icon="delete" iconColor={palette.danger} size={18} onPress={() => setConfirmId(e.id)} accessibilityLabel="Delete expense" />
              </View>
            ))}
          </SectionCard>
        )}
      </Screen>

      <FAB icon="plus" label="Add Expense" style={{ position: 'absolute', right: 16, bottom: 16 }} onPress={openNewExpense} />

      <Portal>
        <Dialog visible={addOpen} onDismiss={closeEditor}>
          <Dialog.Title>{editingId ? 'Edit Expense' : 'Add Expense'}</Dialog.Title>
          <Dialog.Content>
            <Menu
              visible={catMenu}
              onDismiss={() => setCatMenu(false)}
              anchor={
                <Button mode="outlined" onPress={() => setCatMenu(true)} style={{ marginBottom: 8 }} icon={categoryIconFor(catName)}>
                  {catName}
                </Button>
              }
            >
              {categories.map((c) => (
                <Menu.Item
                  key={c.id}
                  title={c.name}
                  onPress={() => {
                    set('category_id', c.id);
                    setCatMenu(false);
                  }}
                />
              ))}
            </Menu>
            <TextInput label="Amount (₹)" keyboardType="numeric" value={form.amount} onChangeText={(v) => set('amount', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <TextInput label="Description" value={form.description} onChangeText={(v) => set('description', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <TextInput
              label="Date"
              value={form.date}
              onChangeText={(v) => set('date', v)}
              mode="outlined"
              dense
              right={<TextInput.Icon icon="calendar" onPress={openDatePicker} />}
              onFocus={Platform.OS === 'web' ? undefined : openDatePicker}
              style={{ marginBottom: 8 }}
            />
            {datePickerOpen ? (
              <DateTimePicker
                value={new Date(`${form.date}T00:00:00`)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateChange}
              />
            ) : null}
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {Platform.OS === 'web' ? 'Type the date or use the calendar icon.' : 'Use the calendar picker to change the date.'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeEditor}>Cancel</Button>
            <Button mode="contained" onPress={save}>{editingId ? 'Save' : 'Add'}</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={!!confirmId} onDismiss={() => setConfirmId(null)}>
          <Dialog.Title>Delete Expense</Dialog.Title>
          <Dialog.Content>
            <Text>Delete this expense? This cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmId(null)}>Cancel</Button>
            <Button textColor={palette.danger} onPress={doDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>

        {/* CSV Import Dialog */}
        <Dialog visible={csvOpen} onDismiss={() => setCsvOpen(false)} style={{ maxHeight: '80%' }}>
          <Dialog.Title>CSV Bulk Import</Dialog.Title>
          <Dialog.Content>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                Paste CSV data. Expected columns:
              </Text>
              <Text variant="labelSmall" style={{ fontFamily: 'monospace', backgroundColor: theme.colors.surfaceVariant, padding: 6, borderRadius: 4, marginBottom: 12 }}>
                expense_date,category,amount,description,notes
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                Example row:
              </Text>
              <Text variant="labelSmall" style={{ fontFamily: 'monospace', backgroundColor: theme.colors.surfaceVariant, padding: 6, borderRadius: 4, marginBottom: 12 }}>
                2026-06-20,Food & Dining,250.50,Lunch,Split with friend
              </Text>
              <TextInput
                label="CSV Content"
                multiline
                numberOfLines={8}
                value={csvText}
                onChangeText={setCsvText}
                mode="outlined"
                placeholder="expense_date,category,amount,description,notes&#10;2026-06-20,Food & Dining,250.50,Lunch,Split with friend"
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCsvOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleCsvImport}>Import</Button>
          </Dialog.Actions>
        </Dialog>

        {/* CSV Result Dialog */}
        <Dialog visible={!!importResult} onDismiss={() => setImportResult(null)}>
          <Dialog.Title>Import Results</Dialog.Title>
          <Dialog.Content>
            <ScrollView style={{ maxHeight: 300 }}>
              <Text variant="titleMedium" style={{ color: palette.good, fontWeight: '700' }}>
                Successfully Imported: {importResult?.success} rows
              </Text>
              <Text variant="titleMedium" style={{ color: importResult?.failed ? palette.danger : theme.colors.onSurface, fontWeight: '700', marginTop: 4 }}>
                Failed Rows: {importResult?.failed}
              </Text>
              {importResult?.errors && importResult.errors.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text variant="labelMedium" style={{ fontWeight: '700', marginBottom: 4 }}>Errors:</Text>
                  {importResult.errors.map((err, idx) => (
                    <Text key={idx} variant="bodySmall" style={{ color: palette.danger, marginVertical: 2 }}>
                      • {err}
                    </Text>
                  ))}
                </View>
              )}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setImportResult(null)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default ExpensesScreen;
