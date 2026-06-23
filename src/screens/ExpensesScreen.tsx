import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useState, useLayoutEffect } from 'react';
import { Platform, ScrollView, View, LayoutAnimation, Alert, Modal, Pressable, StyleSheet } from 'react-native';
import { Button, Card, Dialog, FAB, IconButton, Menu, Portal, SegmentedButtons, Text, TextInput, useTheme, Snackbar, Divider, Searchbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { File, Directory, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useNavigation } from 'expo-router';
import BouncePressable from '../components/BouncePressable';
import NotificationBell from '../components/NotificationBell';
import { ZoomableImage } from '../components/ImageLightbox';
import { DistributionPie, TrendLine } from '../components/charts';
import { EmptyState, Kpi, LineItem, ProgressBar, Row, Screen, SectionCard } from '../components/ui';
import { useApp } from '../context/AppContext';
import { all, insert, newId, remove, update, tx } from '../db';
import { useData } from '../hooks/useData';
import type { Expense, ExpenseCategory } from '../models/types';
import { categoryBreakdown, incomeExpenseSeries, expenseAnalytics, generateSpendingInsights } from '../services/finance';
import { generateExpenseNotifications } from '../services/notificationService';
import { chartColors, palette } from '../theme';
import { formatDisplayDate, localISODate, todayISO } from '../utils/date';
import { formatINR, formatINRCompact, rupeesToPaise } from '../utils/money';

const getMimeType = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext] ?? 'application/octet-stream';
};

const ExpensesScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const now = new Date();
  const navigation = useNavigation();

  // Primary navigation tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'categories' | 'transactions' | 'insights'>('overview');

  // Filters toolbar states
  const [trendType, setTrendType] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);

  const [trendMenu, setTrendMenu] = useState(false);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [tempYear, setTempYear] = useState<number>(now.getFullYear());
  const [budgetSettingsOpen, setBudgetSettingsOpen] = useState(false);
  const [editBudgets, setEditBudgets] = useState<Record<string, string>>({});

  // Bulk operation states
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [snackMsg, setSnackMsg] = useState<string | null>(null);

  // Search & Sort states (only used in Transactions tab)
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  const [sortDialogVisible, setSortDialogVisible] = useState(false);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  const openDocument = async (uri: string, filename: string) => {
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Cannot open', 'No document viewer is available on this device.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: getMimeType(filename),
        dialogTitle: `Open ${filename}`,
        UTI: getMimeType(filename),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('no such file') || msg.includes('not found') || msg.includes('ENOENT')) {
        Alert.alert('File not found', 'This document is no longer available on this device. It may have been deleted.');
      } else {
        Alert.alert('Cannot open', `Unable to open this document: ${msg}`);
      }
    }
  };

  // Scope to the current user. System categories are seeded per-user (user_id set),
  // so `OR is_system = 1` previously pulled in OTHER profiles' system categories,
  // producing duplicate names. The `user_id IS NULL` clause keeps any legacy
  // global system categories. Dedupe by name as a final safety net.
  const categories = useData(() => {
    const rows = all<ExpenseCategory>(
      'SELECT * FROM expense_categories WHERE user_id = ? OR (is_system = 1 AND user_id IS NULL) ORDER BY sort_order',
      [userId!],
    );
    const seen = new Set<string>();
    return rows.filter((c) => {
      const key = c.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
  const expenses = useData(() =>
    all<Expense & { cat_name: string; color_hex: string }>(
      `SELECT e.*, c.name AS cat_name, c.color_hex
       FROM expenses e
       JOIN expense_categories c ON c.id = e.category_id
       WHERE e.user_id = ?
       ORDER BY e.expense_date DESC`,
      [userId!],
    ),
  );

  const analytics = expenseAnalytics(userId!, trendType, selectedYear, selectedMonth);
  const insights = generateSpendingInsights(userId!, trendType, selectedYear, selectedMonth);

  const budgetTotal = categories.reduce((s, c) => s + c.budget_amount, 0);

  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{
    category_id: string;
    amount: string;
    description: string;
    date: string;
    bill_uri: string | null;
  }>({
    category_id: '',
    amount: '',
    description: '',
    date: todayISO(),
    bill_uri: null,
  });
  const [catMenu, setCatMenu] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const exceededCategories = useMemo(() => {
    return (analytics.categories || []).filter((c: any) => c.budget > 0 && c.amount > c.budget);
  }, [analytics.categories]);

  const openBudgetSettings = () => {
    const initial: Record<string, string> = {};
    categories.forEach((c) => {
      initial[c.id] = (c.budget_amount / 100).toString();
    });
    setEditBudgets(initial);
    setBudgetSettingsOpen(true);
  };

  const saveBudgets = () => {
    tx((db) => {
      Object.entries(editBudgets).forEach(([catId, amtStr]) => {
        const paise = rupeesToPaise(amtStr || '0');
        db.runSync(
          'UPDATE expense_categories SET budget_amount = ? WHERE id = ?',
          [paise, catId]
        );
      });
    });
    setSnackMsg('Budgets updated');
    setBudgetSettingsOpen(false);
    refresh();
  };

  // Generate expense budget notifications whenever data changes
  useData(() => {
    try { generateExpenseNotifications(userId!, selectedYear, selectedMonth); } catch { /* non-critical */ }
    return null;
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
          <NotificationBell
            kinds={['budget_exceeded']}
            color={theme.colors.onSurface}
          />
          <IconButton
            icon="bullseye-arrow"
            iconColor={theme.colors.onSurface}
            onPress={openBudgetSettings}
            size={22}
            style={{ margin: 0 }}
          />
        </View>
      ),
    });
  }, [navigation, theme, selectedYear, selectedMonth]);

  const set = (k: keyof typeof form, v: string | null) => setForm((f) => ({ ...f, [k]: v }));
  const catName = categories.find((c) => c.id === form.category_id)?.name || 'Select Category';

  const openNewExpense = () => {
    setEditingId(null);
    setForm({ category_id: categories[0]?.id || '', amount: '', description: '', date: todayISO(), bill_uri: null });
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
      bill_uri: expense.bill_uri || null,
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
        bill_uri: form.bill_uri,
      });
      setSnackMsg('Expense updated');
    } else {
      insert('expenses', {
        id: newId(),
        user_id: userId!,
        category_id: catId,
        amount,
        description: form.description || '',
        expense_date: form.date,
        spent_by_id: null,
        notes: null,
        bill_uri: form.bill_uri,
      });
      setSnackMsg('Expense added');
    }
    setForm({ category_id: '', amount: '', description: '', date: todayISO(), bill_uri: null });
    closeEditor();
    refresh();
  };

  const copyToPersistent = async (uri: string, filename: string): Promise<string> => {
    const attachmentsDir = new Directory(Paths.document, 'attachments');
    try { attachmentsDir.create({ intermediates: true }); } catch { /* already exists */ }
    const cleanFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const destFile = new File(attachmentsDir, newId() + '_' + cleanFilename);
    try {
      const srcFile = new File(uri);
      await srcFile.copy(destFile);
      return destFile.uri;
    } catch (err) {
      console.log('Copy failed, using source uri:', err);
      return uri;
    }
  };

  const handleCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const filename = asset.fileName || 'camera_image.jpg';
      const persistentUri = await copyToPersistent(asset.uri, filename);
      set('bill_uri', persistentUri);
    }
  };

  const handlePickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', 'Photo library access is needed to pick images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const filename = asset.fileName || 'gallery_image.jpg';
      const persistentUri = await copyToPersistent(asset.uri, filename);
      set('bill_uri', persistentUri);
    }
  };

  const handlePickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const filename = asset.name || 'document';
      const persistentUri = await copyToPersistent(asset.uri, filename);
      set('bill_uri', persistentUri);
    }
  };

  const doDelete = () => {
    if (confirmId) {
      remove('expenses', confirmId);
      setSnackMsg('Expense deleted');
    }
    setConfirmId(null);
    refresh();
  };

  // Transaction sorting and filtering logic
  const filteredExpenses = useMemo(() => {
    let list = expenses;
    if (searchQuery.trim()) {
      list = list.filter((e) =>
        (e.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.cat_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'date-desc') {
        return b.expense_date.localeCompare(a.expense_date);
      }
      if (sortBy === 'date-asc') {
        return a.expense_date.localeCompare(b.expense_date);
      }
      if (sortBy === 'amount-desc') {
        return b.amount - a.amount;
      }
      if (sortBy === 'amount-asc') {
        return a.amount - b.amount;
      }
      return 0;
    });
  }, [expenses, searchQuery, sortBy]);

  const handleRowPress = (id: string) => {
    LayoutAnimation.configureNext({
      duration: 250,
      create: {
        type: LayoutAnimation.Types.easeOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.spring,
        springDamping: 0.7,
      },
      delete: {
        type: LayoutAnimation.Types.easeOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
    setExpandedExpenseId((prev) => (prev === id ? null : id));
  };

  // Export to CSV
  const handleExportExpenses = async () => {
    if (expenses.length === 0) return;
    let csvContent = 'Date,Category,Amount,Description\n';
    for (const e of expenses) {
      csvContent += `"${e.expense_date}","${e.cat_name}",${e.amount / 100},"${e.description.replace(/"/g, '""')}"\n`;
    }
    const path = `${FileSystem.documentDirectory}finvault_expenses_export_${Date.now()}.csv`;
    await FileSystem.writeAsStringAsync(path, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
    
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Expenses' });
    } else {
      setSnackMsg('Sharing not available on this device');
    }
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

    const allCats = all<ExpenseCategory>('SELECT * FROM expense_categories WHERE user_id = ?', [userId!]);
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
            [newCatId, userId!, catName],
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
          [newId(), userId!, categoryId, paise, description, dateStr, notes],
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
        {/* Top action row: Period · Trend · Import · Export */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 0, marginBottom: 12, gap: 6, flexWrap: 'wrap' }}>
          <Button
            mode="outlined"
            compact
            onPress={() => {
              setTempYear(selectedYear);
              setPeriodPickerOpen(true);
            }}
            icon="calendar"
            contentStyle={{ flexDirection: 'row-reverse', height: 36 }}
            labelStyle={{ fontSize: 11, fontWeight: '700' }}
          >
            {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][selectedMonth - 1]} {selectedYear}
          </Button>

          <Menu
            visible={trendMenu}
            onDismiss={() => setTrendMenu(false)}
            anchor={
              <Button
                mode="outlined"
                compact
                onPress={() => setTrendMenu(true)}
                icon="chart-timeline-variant"
                contentStyle={{ flexDirection: 'row-reverse', height: 36 }}
                labelStyle={{ fontSize: 11 }}
              >
                {trendType === 'monthly' ? 'Monthly' : 'Yearly'}
              </Button>
            }
          >
            <Menu.Item title="Monthly" onPress={() => { setTrendType('monthly'); setTrendMenu(false); }} />
            <Menu.Item title="Yearly" onPress={() => { setTrendType('yearly'); setTrendMenu(false); }} />
          </Menu>

          <Button
            compact
            mode="text"
            icon="file-upload-outline"
            labelStyle={{ fontSize: 11 }}
            onPress={() => {
              setCsvText('');
              setImportResult(null);
              setCsvOpen(true);
            }}
          >
            Import
          </Button>

          <Button
            compact
            mode="text"
            icon="file-download-outline"
            labelStyle={{ fontSize: 11 }}
            onPress={handleExportExpenses}
          >
            Export
          </Button>
        </View>

        {/* 4-Tab Navigation selector */}
        <SegmentedButtons
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
          buttons={[
            { value: 'overview', label: 'Overview', labelStyle: { fontSize: 12, fontWeight: '600' } },
            { value: 'categories', label: 'Budgets', labelStyle: { fontSize: 12, fontWeight: '600' } },
            { value: 'transactions', label: 'Txns', labelStyle: { fontSize: 12, fontWeight: '600' } },
            { value: 'insights', label: 'Insights', labelStyle: { fontSize: 12, fontWeight: '600' } },
          ]}
          style={{ marginHorizontal: 0, marginBottom: 16 }}
        />

        {/* 1. OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <View style={{ paddingHorizontal: 0, gap: 12 }}>
            {/* Summary card — matches Insurance/Assets card style */}
            <Card
              style={{
                backgroundColor: theme.colors.elevation.level1,
                borderWidth: 1,
                borderColor: theme.colors.outlineVariant,
                borderRadius: theme.roundness,
                overflow: 'hidden',
              }}
            >
              <Card.Content style={{ padding: 20 }}>
                <View>
                  <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                    Total Spending
                  </Text>
                  <Text
                    variant="headlineLarge"
                    style={{ fontWeight: '800', marginTop: 4, color: theme.colors.primary, fontVariant: ['tabular-nums'] }}
                  >
                    {formatINR(analytics.summary.total)}
                  </Text>
                  {budgetTotal > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <View style={{
                        backgroundColor: analytics.summary.total > budgetTotal ? 'rgba(235, 94, 85, 0.15)' : 'rgba(82, 167, 126, 0.15)',
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 8,
                      }}>
                        <Text style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: analytics.summary.total > budgetTotal ? palette.danger : palette.good
                        }}>
                          {Math.round((analytics.summary.total / budgetTotal) * 100)}% of budget
                        </Text>
                      </View>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {analytics.summary.total > budgetTotal ? 'over' : 'within'} limit
                      </Text>
                    </View>
                  )}
                </View>

                <Divider style={{ marginVertical: 16, backgroundColor: theme.colors.outlineVariant }} />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                      Monthly Budget
                    </Text>
                    <Text
                      variant="titleMedium"
                      style={{ fontWeight: '700', marginTop: 2, color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}
                    >
                      {budgetTotal > 0 ? formatINR(budgetTotal) : '—'}
                    </Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: theme.colors.outlineVariant, marginHorizontal: 20 }} />
                  <View style={{ flex: 1 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                      Avg Daily / Txns
                    </Text>
                    <Text
                      variant="titleMedium"
                      style={{ fontWeight: '700', marginTop: 2, color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}
                    >
                      {formatINRCompact(analytics.summary.avg_daily)} · {analytics.summary.count}
                    </Text>
                  </View>
                </View>
              </Card.Content>
            </Card>

            <SectionCard title={trendType === 'monthly' ? 'Daily Spending Trend' : 'Monthly Spending Trend'}>
              <TrendLine
                labels={analytics.labels}
                datasets={[{ data: analytics.values.map((v) => v / 100), color: chartColors.expense }]}
              />
              {analytics.trend.change_pct !== 0 && (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  marginTop: 10,
                  backgroundColor: theme.colors.surfaceVariant,
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                }}>
                  <MaterialCommunityIcons
                    name={analytics.trend.change_pct > 0 ? 'trending-up' : 'trending-down'}
                    size={14}
                    color={analytics.trend.change_pct > 0 ? palette.danger : palette.good}
                  />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurface, fontWeight: '700', fontSize: 11 }}>
                    {analytics.trend.change_pct > 0 ? 'Increased' : 'Decreased'} by {Math.abs(analytics.trend.change_pct)}% vs {analytics.trend.prev_label}
                  </Text>
                </View>
              )}
            </SectionCard>

            {/* Quick Category Breakdown & Actionable Insights */}
            <SectionCard title="Breakdown & Insights">
              {/* Category Breakdown (Mini-Progress Bars) */}
              <View style={{ marginBottom: 12 }}>
                <Text variant="bodySmall" style={{ fontWeight: '700', color: theme.colors.onSurface, marginBottom: 8 }}>
                  Top Categories
                </Text>
                {analytics.top_categories.length === 0 ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>No spending data for this period.</Text>
                ) : (
                  <View style={{ gap: 8 }}>
                    {analytics.top_categories.map((c) => (
                      <View key={c.id}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurface, fontWeight: '600', fontSize: 11 }}>
                              {c.name}
                            </Text>
                          </View>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', fontSize: 11 }}>
                            {formatINR(c.amount)} ({c.pct}%)
                          </Text>
                        </View>
                        <ProgressBar
                          pct={c.pct}
                          color={c.color}
                          height={4}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <Divider style={{ marginVertical: 10, backgroundColor: theme.colors.outlineVariant }} />

              {/* Actionable Insights */}
              <View>
                <Text variant="bodySmall" style={{ fontWeight: '700', color: theme.colors.onSurface, marginBottom: 8 }}>
                  Actionable Insights
                </Text>
                <View style={{ gap: 8 }}>
                  {insights.slice(0, 2).map((insight, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <MaterialCommunityIcons
                        name={insight.includes('increased') ? 'alert-circle-outline' : 'check-circle-outline'}
                        size={16}
                        color={insight.includes('increased') ? palette.danger : palette.good}
                        style={{ marginTop: 1 }}
                      />
                      <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurface, lineHeight: 16, fontSize: 11 }}>
                        {insight}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </SectionCard>
          </View>
        )}

        {/* 2. BUDGETS / CATEGORIES TAB */}
        {activeTab === 'categories' && (
          <View style={{ paddingHorizontal: 0 }}>
            {analytics.categories.length === 0 ? (
              <EmptyState icon="shape-outline" title="No spend recorded" message="Log an expense in a category to see progress here." />
            ) : (
              <SectionCard
                title="Category Budgets"
                right={
                  <IconButton
                    icon="pencil-outline"
                    size={20}
                    onPress={openBudgetSettings}
                    style={{ margin: 0 }}
                  />
                }
              >
                <View style={{ gap: 14 }}>
                  {analytics.categories.map((c) => (
                    <View key={c.id} style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.outlineVariant, paddingBottom: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color }} />
                          <Text variant="bodyMedium" style={{ fontWeight: '700' }}>{c.name}</Text>
                        </View>
                        <Text variant="bodyMedium" style={{ fontWeight: '800' }}>
                          {formatINR(c.amount)}
                          {c.budget > 0 && <Text style={{ color: theme.colors.onSurfaceVariant, fontWeight: '400', fontSize: 11 }}> / {formatINR(c.budget)}</Text>}
                        </Text>
                      </View>
                      <View style={{ marginTop: 6 }}>
                        <ProgressBar
                          pct={c.utilized}
                          color={c.over_budget ? palette.danger : c.utilized > 75 ? palette.warn : palette.good}
                        />
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}>
                          {c.pct}% of period total
                        </Text>
                        {c.prev > 0 && (
                          <Text variant="labelSmall" style={{ color: c.change_pct > 0 ? palette.danger : palette.good, fontWeight: '700', fontSize: 10 }}>
                            {c.change_pct > 0 ? '▲' : '▼'} {Math.abs(c.change_pct)}% vs prev period
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </SectionCard>
            )}
          </View>
        )}

        {/* 3. TRANSACTIONS TAB */}
        {activeTab === 'transactions' && (
          <View style={{ paddingHorizontal: 0, paddingBottom: 80 }}>
            {/* Integrated Search and Sort trigger */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
              <Searchbar
                placeholder="Search transactions…"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={{
                  flex: 1,
                  elevation: 0,
                  borderWidth: 1,
                  borderColor: theme.colors.outlineVariant,
                  backgroundColor: theme.colors.surface,
                  height: 44,
                }}
                inputStyle={{ fontSize: 13, minHeight: 0 }}
              />
              <IconButton
                icon="sort-variant"
                mode="outlined"
                size={22}
                style={{
                  margin: 0,
                  height: 44,
                  width: 44,
                  borderRadius: theme.roundness,
                  borderColor: theme.colors.outlineVariant,
                  backgroundColor: theme.colors.surface,
                }}
                onPress={() => setSortDialogVisible(true)}
                accessibilityLabel="Sort Transactions"
              />
            </View>

            {filteredExpenses.length === 0 ? (
              <SectionCard>
                <EmptyState icon="cash-multiple" title="No transactions found" message="Try matching something else or log a new transaction." />
              </SectionCard>
            ) : (
              <View style={{ gap: 10 }}>
                {filteredExpenses.map((e) => {
                  const isExpanded = expandedExpenseId === e.id;
                  return (
                    <SectionCard
                      key={e.id}
                      onPress={() => handleRowPress(e.id)}
                      style={{
                        padding: 12,
                        borderWidth: 1,
                        borderColor: theme.colors.outlineVariant,
                        backgroundColor: theme.colors.surface,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: e.color_hex }} />
                          <View style={{ flex: 1 }}>
                            <Text variant="bodyMedium" style={{ fontWeight: '700' }}>
                              {e.description || e.cat_name}
                            </Text>
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 1 }}>
                              {e.cat_name} · {formatDisplayDate(e.expense_date)}
                            </Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text variant="titleMedium" style={{ fontWeight: '800' }}>
                            {formatINR(e.amount)}
                          </Text>
                          <MaterialCommunityIcons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={theme.colors.onSurfaceVariant}
                          />
                        </View>
                      </View>

                      {isExpanded && (
                        <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.colors.outlineVariant }}>
                          <Row>
                            <Kpi flex label="Logged Date" value={formatDisplayDate(e.expense_date)} />
                            <Kpi flex label="Raw Amount" value={`₹${(e.amount / 100).toLocaleString('en-IN')}`} />
                          </Row>

                          {e.bill_uri && (
                            <View style={{ marginTop: 12, padding: 8, backgroundColor: theme.colors.surfaceVariant, borderRadius: 8 }}>
                              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6, fontWeight: '700' }}>
                                Attached Bill / Receipt:
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                {e.bill_uri.toLowerCase().endsWith('.pdf') ||
                                 e.bill_uri.toLowerCase().endsWith('.doc') ||
                                 e.bill_uri.toLowerCase().endsWith('.docx') ||
                                 e.bill_uri.toLowerCase().endsWith('.xls') ||
                                 e.bill_uri.toLowerCase().endsWith('.xlsx') ? (
                                  <Pressable
                                    onPress={() => openDocument(e.bill_uri!, e.bill_uri!.split('/').pop() || 'document')}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
                                  >
                                    <MaterialCommunityIcons name="file-document-outline" size={28} color={theme.colors.primary} />
                                    <View style={{ flex: 1 }}>
                                      <Text variant="bodyMedium" numberOfLines={1} style={{ color: theme.colors.primary, fontWeight: '600', textDecorationLine: 'underline' }}>
                                        {decodeURIComponent(e.bill_uri.split('/').pop() || 'view_document')}
                                      </Text>
                                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                        Tap to open/share document
                                      </Text>
                                    </View>
                                  </Pressable>
                                ) : (
                                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 }}>
                                    <Pressable onPress={() => setLightboxUri(e.bill_uri)}>
                                      <Image source={{ uri: e.bill_uri }} style={{ width: 60, height: 60, borderRadius: 6 }} contentFit="cover" />
                                    </Pressable>
                                    <View style={{ flex: 1 }}>
                                      <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurface }}>
                                        {decodeURIComponent(e.bill_uri.split('/').pop() || 'image.jpg')}
                                      </Text>
                                      <Pressable onPress={() => setLightboxUri(e.bill_uri)}>
                                        <Text variant="labelSmall" style={{ color: theme.colors.primary, fontWeight: '600', textDecorationLine: 'underline', marginTop: 4 }}>
                                          Tap to zoom
                                        </Text>
                                      </Pressable>
                                    </View>
                                  </View>
                                )}
                              </View>
                            </View>
                          )}

                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                            <Button
                              mode="outlined"
                              icon="pencil"
                              compact
                              onPress={() => openEditExpense(e)}
                              style={{ borderRadius: theme.roundness, borderColor: theme.colors.outline }}
                              labelStyle={{ fontSize: 11 }}
                            >
                              Edit
                            </Button>
                            <Button
                              mode="outlined"
                              icon="delete"
                              compact
                              buttonColor="transparent"
                              textColor={palette.danger}
                              onPress={() => setConfirmId(e.id)}
                              style={{ borderRadius: theme.roundness, borderColor: palette.danger }}
                              labelStyle={{ fontSize: 11 }}
                            >
                              Delete
                            </Button>
                          </View>
                        </View>
                      )}
                    </SectionCard>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* 4. INSIGHTS TAB */}
        {activeTab === 'insights' && (
          <View style={{ paddingHorizontal: 0, gap: 12 }}>
            {insights.length === 0 ? (
              <EmptyState icon="lightbulb-outline" title="No insights yet" message="Log more expenses to generate custom financial tips." />
            ) : (
              <View style={{ gap: 12 }}>
                {insights.map((insight, idx) => (
                  <SectionCard
                    key={idx}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.outlineVariant,
                      backgroundColor: theme.colors.elevation.level1,
                      padding: 14,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                      <View style={{
                        backgroundColor: insight.includes('increased') || insight.includes('▲') ? 'rgba(235, 94, 85, 0.12)' : 'rgba(82, 167, 126, 0.12)',
                        padding: 6,
                        borderRadius: 8
                      }}>
                        <MaterialCommunityIcons
                          name={insight.includes('increased') || insight.includes('▲') ? 'trending-up' : insight.includes('dropped') || insight.includes('▼') ? 'trending-down' : 'lightbulb-outline'}
                          size={18}
                          color={insight.includes('increased') ? palette.danger : insight.includes('dropped') ? palette.good : theme.colors.primary}
                        />
                      </View>
                      <Text variant="bodyMedium" style={{ flex: 1, color: theme.colors.onSurface, lineHeight: 20, fontWeight: '600' }}>
                        {insight}
                      </Text>
                    </View>
                  </SectionCard>
                ))}
              </View>
            )}
          </View>
        )}
      </Screen>

      <BouncePressable
        onPress={openNewExpense}
        style={{
          position: 'absolute',
          right: 16,
          bottom: 16,
          zIndex: 10,
        }}
      >
        <FAB
          icon="plus"
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: 28,
            elevation: 4,
          }}
          color={theme.colors.onPrimary}
          pointerEvents="none"
        />
      </BouncePressable>

      <Portal>
        {/* ADD/EDIT EXPENSE MODAL OVERHAULED */}
        <Dialog visible={addOpen} onDismiss={closeEditor} style={{ borderRadius: theme.roundness, paddingVertical: 8 }}>
          <Dialog.Title style={{ fontWeight: '700' }}>{editingId ? 'Edit Expense' : 'Add Expense'}</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            {/* Category selection field with dropdown affordance */}
            <Menu
              visible={catMenu}
              onDismiss={() => setCatMenu(false)}
              anchor={
                <Button
                  mode="outlined"
                  onPress={() => setCatMenu(true)}
                  style={{ width: '100%', borderColor: theme.colors.outline, height: 48, justifyContent: 'center' }}
                  contentStyle={{ justifyContent: 'space-between', flexDirection: 'row-reverse', width: '100%', height: 48 }}
                  icon="chevron-down"
                  labelStyle={{ fontSize: 14, fontWeight: '600' }}
                >
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

            {/* Amount input */}
            <TextInput
              label="Amount (₹)"
              keyboardType="numeric"
              value={form.amount}
              onChangeText={(v) => {
                const clean = v.replace(/[^0-9.]/g, '');
                set('amount', clean);
              }}
              placeholder="0.00"
              mode="outlined"
              style={{ backgroundColor: theme.colors.surface }}
            />

            {/* Description / Spender Context */}
            <TextInput
              label="Where did you spend?"
              value={form.description}
              onChangeText={(v) => set('description', v)}
              placeholder="Starbucks, Rent, Petrol, groceries"
              mode="outlined"
              style={{ backgroundColor: theme.colors.surface }}
            />

            {/* Date display field */}
            <TextInput
              label="Date"
              value={formatDisplayDate(form.date)}
              mode="outlined"
              editable={false}
              right={<TextInput.Icon icon="calendar" onPress={openDatePicker} />}
              style={{ backgroundColor: theme.colors.surface }}
            />

            {datePickerOpen && (
              <DateTimePicker
                value={new Date(`${form.date}T00:00:00`)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateChange}
              />
            )}

            {/* Bill Attachment */}
            <View style={{ marginTop: 6 }}>
              <Text variant="labelMedium" style={{ fontWeight: '700', marginBottom: 6, color: theme.colors.onSurfaceVariant }}>
                Bill Attachment
              </Text>
              
              {form.bill_uri ? (
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 8,
                  backgroundColor: theme.colors.surfaceVariant,
                  borderRadius: 8,
                  justifyContent: 'space-between'
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    {form.bill_uri.toLowerCase().endsWith('.pdf') ||
                     form.bill_uri.toLowerCase().endsWith('.doc') ||
                     form.bill_uri.toLowerCase().endsWith('.docx') ||
                     form.bill_uri.toLowerCase().endsWith('.xls') ||
                     form.bill_uri.toLowerCase().endsWith('.xlsx') ? (
                      <MaterialCommunityIcons name="file-document-outline" size={24} color={theme.colors.primary} />
                    ) : (
                      <Image source={{ uri: form.bill_uri }} style={{ width: 36, height: 36, borderRadius: 4 }} contentFit="cover" />
                    )}
                    <Text variant="bodySmall" numberOfLines={1} style={{ flex: 1, color: theme.colors.onSurface }}>
                      {decodeURIComponent(form.bill_uri.split('/').pop() || 'attached_bill')}
                    </Text>
                  </View>
                  <IconButton
                    icon="close-circle-outline"
                    iconColor={palette.danger}
                    size={20}
                    onPress={() => set('bill_uri', null)}
                    style={{ margin: 0 }}
                  />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    compact
                    mode="outlined"
                    icon="camera"
                    style={{ flex: 1, borderRadius: theme.roundness }}
                    labelStyle={{ fontSize: 11 }}
                    onPress={handleCamera}
                  >
                    Camera
                  </Button>
                  <Button
                    compact
                    mode="outlined"
                    icon="image"
                    style={{ flex: 1, borderRadius: theme.roundness }}
                    labelStyle={{ fontSize: 11 }}
                    onPress={handlePickImage}
                  >
                    Gallery
                  </Button>
                  <Button
                    compact
                    mode="outlined"
                    icon="file-document-outline"
                    style={{ flex: 1, borderRadius: theme.roundness }}
                    labelStyle={{ fontSize: 11 }}
                    onPress={handlePickDocument}
                  >
                    Doc
                  </Button>
                </View>
              )}
            </View>
          </Dialog.Content>
          <Dialog.Actions style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 24, marginTop: 8 }}>
            <BouncePressable onPress={closeEditor} style={{ flex: 1 }}>
              <Button style={{ borderRadius: theme.roundness, width: '100%' }} mode="outlined" pointerEvents="none">
                Cancel
              </Button>
            </BouncePressable>
            <BouncePressable onPress={save} style={{ flex: 1 }}>
              <Button mode="contained" style={{ borderRadius: theme.roundness, width: '100%' }} pointerEvents="none">
                {editingId ? 'Save Changes' : 'Save Expense'}
              </Button>
            </BouncePressable>
          </Dialog.Actions>
        </Dialog>

        {/* Delete confirmation dialog */}
        <Dialog visible={confirmId !== null} onDismiss={() => setConfirmId(null)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title>Delete Expense</Dialog.Title>
          <Dialog.Content>
            <Text>Delete this expense? This cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions style={{ flexDirection: 'row', gap: 10 }}>
            <BouncePressable onPress={() => setConfirmId(null)} style={{ flex: 1 }}>
              <Button mode="outlined" style={{ borderRadius: theme.roundness, width: '100%' }} pointerEvents="none">Cancel</Button>
            </BouncePressable>
            <BouncePressable onPress={doDelete} style={{ flex: 1 }}>
              <Button mode="contained" buttonColor={palette.danger} textColor="#fff" style={{ borderRadius: theme.roundness, width: '100%' }} pointerEvents="none">Delete</Button>
            </BouncePressable>
          </Dialog.Actions>
        </Dialog>

        {/* Transactions Sort dialog */}
        <Dialog visible={sortDialogVisible} onDismiss={() => setSortDialogVisible(false)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title style={{ fontWeight: '700' }}>Sort Transactions</Dialog.Title>
          <Dialog.Content style={{ gap: 8 }}>
            {[
              { key: 'date-desc', label: 'Date (Newest to Oldest)' },
              { key: 'date-asc', label: 'Date (Oldest to Newest)' },
              { key: 'amount-desc', label: 'Amount (Highest to Lowest)' },
              { key: 'amount-asc', label: 'Amount (Lowest to Highest)' },
            ].map((opt) => (
              <BouncePressable
                key={opt.key}
                onPress={() => {
                  setSortBy(opt.key as any);
                  setSortDialogVisible(false);
                }}
              >
                <Button
                  mode={sortBy === opt.key ? 'contained' : 'outlined'}
                  style={{ borderRadius: theme.roundness, width: '100%' }}
                  contentStyle={{ justifyContent: 'flex-start' }}
                  pointerEvents="none"
                >
                  {opt.label}
                </Button>
              </BouncePressable>
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <BouncePressable onPress={() => setSortDialogVisible(false)} style={{ width: 100 }}>
              <Button mode="outlined" style={{ borderRadius: theme.roundness, width: '100%' }} pointerEvents="none">Close</Button>
            </BouncePressable>
          </Dialog.Actions>
        </Dialog>

        {/* CSV Import Dialog */}
        <Dialog visible={csvOpen} onDismiss={() => setCsvOpen(false)} style={{ maxHeight: '80%', borderRadius: theme.roundness }}>
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
          <Dialog.Actions style={{ flexDirection: 'row', gap: 10 }}>
            <BouncePressable onPress={() => setCsvOpen(false)} style={{ flex: 1 }}>
              <Button mode="outlined" style={{ borderRadius: theme.roundness, width: '100%' }} pointerEvents="none">Cancel</Button>
            </BouncePressable>
            <BouncePressable onPress={handleCsvImport} style={{ flex: 1 }}>
              <Button mode="contained" style={{ borderRadius: theme.roundness, width: '100%' }} pointerEvents="none">Import</Button>
            </BouncePressable>
          </Dialog.Actions>
        </Dialog>

        {/* CSV Result Dialog */}
        <Dialog visible={!!importResult} onDismiss={() => setImportResult(null)} style={{ borderRadius: theme.roundness }}>
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
            <BouncePressable onPress={() => setImportResult(null)} style={{ width: 100 }}>
              <Button mode="outlined" style={{ borderRadius: theme.roundness, width: '100%' }} pointerEvents="none">Close</Button>
            </BouncePressable>
          </Dialog.Actions>
        </Dialog>

        {/* Custom Period Picker Dialog */}
        <Dialog visible={periodPickerOpen} onDismiss={() => setPeriodPickerOpen(false)} style={{ borderRadius: theme.roundness, paddingVertical: 8 }}>
          <Dialog.Title style={{ fontWeight: '700', textAlign: 'center' }}>Select Period</Dialog.Title>
          <Dialog.Content style={{ gap: 16 }}>
            {/* Year Selector Row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.surfaceVariant, borderRadius: 8, paddingHorizontal: 4 }}>
              <IconButton
                icon="chevron-left"
                onPress={() => setTempYear((y) => y - 1)}
              />
              <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                {tempYear}
              </Text>
              <IconButton
                icon="chevron-right"
                onPress={() => setTempYear((y) => y + 1)}
              />
            </View>

            {/* Months 3x4 Grid */}
            <View style={{ flexWrap: 'wrap', flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((mName, i) => {
                const isSelected = selectedMonth === i + 1 && selectedYear === tempYear;
                return (
                  <View key={i} style={{ width: '22%' }}>
                    <BouncePressable
                      onPress={() => {
                        setSelectedMonth(i + 1);
                        setSelectedYear(tempYear);
                        setPeriodPickerOpen(false);
                        refresh();
                      }}
                    >
                      <Button
                        mode={isSelected ? 'contained' : 'outlined'}
                        compact
                        style={{
                          borderRadius: 8,
                          height: 38,
                          justifyContent: 'center',
                          borderColor: isSelected ? 'transparent' : theme.colors.outline,
                        }}
                        labelStyle={{ fontSize: 11, fontWeight: '700' }}
                        pointerEvents="none"
                      >
                        {mName}
                      </Button>
                    </BouncePressable>
                  </View>
                );
              })}
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <BouncePressable onPress={() => setPeriodPickerOpen(false)} style={{ width: 100 }}>
              <Button mode="outlined" style={{ borderRadius: theme.roundness, width: '100%' }} pointerEvents="none">Cancel</Button>
            </BouncePressable>
          </Dialog.Actions>
        </Dialog>

        {/* Settings dialog removed — Import/Export now live in the top action row */}

        {/* Budget Settings Dialog */}
        <Dialog visible={budgetSettingsOpen} onDismiss={() => setBudgetSettingsOpen(false)} style={{ maxHeight: '80%', borderRadius: theme.roundness }}>
          <Dialog.Title style={{ fontWeight: '700' }}>Budget Settings</Dialog.Title>
          <Dialog.Content style={{ paddingBottom: 10 }}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              Set your monthly spending limit for each category (in Rupees). Set to ₹0 to disable tracking.
            </Text>
            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 12, paddingVertical: 4 }}>
                {categories.map((c) => (
                  <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color_hex }} />
                      <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: '600', color: theme.colors.onSurface }}>
                        {c.name}
                      </Text>
                    </View>
                    <TextInput
                      mode="outlined"
                      dense
                      keyboardType="numeric"
                      value={editBudgets[c.id] ?? ''}
                      onChangeText={(val) => {
                        const clean = val.replace(/[^0-9]/g, ''); // positive integers only
                        setEditBudgets((prev) => ({ ...prev, [c.id]: clean }));
                      }}
                      placeholder="0"
                      style={{ width: 100, height: 36, fontSize: 13, backgroundColor: theme.colors.surface }}
                      contentStyle={{ paddingVertical: 0 }}
                    />
                  </View>
                ))}
              </View>
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions style={{ flexDirection: 'row', gap: 10 }}>
            <BouncePressable onPress={() => setBudgetSettingsOpen(false)} style={{ width: 100 }}>
              <Button mode="outlined" style={{ borderRadius: theme.roundness, width: '100%' }} pointerEvents="none">Cancel</Button>
            </BouncePressable>
            <BouncePressable onPress={saveBudgets} style={{ width: 100 }}>
              <Button mode="contained" style={{ borderRadius: theme.roundness, width: '100%' }} pointerEvents="none">Save</Button>
            </BouncePressable>
          </Dialog.Actions>
        </Dialog>

        {/* Budget alerts now handled by NotificationBell in the header (budget_exceeded kind) */}

        {/* Fullscreen Lightbox Modal for Image Preview */}
        <Modal
          visible={lightboxUri !== null}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setLightboxUri(null)}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            {lightboxUri && (
              <View style={{ width: '100%', height: '80%' }}>
                <ZoomableImage uri={lightboxUri} />
              </View>
            )}
            
            <View style={{
              position: 'absolute',
              top: Platform.OS === 'ios' ? 50 : 20,
              right: 20,
              flexDirection: 'row',
              gap: 12
            }}>
              {lightboxUri && (
                <IconButton
                  icon="share-variant"
                  iconColor="#fff"
                  size={28}
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
                  onPress={() => openDocument(lightboxUri, lightboxUri.split('/').pop() || 'receipt.jpg')}
                />
              )}
              <IconButton
                icon="close"
                iconColor="#fff"
                size={28}
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
                onPress={() => setLightboxUri(null)}
              />
            </View>
          </View>
        </Modal>
      </Portal>

      <Snackbar visible={snackMsg !== null} onDismiss={() => setSnackMsg(null)} duration={3000}>
        {snackMsg}
      </Snackbar>
    </>
  );
};

export default ExpensesScreen;
