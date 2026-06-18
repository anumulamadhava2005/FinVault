import React, { useState } from 'react';
import { Share, View } from 'react-native';
import { Button, Checkbox, Divider, Snackbar, Text, useTheme } from 'react-native-paper';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { all } from '../db';
import type { Asset, FinancialGoal, InsurancePolicy, Loan } from '../models/types';
import {
  goalsProgress,
  loanStatus,
  netWorth,
  policyStatus,
  portfolioSummary,
  protectSummary,
} from '../services/finance';
import { LOAN_TYPE_LABELS, POLICY_TYPE_LABELS, titleCase } from '../services/constants';
import { Screen, SectionCard, Kpi, Row } from '../components/ui';
import { formatINR } from '../utils/money';
import { todayISO } from '../utils/date';

/** Selectable report modules — Expenses is deliberately absent (parity with T6). */
const MODULES: { key: string; label: string }[] = [
  { key: 'assets', label: 'Assets / Portfolio' },
  { key: 'loans', label: 'Loans & Liabilities' },
  { key: 'protect', label: 'Insurance / Protect' },
  { key: 'goals', label: 'Financial Goals' },
];

const ReportsScreen: React.FC = () => {
  const { userId } = useApp();
  const theme = useTheme();
  const nw = useData(() => netWorth(userId));
  const pf = useData(() => portfolioSummary(userId));

  const [selected, setSelected] = useState<Record<string, boolean>>({ assets: true, loans: true, protect: true, goals: true });
  const [snack, setSnack] = useState('');
  const allOn = MODULES.every((m) => selected[m.key]);

  const toggle = (k: string) => setSelected((s) => ({ ...s, [k]: !s[k] }));
  const toggleAll = () => {
    const next = !allOn;
    setSelected(Object.fromEntries(MODULES.map((m) => [m.key, next])));
  };

  const buildReport = (): string => {
    const lines: string[] = ['FinVault Report', todayISO(), '', `Net Worth: ${formatINR(nw.net_worth)}`, ''];
    if (selected.assets) {
      lines.push('— Assets / Portfolio —');
      lines.push(`Total value ${formatINR(pf.total_value)} · P&L ${pf.pnl_pct}%`);
      all<Asset & { tn: string }>(`SELECT a.*, t.name tn FROM assets a JOIN asset_types t ON t.id=a.asset_type_id WHERE a.user_id=?`, [userId]).forEach((a) =>
        lines.push(`  • ${a.name} (${a.tn}): ${formatINR(a.current_value)}`),
      );
      lines.push('');
    }
    if (selected.loans) {
      lines.push('— Loans & Liabilities —');
      all<Loan>('SELECT * FROM loans WHERE user_id=?', [userId]).forEach((l) =>
        lines.push(`  • ${l.provider || LOAN_TYPE_LABELS[l.loan_type]}: ${formatINR(l.outstanding_amount)} outstanding (${titleCase(loanStatus(l))})`),
      );
      lines.push('');
    }
    if (selected.protect) {
      lines.push('— Insurance / Protect —');
      all<InsurancePolicy>('SELECT * FROM insurance_policies WHERE user_id=?', [userId]).forEach((p) =>
        lines.push(`  • ${p.policy_name} (${POLICY_TYPE_LABELS[p.policy_type]}): ${formatINR(p.coverage_amount)} cover (${titleCase(policyStatus(p))})`),
      );
      lines.push('');
    }
    if (selected.goals) {
      lines.push('— Financial Goals —');
      goalsProgress(userId).goals.forEach((g) => lines.push(`  • ${g.name}: ${g.pct}% (${g.status_label})`));
      lines.push('');
    }
    lines.push('Note: Expense data is excluded from report exports.');
    return lines.join('\n');
  };

  const onExport = async () => {
    const anyOn = MODULES.some((m) => selected[m.key]);
    if (!anyOn) {
      setSnack('Select at least one module to include.');
      return;
    }
    try {
      await Share.share({ title: 'FinVault Report', message: buildReport() });
    } catch {
      setSnack('Export cancelled.');
    }
  };

  return (
    <>
      <Screen>
        <Row>
          <Kpi label="Net Worth" value={formatINR(nw.net_worth)} />
          <Kpi label="Portfolio" value={formatINR(pf.total_value)} sub={`${pf.pnl_pct}% P&L`} subTone={pf.total_pnl >= 0 ? 'good' : 'bad'} />
        </Row>

        <SectionCard title="Export Report" right={<Button compact onPress={toggleAll}>{allOn ? 'Clear all' : 'Select all'}</Button>}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
            Choose the modules to include. Expenses are excluded from report exports.
          </Text>
          {MODULES.map((m) => (
            <Checkbox.Item
              key={m.key}
              label={m.label}
              status={selected[m.key] ? 'checked' : 'unchecked'}
              onPress={() => toggle(m.key)}
              position="leading"
              style={{ paddingVertical: 0 }}
            />
          ))}
          <Divider style={{ marginVertical: 8 }} />
          <Button mode="contained" icon="share-variant" onPress={onExport}>
            Generate & Share Report
          </Button>
        </SectionCard>
      </Screen>

      <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={2500}>
        {snack}
      </Snackbar>
    </>
  );
};

export default ReportsScreen;
