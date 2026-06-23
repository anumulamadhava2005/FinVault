import React, { useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import {
  Button,
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
  Card,
} from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BouncePressable from '../components/BouncePressable';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { all, insert, newId, remove, run } from '../db';
import type { InsurancePolicy } from '../models/types';
import { annualPremium, policyStatus, protectSummary, financialHealth } from '../services/finance';
import { POLICY_TYPES, POLICY_TYPE_LABELS, titleCase } from '../services/constants';
import { Screen, SectionCard, StatusChip, ProgressBar, LineItem, EmptyState } from '../components/ui';
import { palette } from '../theme';
import { formatINR, formatINRCompact, rupeesToPaise, pct } from '../utils/money';
import { nowISO } from '../utils/date';

const FREQS = ['monthly', 'quarterly', 'half-yearly', 'yearly', 'one-time'];
const STATUS_TONE: Record<string, 'good' | 'warn' | 'bad'> = {
  active: 'good',
  renewed: 'good',
  expiring: 'warn',
  lapsed: 'bad',
  expired: 'bad',
};

const blank = {
  policy_type: 'life',
  policy_name: '',
  provider: '',
  coverage: '',
  premium: '',
  frequency: 'yearly',
  policy_number: '',
  holder_name: '',
  start_date: '',
  expiry_date: '',
  next_due_date: '',
  nominee_name: '',
  nominee_relationship: '',
  claim_ratio: '',
  tax_benefit: '',
};

const ProtectScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const policies = useData(() => all<InsurancePolicy>('SELECT * FROM insurance_policies WHERE user_id = ? ORDER BY created_at DESC', [userId!]));
  const summary = useData(() => protectSummary(userId!));

  const [addOpen, setAddOpen] = useState(false);

  // CSV Import state
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [snackMsg, setSnackMsg] = useState<string | null>(null);
  const [editPolicyId, setEditPolicyId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...blank });
  const [typeMenu, setTypeMenu] = useState(false);
  const [freqMenu, setFreqMenu] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Search, Filter, Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'expired' | 'lapsed'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'premium_desc' | 'cover_desc'>('recent');

  // Menu Open States
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filterTypeMenuOpen, setFilterTypeMenuOpen] = useState(false);
  const [filterStatusMenuOpen, setFilterStatusMenuOpen] = useState(false);
  const [menuPolicyId, setMenuPolicyId] = useState<string | null>(null);

  // Date Pickers Open States
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showExpiryDatePicker, setShowExpiryDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const save = () => {
    if (!form.policy_name.trim()) return;

    const claimRatioNum = form.claim_ratio.trim() ? parseFloat(form.claim_ratio.trim()) : null;
    const data = {
      policy_type: form.policy_type,
      policy_name: form.policy_name.trim(),
      provider: form.provider.trim() || null,
      policy_number: form.policy_number.trim() || null,
      holder_name: form.holder_name.trim() || null,
      coverage_amount: rupeesToPaise(form.coverage || '0'),
      premium_amount: rupeesToPaise(form.premium || '0'),
      premium_frequency: form.frequency,
      start_date: form.start_date.trim() || null,
      expiry_date: form.expiry_date.trim() || null,
      next_due_date: form.next_due_date.trim() || null,
      nominee_name: form.nominee_name.trim() || null,
      nominee_relationship: form.nominee_relationship.trim() || null,
      claim_ratio: claimRatioNum,
      tax_benefit: form.tax_benefit.trim() || null,
    };

    if (editPolicyId) {
      run(
        `UPDATE insurance_policies SET 
          policy_type = ?, policy_name = ?, provider = ?, policy_number = ?, holder_name = ?, 
          coverage_amount = ?, premium_amount = ?, premium_frequency = ?, start_date = ?, 
          expiry_date = ?, next_due_date = ?, nominee_name = ?, nominee_relationship = ?, 
          claim_ratio = ?, tax_benefit = ? 
        WHERE id = ?`,
        [
          data.policy_type,
          data.policy_name,
          data.provider,
          data.policy_number,
          data.holder_name,
          data.coverage_amount,
          data.premium_amount,
          data.premium_frequency,
          data.start_date,
          data.expiry_date,
          data.next_due_date,
          data.nominee_name,
          data.nominee_relationship,
          data.claim_ratio,
          data.tax_benefit,
          editPolicyId,
        ]
      );
      setEditPolicyId(null);
    } else {
      insert('insurance_policies', {
        id: newId(),
        user_id: userId!,
        ...data,
        notes: null,
        status: 'active',
        riders: null,
        created_at: nowISO(),
      });
    }

    setForm({ ...blank });
    setAddOpen(false);
    refresh();
  };

  const doDelete = () => {
    if (confirmId) remove('insurance_policies', confirmId);
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

      const asset = result.assets[0];
      const csvText = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });

      const lines = csvText.split(/\r?\n/);
      if (lines.length <= 1) {
        setImportResult({ success: 0, failed: 0, errors: ['No data found or only header row exists.'] });
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));

      // Column index helpers
      const col = (names: string[]) => {
        for (const n of names) {
          const idx = headers.indexOf(n);
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const typeIdx = col(['policy_type', 'type']);
      const nameIdx = col(['policy_name', 'name']);
      const providerIdx = col(['provider', 'insurer', 'company']);
      const policyNumIdx = col(['policy_number', 'policy_no', 'number']);
      const holderIdx = col(['holder_name', 'holder', 'insured']);
      const coverageIdx = col(['coverage_amount', 'coverage', 'sum_assured', 'cover']);
      const premiumIdx = col(['premium_amount', 'premium']);
      const freqIdx = col(['premium_frequency', 'frequency', 'freq']);
      const startIdx = col(['start_date', 'start']);
      const expiryIdx = col(['expiry_date', 'expiry', 'end_date', 'end']);
      const dueIdx = col(['next_due_date', 'due_date', 'next_due', 'renewal_date']);
      const nomineeIdx = col(['nominee_name', 'nominee']);
      const nomineeRelIdx = col(['nominee_relationship', 'relationship', 'nominee_rel']);
      const claimRatioIdx = col(['claim_ratio', 'claim_settlement_ratio', 'csr']);
      const taxIdx = col(['tax_benefit', 'tax_section', 'tax']);

      if (nameIdx === -1 || coverageIdx === -1 || premiumIdx === -1) {
        setImportResult({
          success: 0,
          failed: 0,
          errors: ['CSV must contain columns: policy_name, coverage_amount, premium_amount.'],
        });
        return;
      }

      const VALID_TYPES = ['life', 'health', 'term', 'vehicle', 'property', 'travel', 'other'];
      const VALID_FREQS = ['monthly', 'quarterly', 'half-yearly', 'yearly', 'one-time'];

      let successCount = 0;
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
        const row = matches.map((v) => v.replace(/^"|"$/g, '').trim());

        const policyName = nameIdx >= 0 ? row[nameIdx] || '' : '';
        const coverageRaw = coverageIdx >= 0 ? (row[coverageIdx] || '').replace(/[₹,]/g, '').trim() : '0';
        const premiumRaw = premiumIdx >= 0 ? (row[premiumIdx] || '').replace(/[₹,]/g, '').trim() : '0';
        const rowNum = i + 1;

        if (!policyName) {
          errors.push(`Row ${rowNum}: missing policy_name.`);
          continue;
        }

        const coverage = parseFloat(coverageRaw);
        const premium = parseFloat(premiumRaw);
        if (isNaN(coverage) || coverage < 0) {
          errors.push(`Row ${rowNum}: invalid coverage_amount '${coverageRaw}'.`);
          continue;
        }
        if (isNaN(premium) || premium < 0) {
          errors.push(`Row ${rowNum}: invalid premium_amount '${premiumRaw}'.`);
          continue;
        }

        const rawType = typeIdx >= 0 ? (row[typeIdx] || 'other').toLowerCase().trim() : 'other';
        const policyType = VALID_TYPES.includes(rawType) ? rawType : 'other';

        const rawFreq = freqIdx >= 0 ? (row[freqIdx] || 'yearly').toLowerCase().trim() : 'yearly';
        const freq = VALID_FREQS.includes(rawFreq) ? rawFreq : 'yearly';

        const startDate = startIdx >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(row[startIdx] || '') ? row[startIdx] : null;
        const expiryDate = expiryIdx >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(row[expiryIdx] || '') ? row[expiryIdx] : null;
        const dueDate = dueIdx >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(row[dueIdx] || '') ? row[dueIdx] : null;
        const claimRatioRaw = claimRatioIdx >= 0 ? row[claimRatioIdx] : null;
        const claimRatio = claimRatioRaw ? parseFloat(claimRatioRaw) : null;

        insert('insurance_policies', {
          id: newId(),
          user_id: userId!,
          policy_type: policyType,
          policy_name: policyName,
          provider: providerIdx >= 0 ? row[providerIdx] || null : null,
          policy_number: policyNumIdx >= 0 ? row[policyNumIdx] || null : null,
          holder_name: holderIdx >= 0 ? row[holderIdx] || null : null,
          coverage_amount: rupeesToPaise(coverageRaw || '0'),
          premium_amount: rupeesToPaise(premiumRaw || '0'),
          premium_frequency: freq,
          start_date: startDate,
          expiry_date: expiryDate,
          next_due_date: dueDate,
          nominee_name: nomineeIdx >= 0 ? row[nomineeIdx] || null : null,
          nominee_relationship: nomineeRelIdx >= 0 ? row[nomineeRelIdx] || null : null,
          claim_ratio: !isNaN(claimRatio as number) ? claimRatio : null,
          tax_benefit: taxIdx >= 0 ? row[taxIdx] || null : null,
          notes: null,
          status: 'active',
          riders: null,
          created_at: nowISO(),
        });
        successCount++;
      }

      setImportResult({ success: successCount, failed: errors.length, errors });
      refresh();
    } catch (err) {
      setSnackMsg('Import failed. Please check your CSV file.');
    }
  };

  // 15. Dynamic Adequacy Income Retrieval
  const annualIncome = useMemo(() => {
    try {
      const fh = financialHealth(userId!);
      if (fh && fh.monthly_income > 0) {
        return fh.monthly_income * 12;
      }
    } catch (_) {}

    try {
      const allIncome = all<{ amount: number }>('SELECT amount FROM income WHERE user_id = ?', [userId!]);
      if (allIncome.length > 0) {
        const sum = allIncome.reduce((s, i) => s + i.amount, 0);
        return (sum / allIncome.length) * 12;
      }
    } catch (_) {}

    return 0;
  }, [userId]);

  // 16. Insurance Adequacy & Health Insights
  const insuranceInsights = useMemo(() => {
    const list: { text: string; tone: 'good' | 'warn' | 'bad' }[] = [];

    // 1. Life cover adequacy
    const lifeCover = summary.life_cover;
    if (annualIncome > 0) {
      const recLife = annualIncome * 10;
      if (lifeCover >= recLife) {
        list.push({
          text: `Life cover is adequate (${formatINR(lifeCover)} vs recommended ${formatINR(recLife)}).`,
          tone: 'good',
        });
      } else {
        list.push({
          text: `Life cover is low. Recommended: ${formatINR(recLife)} (10x income), Current: ${formatINR(lifeCover)}. Deficit of ${formatINR(recLife - lifeCover)}.`,
          tone: 'bad',
        });
      }
    } else {
      list.push({
        text: 'Add income transactions to calculate life cover adequacy (Recommended: 10x annual income).',
        tone: 'warn',
      });
    }

    // 2. Health cover adequacy
    const healthCover = summary.health_cover;
    const recHealth = 1000000; // ₹10L
    if (healthCover >= recHealth) {
      list.push({
        text: `Health cover is adequate (${formatINR(healthCover)} vs recommended ${formatINR(recHealth)}).`,
        tone: 'good',
      });
    } else {
      list.push({
        text: `Health cover is low. Recommended: ${formatINR(recHealth)} (₹10 Lakhs), Current: ${formatINR(healthCover)}. Deficit of ${formatINR(recHealth - healthCover)}.`,
        tone: 'bad',
      });
    }

    // 3. Health cover share of total protection
    const totalCover = summary.total_cover;
    if (totalCover > 0) {
      const healthPct = (healthCover / totalCover) * 100;
      if (healthPct < 15 && healthCover < recHealth) {
        list.push({
          text: `Health cover is only ${healthPct.toFixed(0)}% of total protection. Ensure health risks are well covered.`,
          tone: 'warn',
        });
      }
    }

    // 4. Expiry / Renewals
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    policies.forEach((p) => {
      if (p.next_due_date || p.expiry_date) {
        const targetDateStr = p.next_due_date || p.expiry_date;
        const targetDate = new Date(targetDateStr! + 'T00:00:00');
        const diffTime = targetDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 45) {
          const typeLabel = POLICY_TYPE_LABELS[p.policy_type] || titleCase(p.policy_type);
          list.push({
            text: `${p.provider || typeLabel} policy renews in ${diffDays} days (${targetDateStr}).`,
            tone: diffDays <= 15 ? 'bad' : 'warn',
          });
        }
      }
    });

    return list;
  }, [summary, annualIncome, policies]);

  // 17. Premium Cashflow Calendar
  const premiumCashflow = useMemo(() => {
    const monthlyTotals: Record<string, number> = {};
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const currentMonthIndex = new Date().getMonth();
    for (let i = 0; i < 6; i++) {
      const idx = (currentMonthIndex + i) % 12;
      monthlyTotals[monthNames[idx]] = 0;
    }

    policies.forEach((p) => {
      const st = policyStatus(p);
      if (st !== 'lapsed' && st !== 'expired' && p.next_due_date) {
        const date = new Date(p.next_due_date + 'T00:00:00');
        const monthName = monthNames[date.getMonth()];
        if (monthName in monthlyTotals) {
          monthlyTotals[monthName] += p.premium_amount;
        }
      }
    });

    return Object.entries(monthlyTotals).map(([month, amount]) => ({ month, amount }));
  }, [policies]);

  // 7. Dynamic Upcoming Renewals
  const upcomingRenewals = useMemo(() => {
    const list: { policy: InsurancePolicy; diffDays: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    policies.forEach((p) => {
      const st = policyStatus(p);
      if (st !== 'lapsed' && st !== 'expired' && p.next_due_date) {
        const due = new Date(p.next_due_date + 'T00:00:00');
        const diffTime = due.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 45) {
          list.push({ policy: p, diffDays });
        }
      }
    });

    return list.sort((a, b) => a.diffDays - b.diffDays);
  }, [policies]);

  // Search & Filter Policies
  const sortedPolicies = useMemo(() => {
    let list = [...policies];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.policy_name.toLowerCase().includes(q) ||
          (p.provider && p.provider.toLowerCase().includes(q)) ||
          POLICY_TYPE_LABELS[p.policy_type].toLowerCase().includes(q)
      );
    }

    if (filterType !== 'all') {
      list = list.filter((p) => p.policy_type === filterType);
    }

    if (filterStatus !== 'all') {
      list = list.filter((p) => policyStatus(p) === filterStatus);
    }

    if (sortBy === 'premium_desc') {
      list.sort((a, b) => annualPremium(b) - annualPremium(a));
    } else if (sortBy === 'cover_desc') {
      list.sort((a, b) => b.coverage_amount - a.coverage_amount);
    } else {
      list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }

    return list;
  }, [policies, searchQuery, filterType, filterStatus, sortBy]);

  return (
    <>
      <Screen>
        {/* 6. Unified Protection Summary Card */}
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
                Total Active Coverage
              </Text>
              <Text
                variant="headlineLarge"
                style={{ fontWeight: '800', marginTop: 4, color: theme.colors.primary, fontVariant: ['tabular-nums'] }}
              >
                {formatINR(summary.total_cover)}
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                Across {policies.filter((p) => policyStatus(p) === 'active').length} active policies
              </Text>
            </View>

            <Divider style={{ marginVertical: 16, backgroundColor: theme.colors.outlineVariant }} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                  Annual Premium
                </Text>
                <Text
                  variant="titleMedium"
                  style={{ fontWeight: '700', marginTop: 2, color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}
                >
                  {formatINR(summary.annual_premium)}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: theme.colors.outlineVariant, marginHorizontal: 20 }} />
              <View style={{ flex: 1 }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                  Life / Health Split
                </Text>
                <Text
                  variant="titleMedium"
                  style={{ fontWeight: '700', marginTop: 2, color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}
                >
                  {formatINRCompact(summary.life_cover)} / {formatINRCompact(summary.health_cover)}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* 7. Upcoming Renewals Banner */}
        {upcomingRenewals.length > 0 && (
          <Card
            style={{
              borderColor: theme.colors.errorContainer,
              borderWidth: 1,
              backgroundColor: theme.colors.errorContainer + '11',
              borderRadius: theme.roundness,
              elevation: 0,
              overflow: 'hidden',
              marginTop: 4,
            }}
          >
            <Card.Content style={{ padding: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.error, fontWeight: '700' }}>
                    🚨 Upcoming Renewal Due
                  </Text>
                  <Text variant="titleMedium" style={{ fontWeight: '700', marginTop: 4 }} numberOfLines={1}>
                    {upcomingRenewals[0].policy.policy_name}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                    {upcomingRenewals[0].policy.provider || POLICY_TYPE_LABELS[upcomingRenewals[0].policy.policy_type]}
                  </Text>
                  <Text variant="bodyMedium" style={{ color: theme.colors.error, fontWeight: '700', marginTop: 2 }}>
                    Premium: {formatINR(upcomingRenewals[0].policy.premium_amount)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <StatusChip
                    label={
                      upcomingRenewals[0].diffDays === 0
                        ? 'Due Today'
                        : upcomingRenewals[0].diffDays === 1
                        ? 'Due Tomorrow'
                        : `Due in ${upcomingRenewals[0].diffDays} days`
                    }
                    tone={upcomingRenewals[0].diffDays <= 7 ? 'bad' : 'warn'}
                  />
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                    Due: {upcomingRenewals[0].policy.next_due_date}
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* 3, 20. Coverage progress bar distribution */}
        {summary.distribution.length > 0 && (
          <SectionCard title="Coverage by Type">
            <View style={{ gap: 12 }}>
              {summary.distribution.map((d) => {
                const pctVal = pct(d.coverage, summary.total_cover);
                return (
                  <View key={d.label}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                        {d.label}
                      </Text>
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', fontVariant: ['tabular-nums'] }}
                      >
                        {formatINR(d.coverage)}
                      </Text>
                    </View>
                    <ProgressBar pct={pctVal} color={d.color} height={6} />
                  </View>
                );
              })}
            </View>
          </SectionCard>
        )}

        {/* 15, 16. Protection adequacy & insights card */}
        <SectionCard title="Insurance Health & Adequacy">
          <View style={{ gap: 8 }}>
            {insuranceInsights.map((insight, idx) => (
              <View key={idx} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginVertical: 2 }}>
                <Text style={{ fontSize: 13, marginTop: 1 }}>
                  {insight.tone === 'good' ? '✓' : '⚠'}
                </Text>
                <Text
                  variant="bodySmall"
                  style={{
                    color: insight.tone === 'bad' ? theme.colors.error : theme.colors.onSurface,
                    fontWeight: insight.tone === 'bad' ? '600' : '400',
                    flex: 1,
                  }}
                >
                  {insight.text}
                </Text>
              </View>
            ))}
          </View>
        </SectionCard>

        {/* 17. Premium Cashflow Section */}
        {premiumCashflow.some((item) => item.amount > 0) && (
          <SectionCard title="Premium Cashflow (Next 6 Months)">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {premiumCashflow.map((item) => (
                <View
                  key={item.month}
                  style={{
                    flex: 1,
                    minWidth: 80,
                    padding: 8,
                    borderRadius: theme.roundness,
                    borderWidth: 1,
                    borderColor: item.amount > 0 ? theme.colors.primaryContainer : theme.colors.outlineVariant,
                    backgroundColor: item.amount > 0 ? theme.colors.primaryContainer + '22' : theme.colors.surface,
                    alignItems: 'center',
                  }}
                >
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700' }}>
                    {item.month}
                  </Text>
                  <Text
                    variant="titleSmall"
                    style={{
                      fontWeight: '700',
                      marginTop: 4,
                      color: item.amount > 0 ? theme.colors.primary : theme.colors.onSurfaceVariant,
                    }}
                  >
                    {item.amount > 0 ? formatINRCompact(item.amount) : '—'}
                  </Text>
                </View>
              ))}
            </View>
          </SectionCard>
        )}

        {/* 12, 13, 14. Search, Filter, and Sort Controls in Policy Header */}
        <View style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text variant="titleMedium" style={{ fontWeight: '700' }}>
              Policies ({sortedPolicies.length})
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {/* Import button */}
              <Button
                compact
                mode="text"
                icon="file-upload-outline"
                onPress={handleCsvImport}
              >
                Import
              </Button>

              {/* Sort Menu */}
              <Menu
                visible={sortMenuOpen}
                onDismiss={() => setSortMenuOpen(false)}
                anchor={
                  <IconButton
                    icon="sort"
                    size={20}
                    style={{ margin: 0 }}
                    onPress={() => setSortMenuOpen(true)}
                  />
                }
              >
                <Menu.Item
                  title="Recently Added"
                  onPress={() => {
                    setSortBy('recent');
                    setSortMenuOpen(false);
                  }}
                  leadingIcon={sortBy === 'recent' ? 'check' : undefined}
                />
                <Menu.Item
                  title="Highest Cover"
                  onPress={() => {
                    setSortBy('cover_desc');
                    setSortMenuOpen(false);
                  }}
                  leadingIcon={sortBy === 'cover_desc' ? 'check' : undefined}
                />
                <Menu.Item
                  title="Highest Premium"
                  onPress={() => {
                    setSortBy('premium_desc');
                    setSortMenuOpen(false);
                  }}
                  leadingIcon={sortBy === 'premium_desc' ? 'check' : undefined}
                />
              </Menu>

              {/* Filter Type Menu */}
              <Menu
                visible={filterTypeMenuOpen}
                onDismiss={() => setFilterTypeMenuOpen(false)}
                anchor={
                  <IconButton
                    icon="filter-variant"
                    size={20}
                    style={{ margin: 0 }}
                    onPress={() => setFilterTypeMenuOpen(true)}
                  />
                }
              >
                <Menu.Item
                  title="All Types"
                  onPress={() => {
                    setFilterType('all');
                    setFilterTypeMenuOpen(false);
                  }}
                  leadingIcon={filterType === 'all' ? 'check' : undefined}
                />
                {POLICY_TYPES.map(([val, lbl]) => (
                  <Menu.Item
                    key={val}
                    title={lbl}
                    onPress={() => {
                      setFilterType(val);
                      setFilterTypeMenuOpen(false);
                    }}
                    leadingIcon={filterType === val ? 'check' : undefined}
                  />
                ))}
              </Menu>

              {/* Filter Status Menu */}
              <Menu
                visible={filterStatusMenuOpen}
                onDismiss={() => setFilterStatusMenuOpen(false)}
                anchor={
                  <IconButton
                    icon="checkbox-marked-circle-outline"
                    size={20}
                    style={{ margin: 0 }}
                    onPress={() => setFilterStatusMenuOpen(true)}
                  />
                }
              >
                <Menu.Item
                  title="All Statuses"
                  onPress={() => {
                    setFilterStatus('all');
                    setFilterStatusMenuOpen(false);
                  }}
                  leadingIcon={filterStatus === 'all' ? 'check' : undefined}
                />
                <Menu.Item
                  title="Active"
                  onPress={() => {
                    setFilterStatus('active');
                    setFilterStatusMenuOpen(false);
                  }}
                  leadingIcon={filterStatus === 'active' ? 'check' : undefined}
                />
                <Menu.Item
                  title="Expired"
                  onPress={() => {
                    setFilterStatus('expired');
                    setFilterStatusMenuOpen(false);
                  }}
                  leadingIcon={filterStatus === 'expired' ? 'check' : undefined}
                />
                <Menu.Item
                  title="Lapsed"
                  onPress={() => {
                    setFilterStatus('lapsed');
                    setFilterStatusMenuOpen(false);
                  }}
                  leadingIcon={filterStatus === 'lapsed' ? 'check' : undefined}
                />
              </Menu>
            </View>
          </View>

          <Searchbar
            placeholder="Search policies..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={{ marginBottom: 12, backgroundColor: theme.colors.elevation.level1, height: 40 }}
            inputStyle={{ minHeight: 0 }}
          />
        </View>

        {/* 1, 2, 4, 5, 8, 10, 11, 18. Policy Cards - Flat layout, zero nested cards, correct currency */}
        {sortedPolicies.length === 0 ? (
          <SectionCard>
            <EmptyState
              icon="shield-alert"
              title="No policies found"
              message={
                searchQuery || filterType !== 'all' || filterStatus !== 'all'
                  ? 'No policies match your search or filters.'
                  : 'Add an insurance policy to track cover and premiums.'
              }
            />
          </SectionCard>
        ) : (
          sortedPolicies.map((p) => {
            const st = policyStatus(p);
            const isExpanded = !!expanded[p.id];

            return (
              <Card
                key={p.id}
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
                  {/* Card Header Title and Status */}
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                        {p.policy_name}
                      </Text>
                      <View style={styles.badgeRow}>
                        <View style={[styles.typeBadge, { backgroundColor: theme.colors.secondaryContainer }]}>
                          <Text
                            variant="labelSmall"
                            style={{ color: theme.colors.onSecondaryContainer, fontSize: 9, fontWeight: '700' }}
                          >
                            {p.policy_type.toUpperCase()}
                          </Text>
                        </View>
                        {p.provider && (
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {p.provider}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {st !== 'active' ? (
                        <StatusChip label={titleCase(st)} tone={STATUS_TONE[st] || 'good'} />
                      ) : (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                          Active
                        </Text>
                      )}
                      <Menu
                        visible={menuPolicyId === p.id}
                        onDismiss={() => setMenuPolicyId(null)}
                        anchor={
                          <IconButton
                            icon="dots-vertical"
                            size={20}
                            style={{ margin: 0, marginRight: -8 }}
                            onPress={() => setMenuPolicyId(p.id)}
                          />
                        }
                      >
                        <Menu.Item
                          leadingIcon="pencil-outline"
                          title="Edit"
                          onPress={() => {
                            setMenuPolicyId(null);
                            setForm({
                              policy_type: p.policy_type,
                              policy_name: p.policy_name,
                              provider: p.provider || '',
                              coverage: String(p.coverage_amount / 100),
                              premium: String(p.premium_amount / 100),
                              frequency: p.premium_frequency,
                              policy_number: p.policy_number || '',
                              holder_name: p.holder_name || '',
                              start_date: p.start_date || '',
                              expiry_date: p.expiry_date || '',
                              next_due_date: p.next_due_date || '',
                              nominee_name: p.nominee_name || '',
                              nominee_relationship: p.nominee_relationship || '',
                              claim_ratio: p.claim_ratio !== null ? String(p.claim_ratio) : '',
                              tax_benefit: p.tax_benefit || '',
                            });
                            setEditPolicyId(p.id);
                            setAddOpen(true);
                          }}
                        />
                        <Menu.Item
                          leadingIcon="delete-outline"
                          title="Delete"
                          titleStyle={{ color: theme.colors.error }}
                          onPress={() => {
                            setMenuPolicyId(null);
                            setConfirmId(p.id);
                          }}
                        />
                      </Menu>
                    </View>
                  </View>

                  {/* Core Metrics: Coverage and Premium (Unified, no duplicates) */}
                  <View style={styles.metricsRow}>
                    <View style={styles.metricCol}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                        Coverage Amount
                      </Text>
                      <Text
                        variant="titleMedium"
                        style={{ fontWeight: '700', marginTop: 2, color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}
                      >
                        {formatINR(p.coverage_amount)}
                      </Text>
                    </View>
                    <View style={styles.metricCol}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                        Premium
                      </Text>
                      <Text
                        variant="titleMedium"
                        style={{ fontWeight: '700', marginTop: 2, color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}
                      >
                        {formatINR(p.premium_amount)}
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {' '}/{p.premium_frequency}
                        </Text>
                      </Text>
                    </View>
                  </View>

                  {/* Expandable Details Container */}
                  {isExpanded && (
                    <View style={styles.expandedDetails}>
                      {p.policy_number && <LineItem label="Policy Number" value={p.policy_number} />}
                      {p.holder_name && <LineItem label="Holder Name" value={p.holder_name} />}
                      {p.nominee_name && (
                        <LineItem
                          label="Nominee"
                          value={`${p.nominee_name}${p.nominee_relationship ? ` (${p.nominee_relationship})` : ''}`}
                        />
                      )}
                      {p.start_date && <LineItem label="Start Date" value={p.start_date} />}
                      {p.expiry_date && <LineItem label="Expiry Date" value={p.expiry_date} />}
                      {p.next_due_date && <LineItem label="Next Due Date" value={p.next_due_date} />}
                      {p.claim_ratio !== null && <LineItem label="Claim Ratio" value={`${p.claim_ratio}%`} />}
                      {p.tax_benefit && <LineItem label="Tax Benefit" value={`Section ${p.tax_benefit}`} />}
                    </View>
                  )}

                  {/* 5. Affordance-driven view details trigger */}
                  <Divider style={{ marginVertical: 12, backgroundColor: theme.colors.outlineVariant }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Button
                      mode="text"
                      compact
                      onPress={() => toggleExpand(p.id)}
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

      {/* Floating Add Insurance button */}
      <BouncePressable
        onPress={() => {
          setForm({ ...blank });
          setEditPolicyId(null);
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
          label="Add Insurance"
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
        {/* Add/Edit Policy Dialog */}
        <Dialog visible={addOpen} onDismiss={() => setAddOpen(false)} style={{ maxHeight: '80%', borderRadius: theme.roundness }}>
          <Dialog.Title>{editPolicyId ? 'Edit Policy' : 'Add Policy'}</Dialog.Title>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}>
            <Menu
              visible={typeMenu}
              onDismiss={() => setTypeMenu(false)}
              anchor={
                <Button mode="outlined" onPress={() => setTypeMenu(true)} style={{ marginBottom: 8 }}>
                  {POLICY_TYPE_LABELS[form.policy_type]}
                </Button>
              }
            >
              {POLICY_TYPES.map(([v, label]) => (
                <Menu.Item
                  key={v}
                  title={label}
                  onPress={() => {
                    set('policy_type', v);
                    setTypeMenu(false);
                  }}
                />
              ))}
            </Menu>

            <TextInput
              label="Policy Name"
              value={form.policy_name}
              onChangeText={(v) => set('policy_name', v)}
              mode="outlined"
              dense
              style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Provider / Insurer"
              value={form.provider}
              onChangeText={(v) => set('provider', v)}
              mode="outlined"
              dense
              style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Policy Number"
              value={form.policy_number}
              onChangeText={(v) => set('policy_number', v)}
              mode="outlined"
              dense
              style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Holder Name"
              value={form.holder_name}
              onChangeText={(v) => set('holder_name', v)}
              mode="outlined"
              dense
              style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Coverage / Sum Assured (₹)"
              keyboardType="numeric"
              value={form.coverage}
              onChangeText={(v) => set('coverage', v)}
              mode="outlined"
              dense
              style={{ marginBottom: 8 }}
            />

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <TextInput
                label="Premium (₹)"
                keyboardType="numeric"
                value={form.premium}
                onChangeText={(v) => set('premium', v)}
                mode="outlined"
                dense
                style={{ flex: 1 }}
              />
              <Menu
                visible={freqMenu}
                onDismiss={() => setFreqMenu(false)}
                anchor={
                  <Button mode="outlined" onPress={() => setFreqMenu(true)} style={{ flex: 1 }}>
                    {form.frequency}
                  </Button>
                }
              >
                {FREQS.map((f) => (
                  <Menu.Item
                    key={f}
                    title={f}
                    onPress={() => {
                      set('frequency', f);
                      setFreqMenu(false);
                    }}
                  />
                ))}
              </Menu>
            </View>

            {/* Start Date DatePicker */}
            <Button
              mode="outlined"
              onPress={() => setShowStartDatePicker(true)}
              style={{ marginBottom: 8, borderRadius: theme.roundness }}
            >
              {form.start_date ? `Start Date: ${form.start_date}` : 'Set Start Date (optional)'}
            </Button>
            {form.start_date ? (
              <Button
                compact
                textColor={palette.danger}
                onPress={() => set('start_date', '')}
                style={{ marginBottom: 8, alignSelf: 'flex-start' }}
              >
                Clear Start Date
              </Button>
            ) : null}
            {showStartDatePicker && (
              <DateTimePicker
                value={form.start_date ? new Date(form.start_date + 'T00:00:00') : new Date()}
                mode="date"
                onChange={(_e, date) => {
                  setShowStartDatePicker(false);
                  if (date) set('start_date', date.toISOString().slice(0, 10));
                }}
              />
            )}

            {/* Expiry Date DatePicker */}
            <Button
              mode="outlined"
              onPress={() => setShowExpiryDatePicker(true)}
              style={{ marginBottom: 8, borderRadius: theme.roundness }}
            >
              {form.expiry_date ? `Expiry Date: ${form.expiry_date}` : 'Set Expiry Date (optional)'}
            </Button>
            {form.expiry_date ? (
              <Button
                compact
                textColor={palette.danger}
                onPress={() => set('expiry_date', '')}
                style={{ marginBottom: 8, alignSelf: 'flex-start' }}
              >
                Clear Expiry Date
              </Button>
            ) : null}
            {showExpiryDatePicker && (
              <DateTimePicker
                value={form.expiry_date ? new Date(form.expiry_date + 'T00:00:00') : new Date()}
                mode="date"
                onChange={(_e, date) => {
                  setShowExpiryDatePicker(false);
                  if (date) set('expiry_date', date.toISOString().slice(0, 10));
                }}
              />
            )}

            {/* Next Due Date DatePicker */}
            <Button
              mode="outlined"
              onPress={() => setShowDueDatePicker(true)}
              style={{ marginBottom: 8, borderRadius: theme.roundness }}
            >
              {form.next_due_date ? `Next Due Date: ${form.next_due_date}` : 'Set Next Due Date (optional)'}
            </Button>
            {form.next_due_date ? (
              <Button
                compact
                textColor={palette.danger}
                onPress={() => set('next_due_date', '')}
                style={{ marginBottom: 8, alignSelf: 'flex-start' }}
              >
                Clear Due Date
              </Button>
            ) : null}
            {showDueDatePicker && (
              <DateTimePicker
                value={form.next_due_date ? new Date(form.next_due_date + 'T00:00:00') : new Date()}
                mode="date"
                onChange={(_e, date) => {
                  setShowDueDatePicker(false);
                  if (date) set('next_due_date', date.toISOString().slice(0, 10));
                }}
              />
            )}

            <TextInput
              label="Nominee Name"
              value={form.nominee_name}
              onChangeText={(v) => set('nominee_name', v)}
              mode="outlined"
              dense
              style={{ marginBottom: 8 }}
            />
            <TextInput
              label="Nominee Relationship"
              value={form.nominee_relationship}
              onChangeText={(v) => set('nominee_relationship', v)}
              mode="outlined"
              dense
              style={{ marginBottom: 8 }}
            />

            <TextInput
              label="Claim Settlement Ratio (%)"
              keyboardType="numeric"
              value={form.claim_ratio}
              onChangeText={(v) => set('claim_ratio', v)}
              mode="outlined"
              dense
              style={{ marginBottom: 8 }}
              placeholder="e.g. 98.5"
            />
            <TextInput
              label="Tax Benefit Section"
              value={form.tax_benefit}
              onChangeText={(v) => set('tax_benefit', v)}
              mode="outlined"
              dense
              style={{ marginBottom: 8 }}
              placeholder="e.g. 80C, 80D"
            />
            <HelperText type={form.policy_name.trim() ? 'info' : 'error'} visible>
              Policy Name is required.
            </HelperText>
          </ScrollView>
          <Dialog.Actions>
            <Button onPress={() => setAddOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={save}>
              {editPolicyId ? 'Save Changes' : 'Add Policy'}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog visible={!!confirmId} onDismiss={() => setConfirmId(null)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title>Delete Policy</Dialog.Title>
          <Dialog.Content>
            <Text>Delete this policy? This cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmId(null)}>Cancel</Button>
            <Button textColor={palette.danger} onPress={doDelete}>
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Import Result Dialog */}
        <Dialog visible={!!importResult} onDismiss={() => setImportResult(null)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title>Import Results</Dialog.Title>
          <Dialog.Content>
            <ScrollView style={{ maxHeight: 300 }}>
              <Text variant="titleMedium" style={{ color: palette.good, fontWeight: '700' }}>
                Successfully Imported: {importResult?.success} rows
              </Text>
              <Text
                variant="titleMedium"
                style={{
                  color: importResult?.failed ? palette.danger : theme.colors.onSurface,
                  fontWeight: '700',
                  marginTop: 4,
                }}
              >
                Failed Rows: {importResult?.failed}
              </Text>
              {importResult?.errors && importResult.errors.length > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Text variant="labelMedium" style={{ fontWeight: '700', marginBottom: 4 }}>
                    Errors:
                  </Text>
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

export default ProtectScreen;
