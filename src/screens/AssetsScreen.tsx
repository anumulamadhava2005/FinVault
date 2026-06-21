import React, { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { Button, Dialog, FAB, Portal, Searchbar, Snackbar, Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { all, first, insert, newId, remove, tx } from '../db';
import type { Asset, AssetType, SIPSchedule, User } from '../models/types';
import { benchmarkComparison, portfolioSummary } from '../services/finance';
import { Screen, SectionCard, Kpi, Row, EmptyState } from '../components/ui';
import { DistributionPie, GroupedBars } from '../components/charts';
import AssetRow from '../components/assets/AssetRow';
import AssetForm, { AssetFormValues } from '../components/assets/AssetForm';
import AssetTypeTabs from '../components/assets/AssetTypeTabs';
import BulkImportModal from '../components/assets/BulkImportModal';
import SIPModal from '../components/assets/SIPModal';
import type { SIPConfigValues } from '../hooks/assets/useSIPConfig';
import { chartColors, palette } from '../theme';
import { formatINRCompact } from '../utils/money';
import { nowISO, todayISO } from '../utils/date';
import { useRefreshPrices } from '../hooks/assets/useRefreshPrices';

const PIE = ['#4A7C6F', '#7FB5A8', '#D4956A', '#2D3142', '#F0B429', '#52A77E', '#316357', '#9DD1C2'];

const AssetsScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const router = useRouter();
  const user = useData(() => first<User>('SELECT * FROM users WHERE id = ?', [userId]));
  const assetTypes = useData(() => all<AssetType>('SELECT * FROM asset_types ORDER BY sort_order'));
  const assets = useData(() =>
    all<Asset & { type_name: string; slug: string }>(
      `SELECT a.*, t.name AS type_name, t.slug FROM assets a
       JOIN asset_types t ON t.id = a.asset_type_id
       WHERE a.user_id = ? ORDER BY a.current_value DESC`,
      [userId],
    ),
  );
  const pf = useData(() => portfolioSummary(userId));
  const bench = useData(() => benchmarkComparison(userId, user?.risk_profile || 'moderate'));

  const insets = useSafeAreaInsets();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [snackMsg, setSnackMsg] = useState<string | null>(null);
  const [activeTypeSlug, setActiveTypeSlug] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [sipAssetId, setSipAssetId] = useState<string | null>(null);
  const [sipModalOpen, setSipModalOpen] = useState(false);
  const [currentSip, setCurrentSip] = useState<SIPSchedule | null>(null);

  const { status: refreshStatus, refresh: refreshPrices } = useRefreshPrices(userId, () => {
    refresh();
  });

  const handleRefreshPrices = async () => {
    const result = await refreshPrices();
    if (result) {
      const msg =
        result.failed.length
          ? `Updated ${result.updated}, failed: ${result.failed.slice(0, 2).join(', ')}${result.failed.length > 2 ? '…' : ''}`
          : `Updated ${result.updated} asset${result.updated !== 1 ? 's' : ''}`;
      setSnackMsg(msg);
    }
  };

  const handleSave = (values: AssetFormValues) => {
    const typeId = values.asset_type_id || assetTypes[0]?.id;
    if (!values.name.trim() || !typeId) return;
    insert('assets', {
      id: newId(),
      user_id: userId,
      asset_type_id: typeId,
      name: values.name.trim(),
      invested_amount: values.invested_amount,
      current_value: values.current_value || values.invested_amount,
      quantity: values.quantity ?? 0,
      purchase_date: values.investment_date,
      investment_date: values.investment_date,
      maturity_date: values.maturity_date,
      guaranteed_return_pct: values.guaranteed_return_pct,
      isin: values.isin,
      ticker: values.ticker,
      current_nav: values.current_nav,
      price_per_unit: values.price_per_unit,
      is_sip: values.is_sip ? 1 : 0,
      sip_monthly_amount: values.sip_monthly_amount ?? 0,
      notes: values.notes,
      details_json: values.details_json,
      created_at: nowISO(),
    });
    setAddOpen(false);
    refresh();
    setSnackMsg('Asset added');
  };

  const handleDelete = (id: string) => {
    setConfirmDeleteId(id);
  };

  const doDelete = () => {
    if (!confirmDeleteId) return;
    remove('assets', confirmDeleteId);
    refresh();
    setSnackMsg('Asset deleted');
    setConfirmDeleteId(null);
  };

  const handleSip = (id: string) => {
    const existingSip = first<SIPSchedule>(
      'SELECT * FROM sip_schedules WHERE user_id = ? AND asset_id = ? LIMIT 1',
      [userId, id],
    );
    setSipAssetId(id);
    setCurrentSip(existingSip ?? null);
    setSipModalOpen(true);
  };

  const handleSipSave = (values: SIPConfigValues) => {
    if (!sipAssetId) return;
    const dayTarget = Math.max(1, Math.min(28, values.day_of_month));
    const todayStr = todayISO();
    const todayDate = new Date(todayStr + 'T00:00:00');
    const candidate = new Date(todayDate.getFullYear(), todayDate.getMonth(), dayTarget);
    if (candidate <= todayDate) candidate.setMonth(candidate.getMonth() + 1);
    const nextDueDate = candidate.toISOString().slice(0, 10);

    tx((db) => {
      if (currentSip) {
        db.runSync(
          `UPDATE sip_schedules SET amount=?, frequency=?, day_of_month=?, annual_step_up_pct=?,
           start_date=?, end_date=?, linked_bank=?, status=?, next_due_date=? WHERE id=?`,
          [values.amount, values.frequency, dayTarget, values.annual_step_up_pct,
           values.start_date ?? null, values.end_date ?? null, values.linked_bank ?? null,
           values.status, nextDueDate, currentSip.id],
        );
      } else {
        db.runSync(
          `INSERT INTO sip_schedules (id, user_id, asset_id, amount, frequency, day_of_month,
           annual_step_up_pct, start_date, end_date, linked_bank, status, next_due_date)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [newId(), userId, sipAssetId, values.amount, values.frequency, dayTarget,
           values.annual_step_up_pct, values.start_date ?? null, values.end_date ?? null,
           values.linked_bank ?? null, values.status, nextDueDate],
        );
      }
      const isActive = values.status === 'active' ? 1 : 0;
      db.runSync(
        'UPDATE assets SET is_sip=?, sip_monthly_amount=? WHERE id=?',
        [isActive, isActive ? values.amount : 0, sipAssetId],
      );
    });

    refresh();
    setSipModalOpen(false);
  };

  const handleEdit = (id: string) => {
    router.push(`/assets/${id}/edit` as any);
  };

  const handleView = (id: string) => {
    router.push(`/assets/${id}` as any);
  };

  const isRefreshing = refreshStatus === 'loading';

  const filteredAssets = useMemo(() => {
    let list = activeTypeSlug ? assets.filter((a) => a.slug === activeTypeSlug) : assets;
    if (searchQuery.trim())
      list = list.filter((a) => a.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return list;
  }, [assets, activeTypeSlug, searchQuery]);

  const activeTypeName = activeTypeSlug
    ? assetTypes.find((t) => t.slug === activeTypeSlug)?.name ?? null
    : null;

  const allocData = useMemo(() => {
    if (activeTypeSlug) {
      const typeAssets = assets.filter((a) => a.slug === activeTypeSlug);
      const total = typeAssets.reduce((s, a) => s + a.current_value, 0);
      if (total === 0) return [];
      return typeAssets.map((a) => ({
        type: a.name,
        value: a.current_value,
        invested: a.invested_amount,
        count: 1,
        pct: Math.round((a.current_value / total) * 10) / 10,
      }));
    }
    return pf.allocation;
  }, [activeTypeSlug, assets, pf]);

  const driftColor =
    bench.drift > 30 ? palette.danger : bench.drift > 15 ? palette.warn : palette.good;

  const driftLabel =
    bench.drift > 30 ? 'Rebalancing needed' : bench.drift > 15 ? 'Minor adjustments suggested' : 'On track';

  const userAge = user?.date_of_birth
    ? Math.floor((Date.now() - new Date(user.date_of_birth).getTime()) / (365.25 * 86_400_000))
    : null;

  const ageSuggestion = userAge != null
    ? userAge < 30
      ? `At ${userAge}, focus on growth assets — equity and mutual funds. Time is your biggest edge.`
      : userAge < 45
        ? `At ${userAge}, maintain a balanced portfolio. Consider gradually increasing debt exposure.`
        : userAge < 55
          ? `At ${userAge}, shift towards capital preservation. Increase FD, PPF, and debt allocation.`
          : `At ${userAge}, prioritise capital preservation and regular income. Review equity risk carefully.`
    : null;

  return (
    <>
      <Screen
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefreshPrices} />
        }
      >
        {/* KPI summary card */}
        <SectionCard title="Portfolio">
          <Row>
            <Kpi label="Portfolio" value={formatINRCompact(pf.total_value)} />
            <Kpi label="Invested" value={formatINRCompact(pf.total_invested)} />
          </Row>
          <Row style={{ marginTop: 8 }}>
            <Kpi
              label="P&L"
              value={`${pf.pnl_pct}%`}
              subTone={pf.total_pnl >= 0 ? 'good' : 'bad'}
              sub={formatINRCompact(pf.total_pnl)}
            />
            <Kpi
              label="SIP/mo"
              value={formatINRCompact(pf.monthly_sip)}
              sub={pf.active_sips ? `${pf.active_sips} active` : undefined}
            />
          </Row>
        </SectionCard>

        <Searchbar
          placeholder="Search assets…"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={{ elevation: 1, marginHorizontal: 16 }}
          inputStyle={{ fontSize: 14 }}
        />

        {allocData.length > 0 && (
          <SectionCard title={activeTypeName ? `${activeTypeName} Allocation` : 'Allocation'}>
            <DistributionPie
              data={allocData.map((a, i) => ({
                name: a.type,
                value: a.value / 100,
                color: PIE[i % PIE.length],
              }))}
            />
          </SectionCard>
        )}

        {bench.rows.length > 0 && !activeTypeSlug && (
          <SectionCard
            title="Allocation vs Recommended"
            right={
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {bench.risk_profile}
              </Text>
            }
          >
            <GroupedBars
              labels={bench.rows.map((r) => r.type.split(' ')[0])}
              formatValue={(n) => `${n}%`}
              series={[
                { label: 'Recommended', color: chartColors.recommended, data: bench.rows.map((r) => r.recommended) },
                { label: 'Your %', color: chartColors.yours, data: bench.rows.map((r) => r.actual) },
              ]}
            />
          </SectionCard>
        )}

        {/* Holdings header: title + buttons on same line, count below */}
        <View style={{ marginTop: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="titleMedium" style={{ fontWeight: '800' }}>Holdings</Text>
            <Row gap={0}>
              <Button compact mode="text" icon="file-upload-outline" onPress={() => setImportOpen(true)}>
                Import
              </Button>
              <Button
                mode="text"
                compact
                icon="refresh"
                loading={isRefreshing}
                onPress={handleRefreshPrices}
              >
                Refresh
              </Button>
            </Row>
          </View>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            {filteredAssets.length} asset{filteredAssets.length !== 1 ? 's' : ''}
            {activeTypeSlug ? ` · ${activeTypeName}` : ''}
          </Text>
        </View>

        <AssetTypeTabs
          assetTypes={assetTypes}
          activeSlug={activeTypeSlug}
          onSelect={setActiveTypeSlug}
        />

        {filteredAssets.length === 0 ? (
          <SectionCard>
            <EmptyState
              icon="chart-line"
              title={activeTypeSlug ? `No ${activeTypeName} assets` : 'No assets yet'}
              message={
                activeTypeSlug
                  ? `You have no ${activeTypeName} holdings. Add one with the + button.`
                  : 'Add your investments to track value and allocation.'
              }
            />
          </SectionCard>
        ) : (
          filteredAssets.map((a) => (
            <AssetRow
              key={a.id}
              asset={a}
              onPress={handleView}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onSip={handleSip}
            />
          ))
        )}

        {bench.rows.length > 0 && !activeTypeSlug && (
          <SectionCard title="Portfolio Drift">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Text variant="displaySmall" style={{ color: driftColor, fontWeight: '800' }}>
                {bench.drift}%
              </Text>
              <View style={{ flex: 1 }}>
                <Text variant="bodyMedium">Drift from {bench.risk_profile} benchmark</Text>
                <Text variant="labelSmall" style={{ color: driftColor }}>{driftLabel}</Text>
              </View>
            </View>
          </SectionCard>
        )}

        {ageSuggestion && !activeTypeSlug && (
          <SectionCard title="Personalised Suggestion">
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
              {ageSuggestion}
            </Text>
          </SectionCard>
        )}
      </Screen>

      <FAB
        icon="plus"
        label="Add Asset"
        style={{ position: 'absolute', right: 16, bottom: Math.max(insets.bottom, 16) + 16 }}
        onPress={() => setAddOpen(true)}
      />

      <Portal>
        <AssetForm
          visible={addOpen}
          onDismiss={() => setAddOpen(false)}
          onSave={handleSave}
          assetTypes={assetTypes}
          title="Add Asset"
        />

        <Dialog visible={!!confirmDeleteId} onDismiss={() => setConfirmDeleteId(null)}>
          <Dialog.Title>Delete Asset</Dialog.Title>
          <Dialog.Content>
            <Text>Delete this asset? This action cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button textColor={palette.danger} onPress={doDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>

        <Snackbar
          visible={!!snackMsg}
          onDismiss={() => setSnackMsg(null)}
          duration={2500}
          action={{ label: 'OK', onPress: () => setSnackMsg(null) }}
        >
          {snackMsg ?? ''}
        </Snackbar>
      </Portal>

      <BulkImportModal
        visible={importOpen}
        userId={userId}
        assetTypes={assetTypes}
        onDismiss={() => setImportOpen(false)}
        onImported={(count) => {
          setImportOpen(false);
          refresh();
          setSnackMsg(`${count} asset${count !== 1 ? 's' : ''} imported from CSV`);
        }}
      />

      <SIPModal
        visible={sipModalOpen}
        sip={currentSip}
        onSave={handleSipSave}
        onDismiss={() => setSipModalOpen(false)}
      />
    </>
  );
};

export default AssetsScreen;
