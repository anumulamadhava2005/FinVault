import React, { useState, useMemo, useLayoutEffect } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from 'expo-router';
import {
  Button,
  Card,
  Dialog,
  FAB,
  IconButton,
  Menu,
  Portal,
  Snackbar,
  Text,
  TextInput,
  useTheme,
  HelperText,
  Divider,
  Searchbar,
} from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BouncePressable from '../components/BouncePressable';
import NotificationBell from '../components/NotificationBell';
import AttachmentsSection from '../components/AttachmentsSection';
import type { PickedAttachment } from '../services/attachments';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { all, insert, newId, remove, run } from '../db';
import type { Loan } from '../models/types';
import {
  loanStatus,
  loanSummary,
  remainingMonths,
  totalInterestPayable,
  debtHealth,
} from '../services/finance';
import { generateLoanNotifications } from '../services/notificationService';
import { LOAN_TYPES, LOAN_TYPE_LABELS, LOAN_TYPE_COLORS, titleCase } from '../services/constants';
import { Screen, SectionCard, StatusChip, ProgressBar, LineItem, EmptyState } from '../components/ui';
import { palette } from '../theme';
import { formatINR, formatINRCompact, rupeesToPaise } from '../utils/money';
import { nowISO } from '../utils/date';

const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad'> = {
  active: 'good',
  overdue: 'bad',
  defaulted: 'bad',
  closed: 'warn',
};

const INTEREST_TYPES = ['fixed', 'floating', 'hybrid'];

const blank = {
  loan_type: 'home',
  provider: '',
  account_number: '',
  borrower_name: '',
  original_amount: '',
  outstanding_amount: '',
  interest_rate: '',
  emi_amount: '',
  start_date: '',
  end_date: '',
  next_due_date: '',
  interest_type: 'fixed',
  notes: '',
};

const LoansScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const loans = useData(() =>
    all<Loan>('SELECT * FROM loans WHERE user_id = ? ORDER BY created_at DESC', [userId!]),
  );

  // Generate EMI due/overdue notifications whenever loan data changes
  useData(() => {
    try { generateLoanNotifications(userId!); } catch { /* non-critical */ }
    return null;
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
          <NotificationBell
            kinds={['emi_due', 'emi_overdue']}
            color={theme.colors.onSurface}
          />
        </View>
      ),
    });
  }, [navigation, theme]);
  const summary = useData(() => loanSummary(userId!));
  const debt = useData(() => debtHealth(userId!));

  const [addOpen, setAddOpen] = useState(false);
  const [editLoanId, setEditLoanId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...blank });
  // Attachments collected while adding a new loan (persisted after insert).
  const [loanAttachments, setLoanAttachments] = useState<PickedAttachment[]>([]);
  const [typeMenu, setTypeMenu] = useState(false);
  const [intTypeMenu, setIntTypeMenu] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'overdue' | 'closed'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'outstanding_desc' | 'emi_desc' | 'rate_desc'>('recent');

  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filterTypeMenuOpen, setFilterTypeMenuOpen] = useState(false);
  const [filterStatusMenuOpen, setFilterStatusMenuOpen] = useState(false);
  const [menuLoanId, setMenuLoanId] = useState<string | null>(null);

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);

  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [snackMsg, setSnackMsg] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggleExpand = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  const save = () => {
    if (!form.original_amount.trim() || !form.outstanding_amount.trim()) return;

    const data = {
      loan_type: form.loan_type,
      provider: form.provider.trim() || null,
      account_number: form.account_number.trim() || null,
      borrower_name: form.borrower_name.trim() || null,
      original_amount: rupeesToPaise(form.original_amount || '0'),
      outstanding_amount: rupeesToPaise(form.outstanding_amount || '0'),
      interest_rate: parseFloat(form.interest_rate) || 0,
      emi_amount: rupeesToPaise(form.emi_amount || '0'),
      start_date: form.start_date.trim() || null,
      end_date: form.end_date.trim() || null,
      next_due_date: form.next_due_date.trim() || null,
      interest_type: form.interest_type || null,
      notes: form.notes.trim() || null,
    };

    if (editLoanId) {
      run(
        `UPDATE loans SET
          loan_type=?, provider=?, account_number=?, borrower_name=?,
          original_amount=?, outstanding_amount=?, interest_rate=?, emi_amount=?,
          start_date=?, end_date=?, next_due_date=?, interest_type=?, notes=?
         WHERE id=?`,
        [
          data.loan_type, data.provider, data.account_number, data.borrower_name,
          data.original_amount, data.outstanding_amount, data.interest_rate, data.emi_amount,
          data.start_date, data.end_date, data.next_due_date, data.interest_type, data.notes,
          editLoanId,
        ],
      );
      setEditLoanId(null);
    } else {
      const loanId = newId();
      const now = nowISO();
      insert('loans', {
        id: loanId,
        user_id: userId!,
        ...data,
        prepayment_total: 0,
        status: 'active',
        created_at: now,
      });
      // Persist attachments collected in the form now that the loan row exists.
      for (const att of loanAttachments) {
        insert('loan_images', {
          id: newId(),
          loan_id: loanId,
          user_id: userId!,
          uri: att.uri,
          label: att.label,
          created_at: now,
          local_path: att.local_path,
        });
      }
    }

    setForm({ ...blank });
    setLoanAttachments([]);
    setAddOpen(false);
    refresh();
  };

  const doDelete = () => {
    if (confirmId) {
      run('DELETE FROM loan_payments WHERE loan_id = ?', [confirmId]);
      remove('loans', confirmId);
    }
    setConfirmId(null);
    refresh();
  };

  const handleCsvImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/csv',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const csvText = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const lines = csvText.split(/\r?\n/);
      if (lines.length <= 1) {
        setImportResult({ success: 0, failed: 0, errors: ['No data found or only header row.'] });
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));

      const col = (names: string[]) => {
        for (const n of names) {
          const idx = headers.indexOf(n);
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const typeIdx       = col(['loan_type', 'type']);
      const providerIdx   = col(['provider', 'bank', 'lender']);
      const accIdx        = col(['account_number', 'account_no', 'acc_no']);
      const borrowerIdx   = col(['borrower_name', 'borrower', 'name']);
      const origIdx       = col(['original_amount', 'loan_amount', 'principal']);
      const outIdx        = col(['outstanding_amount', 'outstanding', 'balance', 'remaining']);
      const rateIdx       = col(['interest_rate', 'rate', 'roi']);
      const emiIdx        = col(['emi_amount', 'emi', 'monthly_payment']);
      const startIdx      = col(['start_date', 'start', 'disbursement_date']);
      const endIdx        = col(['end_date', 'end', 'maturity_date', 'closure_date']);
      const dueIdx        = col(['next_due_date', 'due_date', 'next_emi_date']);
      const intTypeIdx    = col(['interest_type', 'rate_type']);

      if (origIdx === -1 || outIdx === -1) {
        setImportResult({
          success: 0, failed: 0,
          errors: ['CSV must contain: original_amount, outstanding_amount.'],
        });
        return;
      }

      const VALID_TYPES = ['home','education','vehicle','personal','credit_card','gold','business','other'];
      let successCount = 0;
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
        const row = matches.map((v) => v.replace(/^"|"$/g, '').trim());
        const rowNum = i + 1;

        const origRaw = (row[origIdx] || '').replace(/[₹,]/g, '').trim();
        const outRaw  = (row[outIdx]  || '').replace(/[₹,]/g, '').trim();

        if (!origRaw || !outRaw) {
          errors.push(`Row ${rowNum}: missing original_amount or outstanding_amount.`);
          continue;
        }

        const orig = parseFloat(origRaw);
        const out  = parseFloat(outRaw);
        if (isNaN(orig) || orig < 0) { errors.push(`Row ${rowNum}: invalid original_amount '${origRaw}'.`); continue; }
        if (isNaN(out)  || out  < 0) { errors.push(`Row ${rowNum}: invalid outstanding_amount '${outRaw}'.`); continue; }

        const rawType = typeIdx >= 0 ? (row[typeIdx] || 'other').toLowerCase().trim() : 'other';
        const loanType = VALID_TYPES.includes(rawType) ? rawType : 'other';

        const rateRaw = rateIdx >= 0 ? row[rateIdx] || '0' : '0';
        const emiRaw  = emiIdx  >= 0 ? (row[emiIdx]  || '').replace(/[₹,]/g, '').trim() : '0';
        const intType = intTypeIdx >= 0 ? row[intTypeIdx] || null : null;

        const startDate = startIdx >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(row[startIdx] || '') ? row[startIdx] : null;
        const endDate   = endIdx   >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(row[endIdx]   || '') ? row[endIdx]   : null;
        const dueDate   = dueIdx   >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(row[dueIdx]   || '') ? row[dueIdx]   : null;

        insert('loans', {
          id: newId(),
          user_id: userId!,
          loan_type: loanType,
          provider: providerIdx >= 0 ? row[providerIdx] || null : null,
          account_number: accIdx >= 0 ? row[accIdx] || null : null,
          borrower_name: borrowerIdx >= 0 ? row[borrowerIdx] || null : null,
          original_amount: rupeesToPaise(origRaw),
          outstanding_amount: rupeesToPaise(outRaw),
          interest_rate: parseFloat(rateRaw) || 0,
          emi_amount: emiRaw ? rupeesToPaise(emiRaw) : 0,
          start_date: startDate,
          end_date: endDate,
          next_due_date: dueDate,
          interest_type: intType,
          prepayment_total: 0,
          notes: null,
          status: 'active',
          created_at: nowISO(),
        });
        successCount++;
      }

      setImportResult({ success: successCount, failed: errors.length, errors });
      refresh();
    } catch {
      setSnackMsg('Import failed. Please check your CSV file.');
    }
  };

  const sortedLoans = useMemo(() => {
    let list = [...loans];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (l) =>
          (l.provider && l.provider.toLowerCase().includes(q)) ||
          LOAN_TYPE_LABELS[l.loan_type]?.toLowerCase().includes(q) ||
          (l.borrower_name && l.borrower_name.toLowerCase().includes(q)),
      );
    }

    if (filterType !== 'all') list = list.filter((l) => l.loan_type === filterType);
    if (filterStatus !== 'all') list = list.filter((l) => loanStatus(l) === filterStatus);

    if (sortBy === 'outstanding_desc') list.sort((a, b) => b.outstanding_amount - a.outstanding_amount);
    else if (sortBy === 'emi_desc')    list.sort((a, b) => b.emi_amount - a.emi_amount);
    else if (sortBy === 'rate_desc')   list.sort((a, b) => b.interest_rate - a.interest_rate);
    else                               list.sort((a, b) => b.created_at.localeCompare(a.created_at));

    return list;
  }, [loans, searchQuery, filterType, filterStatus, sortBy]);

  const bandColor = (band: string) =>
    band === 'safe' ? palette.good : band === 'moderate' ? palette.warn : palette.danger;

  return (
    <>
      <Screen>
        {/* Summary Card */}
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
                Total Outstanding Debt
              </Text>
              <Text
                variant="headlineLarge"
                style={{ fontWeight: '800', marginTop: 4, color: theme.colors.primary, fontVariant: ['tabular-nums'] }}
              >
                {formatINR(summary.total_outstanding)}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                Across {summary.active_count} active loan{summary.active_count !== 1 ? 's' : ''}
              </Text>
            </View>

            <Divider style={{ marginVertical: 16, backgroundColor: theme.colors.outlineVariant }} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                  Monthly EMI
                </Text>
                <Text
                  variant="titleMedium"
                  style={{ fontWeight: '700', marginTop: 2, color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}
                >
                  {formatINR(summary.total_emi)}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: theme.colors.outlineVariant, marginHorizontal: 20 }} />
              <View style={{ flex: 1 }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                  Interest Payable
                </Text>
                <Text
                  variant="titleMedium"
                  style={{ fontWeight: '700', marginTop: 2, color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}
                >
                  {formatINRCompact(summary.total_interest)}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Debt Health Score */}
        {summary.active_count > 0 && (
          <SectionCard title="Debt Health">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12 }}>
              <View style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                borderWidth: 3,
                borderColor: summary.health.score >= 75 ? palette.good : summary.health.score >= 50 ? palette.warn : palette.danger,
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <Text variant="titleMedium" style={{ fontWeight: '800', color: summary.health.score >= 75 ? palette.good : summary.health.score >= 50 ? palette.warn : palette.danger }}>
                  {summary.health.score}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700' }}>{summary.health.rating}</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                  Debt health score out of 100
                </Text>
              </View>
            </View>

            {debt.rows.map((r) => (
              <View key={r.label} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text variant="bodySmall" style={{ fontWeight: '600' }}>{r.label}</Text>
                  <Text variant="bodySmall" style={{ fontWeight: '700', color: bandColor(r.band) }}>
                    {r.value}{r.suffix}
                  </Text>
                </View>
                <ProgressBar
                  pct={Math.min(r.value, 100)}
                  color={bandColor(r.band)}
                  height={5}
                />
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 3, fontSize: 10 }}>
                  {r.hint}
                </Text>
              </View>
            ))}

            {debt.recommendations.length > 0 && (
              <>
                <Divider style={{ marginVertical: 10, backgroundColor: theme.colors.outlineVariant }} />
                <View style={{ gap: 6 }}>
                  {debt.recommendations.map((rec, i) => (
                    <View key={i} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                      <Text style={{ fontSize: 12, marginTop: 1 }}>💡</Text>
                      <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurface }}>{rec}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </SectionCard>
        )}

        {/* Distribution by type */}
        {summary.distribution.length > 0 && (
          <SectionCard title="Debt by Type">
            <View style={{ gap: 12 }}>
              {summary.distribution.map((d) => (
                <View key={d.type}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text variant="bodyMedium" style={{ fontWeight: '600' }}>{d.label}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                      {formatINR(d.outstanding)}
                    </Text>
                  </View>
                  <ProgressBar pct={d.pct} color={d.color} height={6} />
                </View>
              ))}
            </View>
          </SectionCard>
        )}

        {/* Loans list header */}
        <View style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text variant="titleMedium" style={{ fontWeight: '700' }}>
              Loans ({sortedLoans.length})
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {/* Import */}
              <Button compact mode="text" icon="file-upload-outline" onPress={handleCsvImport}>
                Import
              </Button>

              {/* Sort */}
              <Menu
                visible={sortMenuOpen}
                onDismiss={() => setSortMenuOpen(false)}
                anchor={
                  <IconButton icon="sort" size={20} style={{ margin: 0 }} onPress={() => setSortMenuOpen(true)} />
                }
              >
                <Menu.Item title="Recently Added"     onPress={() => { setSortBy('recent');           setSortMenuOpen(false); }} leadingIcon={sortBy === 'recent'           ? 'check' : undefined} />
                <Menu.Item title="Highest Outstanding" onPress={() => { setSortBy('outstanding_desc'); setSortMenuOpen(false); }} leadingIcon={sortBy === 'outstanding_desc'  ? 'check' : undefined} />
                <Menu.Item title="Highest EMI"        onPress={() => { setSortBy('emi_desc');         setSortMenuOpen(false); }} leadingIcon={sortBy === 'emi_desc'         ? 'check' : undefined} />
                <Menu.Item title="Highest Rate"       onPress={() => { setSortBy('rate_desc');        setSortMenuOpen(false); }} leadingIcon={sortBy === 'rate_desc'        ? 'check' : undefined} />
              </Menu>

              {/* Filter by type */}
              <Menu
                visible={filterTypeMenuOpen}
                onDismiss={() => setFilterTypeMenuOpen(false)}
                anchor={
                  <IconButton icon="filter-variant" size={20} style={{ margin: 0 }} onPress={() => setFilterTypeMenuOpen(true)} />
                }
              >
                <Menu.Item title="All Types" onPress={() => { setFilterType('all'); setFilterTypeMenuOpen(false); }} leadingIcon={filterType === 'all' ? 'check' : undefined} />
                {LOAN_TYPES.map(([val, lbl]) => (
                  <Menu.Item key={val} title={lbl} onPress={() => { setFilterType(val); setFilterTypeMenuOpen(false); }} leadingIcon={filterType === val ? 'check' : undefined} />
                ))}
              </Menu>

              {/* Filter by status */}
              <Menu
                visible={filterStatusMenuOpen}
                onDismiss={() => setFilterStatusMenuOpen(false)}
                anchor={
                  <IconButton icon="checkbox-marked-circle-outline" size={20} style={{ margin: 0 }} onPress={() => setFilterStatusMenuOpen(true)} />
                }
              >
                <Menu.Item title="All Statuses" onPress={() => { setFilterStatus('all');    setFilterStatusMenuOpen(false); }} leadingIcon={filterStatus === 'all'     ? 'check' : undefined} />
                <Menu.Item title="Active"        onPress={() => { setFilterStatus('active'); setFilterStatusMenuOpen(false); }} leadingIcon={filterStatus === 'active'  ? 'check' : undefined} />
                <Menu.Item title="Overdue"       onPress={() => { setFilterStatus('overdue');setFilterStatusMenuOpen(false); }} leadingIcon={filterStatus === 'overdue' ? 'check' : undefined} />
                <Menu.Item title="Closed"        onPress={() => { setFilterStatus('closed'); setFilterStatusMenuOpen(false); }} leadingIcon={filterStatus === 'closed'  ? 'check' : undefined} />
              </Menu>
            </View>
          </View>

          <Searchbar
            placeholder="Search loans..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={{ marginBottom: 12, backgroundColor: theme.colors.elevation.level1, height: 40 }}
            inputStyle={{ minHeight: 0 }}
          />
        </View>

        {/* Loan cards */}
        {sortedLoans.length === 0 ? (
          <SectionCard>
            <EmptyState
              icon="bank-outline"
              title="No loans found"
              message={
                searchQuery || filterType !== 'all' || filterStatus !== 'all'
                  ? 'No loans match your search or filters.'
                  : 'Add a loan to track EMIs, interest, and outstanding balance.'
              }
            />
          </SectionCard>
        ) : (
          sortedLoans.map((l) => {
            const st = loanStatus(l);
            const rem = remainingMonths(l);
            const interest = totalInterestPayable(l);
            const repaidPct = l.original_amount > 0
              ? Math.round(((l.original_amount - l.outstanding_amount) / l.original_amount) * 100)
              : 0;
            const isExpanded = !!expanded[l.id];
            const typeColor = LOAN_TYPE_COLORS[l.loan_type] || '#9DD1C2';

            return (
              <Card
                key={l.id}
                style={{
                  marginBottom: 12,
                  borderColor: theme.colors.outlineVariant,
                  borderWidth: 1,
                  backgroundColor: theme.colors.surface,
                  borderRadius: theme.roundness,
                  elevation: 0,
                  overflow: 'hidden',
                }}
              >
                <Card.Content style={{ padding: 16 }}>
                  {/* Header */}
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                        {LOAN_TYPE_LABELS[l.loan_type] || titleCase(l.loan_type)}
                      </Text>
                      <View style={styles.badgeRow}>
                        <View style={[styles.typeBadge, { backgroundColor: typeColor + '22' }]}>
                          <Text variant="labelSmall" style={{ color: typeColor, fontSize: 9, fontWeight: '700' }}>
                            {l.loan_type.toUpperCase().replace('_', ' ')}
                          </Text>
                        </View>
                        {l.provider && (
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {l.provider}
                          </Text>
                        )}
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {st !== 'active' && (
                        <StatusChip label={titleCase(st)} tone={STATUS_TONE[st] || 'good'} />
                      )}
                      <Menu
                        visible={menuLoanId === l.id}
                        onDismiss={() => setMenuLoanId(null)}
                        anchor={
                          <IconButton
                            icon="dots-vertical"
                            size={20}
                            style={{ margin: 0, marginRight: -8 }}
                            onPress={() => setMenuLoanId(l.id)}
                          />
                        }
                      >
                        <Menu.Item
                          leadingIcon="pencil-outline"
                          title="Edit"
                          onPress={() => {
                            setMenuLoanId(null);
                            setForm({
                              loan_type: l.loan_type,
                              provider: l.provider || '',
                              account_number: l.account_number || '',
                              borrower_name: l.borrower_name || '',
                              original_amount: String(l.original_amount / 100),
                              outstanding_amount: String(l.outstanding_amount / 100),
                              interest_rate: String(l.interest_rate),
                              emi_amount: String(l.emi_amount / 100),
                              start_date: l.start_date || '',
                              end_date: l.end_date || '',
                              next_due_date: l.next_due_date || '',
                              interest_type: l.interest_type || 'fixed',
                              notes: l.notes || '',
                            });
                            setEditLoanId(l.id);
                            setAddOpen(true);
                          }}
                        />
                        {st !== 'closed' && (
                          <Menu.Item
                            leadingIcon="check-circle-outline"
                            title="Mark Closed"
                            onPress={() => {
                              setMenuLoanId(null);
                              run('UPDATE loans SET status=?, outstanding_amount=0 WHERE id=?', ['closed', l.id]);
                              refresh();
                            }}
                          />
                        )}
                        <Menu.Item
                          leadingIcon="delete-outline"
                          title="Delete"
                          titleStyle={{ color: theme.colors.error }}
                          onPress={() => { setMenuLoanId(null); setConfirmId(l.id); }}
                        />
                      </Menu>
                    </View>
                  </View>

                  {/* Core metrics */}
                  <View style={styles.metricsRow}>
                    <View style={styles.metricCol}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                        Outstanding
                      </Text>
                      <Text
                        variant="titleMedium"
                        style={{ fontWeight: '700', marginTop: 2, color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}
                      >
                        {formatINR(l.outstanding_amount)}
                      </Text>
                    </View>
                    <View style={styles.metricCol}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                        EMI / Rate
                      </Text>
                      <Text
                        variant="titleMedium"
                        style={{ fontWeight: '700', marginTop: 2, color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}
                      >
                        {formatINRCompact(l.emi_amount)}
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {' '}@ {l.interest_rate}%
                        </Text>
                      </Text>
                    </View>
                  </View>

                  {/* Repayment progress */}
                  {l.original_amount > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          Repaid {repaidPct}%
                        </Text>
                        {rem > 0 && (
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {rem} months left
                          </Text>
                        )}
                      </View>
                      <ProgressBar pct={repaidPct} color={palette.good} height={6} />
                    </View>
                  )}

                  {/* Expandable details */}
                  {isExpanded && (
                    <View style={styles.expandedDetails}>
                      {l.borrower_name   && <LineItem label="Borrower"       value={l.borrower_name} />}
                      {l.account_number  && <LineItem label="Account No."    value={l.account_number} />}
                      {l.interest_type   && <LineItem label="Interest Type"  value={titleCase(l.interest_type)} />}
                      {l.original_amount > 0 && <LineItem label="Loan Amount"  value={formatINR(l.original_amount)} />}
                      {interest > 0      && <LineItem label="Interest Left"  value={formatINR(interest)} />}
                      {l.start_date      && <LineItem label="Start Date"     value={l.start_date} />}
                      {l.end_date        && <LineItem label="End Date"       value={l.end_date} />}
                      {l.next_due_date   && <LineItem label="Next Due"       value={l.next_due_date} />}
                      {l.notes           && <LineItem label="Notes"          value={l.notes} />}

                      {/* Document attachments */}
                      <View style={{ marginTop: 12 }}>
                        <AttachmentsSection
                          userId={userId!}
                          table="loan_images"
                          ownerColumn="loan_id"
                          ownerId={l.id}
                        />
                      </View>
                    </View>
                  )}

                  <Divider style={{ marginVertical: 12, backgroundColor: theme.colors.outlineVariant }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Button
                      mode="text"
                      compact
                      onPress={() => toggleExpand(l.id)}
                      style={{ marginLeft: -8 }}
                      icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                    >
                      {isExpanded ? 'Hide Details' : 'View Details'}
                    </Button>
                  </View>
                </Card.Content>
              </Card>
            );
          })
        )}
      </Screen>

      {/* Floating Add Loan button */}
      <BouncePressable
        onPress={() => {
          setForm({ ...blank });
          setEditLoanId(null);
          setLoanAttachments([]);
          setAddOpen(true);
        }}
        style={{
          position: 'absolute',
          right: 16,
          bottom: Math.max(insets.bottom, 16) + 16,
          zIndex: 10,
        }}
      >
        <FAB
          icon="plus"
          label="Add Loan"
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
        {/* Add / Edit Loan Dialog */}
        <Dialog
          visible={addOpen}
          onDismiss={() => setAddOpen(false)}
          style={{ maxHeight: '85%', borderRadius: theme.roundness }}
        >
          <Dialog.Title>{editLoanId ? 'Edit Loan' : 'Add Loan'}</Dialog.Title>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}>
            {/* Loan Type */}
            <Menu
              visible={typeMenu}
              onDismiss={() => setTypeMenu(false)}
              anchor={
                <Button mode="outlined" onPress={() => setTypeMenu(true)} style={{ marginBottom: 8 }}>
                  {LOAN_TYPE_LABELS[form.loan_type] || 'Select Type'}
                </Button>
              }
            >
              {LOAN_TYPES.map(([v, lbl]) => (
                <Menu.Item key={v} title={lbl} onPress={() => { set('loan_type', v); setTypeMenu(false); }} />
              ))}
            </Menu>

            <TextInput label="Provider / Bank" value={form.provider} onChangeText={(v) => set('provider', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <TextInput label="Account Number" value={form.account_number} onChangeText={(v) => set('account_number', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <TextInput label="Borrower Name" value={form.borrower_name} onChangeText={(v) => set('borrower_name', v)} mode="outlined" dense style={{ marginBottom: 8 }} />

            <TextInput
              label="Loan Amount (₹) *"
              keyboardType="numeric"
              value={form.original_amount}
              onChangeText={(v) => set('original_amount', v)}
              mode="outlined" dense style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Outstanding Amount (₹) *"
              keyboardType="numeric"
              value={form.outstanding_amount}
              onChangeText={(v) => set('outstanding_amount', v)}
              mode="outlined" dense style={{ marginBottom: 8 }}
            />
            <TextInput
              label="EMI Amount (₹)"
              keyboardType="numeric"
              value={form.emi_amount}
              onChangeText={(v) => set('emi_amount', v)}
              mode="outlined" dense style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Interest Rate (%)"
              keyboardType="numeric"
              value={form.interest_rate}
              onChangeText={(v) => set('interest_rate', v)}
              mode="outlined" dense style={{ marginBottom: 8 }}
              placeholder="e.g. 8.5"
            />

            {/* Interest Type */}
            <Menu
              visible={intTypeMenu}
              onDismiss={() => setIntTypeMenu(false)}
              anchor={
                <Button mode="outlined" onPress={() => setIntTypeMenu(true)} style={{ marginBottom: 8 }}>
                  {form.interest_type ? titleCase(form.interest_type) : 'Interest Type'}
                </Button>
              }
            >
              {INTEREST_TYPES.map((t) => (
                <Menu.Item key={t} title={titleCase(t)} onPress={() => { set('interest_type', t); setIntTypeMenu(false); }} />
              ))}
            </Menu>

            {/* Start Date */}
            <Button mode="outlined" onPress={() => setShowStartDatePicker(true)} style={{ marginBottom: 8, borderRadius: theme.roundness }}>
              {form.start_date ? `Start Date: ${form.start_date}` : 'Set Start Date (optional)'}
            </Button>
            {form.start_date ? (
              <Button compact textColor={palette.danger} onPress={() => set('start_date', '')} style={{ marginBottom: 8, alignSelf: 'flex-start' }}>
                Clear Start Date
              </Button>
            ) : null}
            {showStartDatePicker && (
              <DateTimePicker
                value={form.start_date ? new Date(form.start_date + 'T00:00:00') : new Date()}
                mode="date"
                onChange={(_e, d) => { setShowStartDatePicker(false); if (d) set('start_date', d.toISOString().slice(0, 10)); }}
              />
            )}

            {/* End Date */}
            <Button mode="outlined" onPress={() => setShowEndDatePicker(true)} style={{ marginBottom: 8, borderRadius: theme.roundness }}>
              {form.end_date ? `End Date: ${form.end_date}` : 'Set End Date (optional)'}
            </Button>
            {form.end_date ? (
              <Button compact textColor={palette.danger} onPress={() => set('end_date', '')} style={{ marginBottom: 8, alignSelf: 'flex-start' }}>
                Clear End Date
              </Button>
            ) : null}
            {showEndDatePicker && (
              <DateTimePicker
                value={form.end_date ? new Date(form.end_date + 'T00:00:00') : new Date()}
                mode="date"
                onChange={(_e, d) => { setShowEndDatePicker(false); if (d) set('end_date', d.toISOString().slice(0, 10)); }}
              />
            )}

            {/* Next Due Date */}
            <Button mode="outlined" onPress={() => setShowDueDatePicker(true)} style={{ marginBottom: 8, borderRadius: theme.roundness }}>
              {form.next_due_date ? `Next Due: ${form.next_due_date}` : 'Set Next Due Date (optional)'}
            </Button>
            {form.next_due_date ? (
              <Button compact textColor={palette.danger} onPress={() => set('next_due_date', '')} style={{ marginBottom: 8, alignSelf: 'flex-start' }}>
                Clear Due Date
              </Button>
            ) : null}
            {showDueDatePicker && (
              <DateTimePicker
                value={form.next_due_date ? new Date(form.next_due_date + 'T00:00:00') : new Date()}
                mode="date"
                onChange={(_e, d) => { setShowDueDatePicker(false); if (d) set('next_due_date', d.toISOString().slice(0, 10)); }}
              />
            )}

            <TextInput label="Notes" value={form.notes} onChangeText={(v) => set('notes', v)} mode="outlined" dense style={{ marginBottom: 8 }} />

            {/* Attachments (Sanction Letter, Repayment Schedule, EMI documents…) */}
            <View style={{ marginTop: 8, marginBottom: 4 }}>
              {editLoanId ? (
                <AttachmentsSection
                  userId={userId!}
                  table="loan_images"
                  ownerColumn="loan_id"
                  ownerId={editLoanId}
                />
              ) : (
                <AttachmentsSection
                  userId={userId!}
                  pending={loanAttachments}
                  onPendingChange={setLoanAttachments}
                />
              )}
            </View>

            <HelperText type={form.original_amount.trim() && form.outstanding_amount.trim() ? 'info' : 'error'} visible>
              Loan Amount and Outstanding Amount are required.
            </HelperText>
          </ScrollView>
          <Dialog.Actions>
            <Button onPress={() => setAddOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={save}>
              {editLoanId ? 'Save Changes' : 'Add Loan'}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog visible={!!confirmId} onDismiss={() => setConfirmId(null)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title>Delete Loan</Dialog.Title>
          <Dialog.Content>
            <Text>Delete this loan and all its payment records? This cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmId(null)}>Cancel</Button>
            <Button textColor={palette.danger} onPress={doDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Import Result */}
        <Dialog visible={!!importResult} onDismiss={() => setImportResult(null)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title>Import Results</Dialog.Title>
          <Dialog.Content>
            <ScrollView style={{ maxHeight: 300 }}>
              <Text variant="titleMedium" style={{ color: palette.good, fontWeight: '700' }}>
                Successfully Imported: {importResult?.success} rows
              </Text>
              <Text
                variant="titleMedium"
                style={{ color: importResult?.failed ? palette.danger : theme.colors.onSurface, fontWeight: '700', marginTop: 4 }}
              >
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

      <Snackbar visible={snackMsg !== null} onDismiss={() => setSnackMsg(null)} duration={3000}>
        {snackMsg}
      </Snackbar>
    </>
  );
};

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    gap: 16,
  },
  metricCol: {
    flex: 1,
  },
  expandedDetails: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
});

export default LoansScreen;
