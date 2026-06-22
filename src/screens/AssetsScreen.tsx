import React, { useMemo, useState } from 'react';
import { RefreshControl, View, ScrollView } from 'react-native';
import { Button, Dialog, FAB, Portal, Searchbar, Snackbar, Text, useTheme, IconButton, Badge, Divider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { all, first, insert, newId, remove, tx, run } from '../db';
import type { Asset, AssetType, SIPSchedule, User } from '../models/types';
import { benchmarkComparison, portfolioSummary } from '../services/finance';
import { Screen, SectionCard, Kpi, Row, EmptyState } from '../components/ui';
import { DistributionPie } from '../components/charts';
import AssetRow from '../components/assets/AssetRow';
import AssetTypeTabs from '../components/assets/AssetTypeTabs';
import BulkImportModal from '../components/assets/BulkImportModal';
import SIPModal from '../components/assets/SIPModal';
import type { SIPConfigValues } from '../hooks/assets/useSIPConfig';
import { palette } from '../theme';
import { formatINR, formatINRCompact } from '../utils/money';
import { todayISO, timeAgo } from '../utils/date';
import { useRefreshPrices } from '../hooks/assets/useRefreshPrices';
import { generateAssetNotifications } from '../services/notificationService';
import { calcCAGR } from '../utils/cagr';
import { assetPnl } from '../utils/money';
import BouncePressable from '../components/BouncePressable';

const PIE = ['#4A7C6F', '#7FB5A8', '#D4956A', '#2D3142', '#F0B429', '#52A77E', '#316357', '#9DD1C2'];

const AssetsScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const router = useRouter();
  const user = useData(() => first<User>('SELECT * FROM users WHERE id = ?', [userId!]));
  const assetTypes = useData(() => all<AssetType>('SELECT * FROM asset_types ORDER BY sort_order'));
  const assets = useData(() =>
    all<Asset & { type_name: string; slug: string }>(
      `SELECT a.*, t.name AS type_name, t.slug FROM assets a
       JOIN asset_types t ON t.id = a.asset_type_id
       WHERE a.user_id = ? ORDER BY a.current_value DESC`,
      [userId!],
    ),
  );
  const pf = useData(() => portfolioSummary(userId!));
  const bench = useData(() => benchmarkComparison(userId!, user?.risk_profile || 'moderate'));

  const insets = useSafeAreaInsets();
  const [importOpen, setImportOpen] = useState(false);
  const [snackMsg, setSnackMsg] = useState<string | null>(null);
  const [activeTypeSlug, setActiveTypeSlug] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [sipAssetId, setSipAssetId] = useState<string | null>(null);
  const [sipModalOpen, setSipModalOpen] = useState(false);
  const [currentSip, setCurrentSip] = useState<SIPSchedule | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // Sorting and selection states
  const [sortBy, setSortBy] = useState<'value' | 'pnl' | 'cagr' | 'name'>('value');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);

  const { status: refreshStatus, refresh: refreshPrices, lastUpdated } = useRefreshPrices(userId!, () => {
    refresh();
  });

  // Generate asset notifications on screen focus
  useData(() => {
    try { generateAssetNotifications(userId!); } catch { /* non-critical */ }
    return null;
  });

  // Query asset-specific notifications
  const notifications = useData(() =>
    all<{ id: string; title: string; body: string | null; kind: string; is_read: number; created_at: string }>(
      `SELECT * FROM notifications 
       WHERE user_id = ? AND kind IN ('sip_due', 'asset_gain', 'asset_loss', 'stale_price') 
       ORDER BY created_at DESC`,
      [userId!]
    )
  );

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  const handleMarkRead = (id: string) => {
    run('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
    refresh();
  };

  const handleMarkAllRead = () => {
    run(
      `UPDATE notifications SET is_read = 1 
       WHERE user_id = ? AND kind IN ('sip_due', 'asset_gain', 'asset_loss', 'stale_price')`,
      [userId!]
    );
    refresh();
  };

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
      [userId!, id],
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
          [newId(), userId!, sipAssetId, values.amount, values.frequency, dayTarget,
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

  // Toggle single selection
  const handleSelectToggle = (id: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Bulk Operations Actions
  const handleBulkDelete = () => {
    if (selectedAssetIds.size === 0) return;
    setConfirmBulkDeleteOpen(true);
  };

  const doBulkDelete = () => {
    tx((db) => {
      for (const id of selectedAssetIds) {
        db.runSync('DELETE FROM assets WHERE id = ?', [id]);
        db.runSync('DELETE FROM sip_schedules WHERE asset_id = ?', [id]);
        db.runSync('DELETE FROM goal_asset_links WHERE asset_id = ?', [id]);
      }
    });
    refresh();
    setSelectedAssetIds(new Set());
    setSelectMode(false);
    setSnackMsg(`Deleted ${selectedAssetIds.size} assets`);
    setConfirmBulkDeleteOpen(false);
  };

  const handleBulkExport = async () => {
    if (selectedAssetIds.size === 0) return;
    const selectedAssets = assets.filter((a) => selectedAssetIds.has(a.id));
    let csvContent = 'Name,Category,Invested Amount,Current Value,Is SIP,Monthly SIP\n';
    for (const a of selectedAssets) {
      csvContent += `"${a.name.replace(/"/g, '""')}","${a.type_name}",${a.invested_amount / 100},${a.current_value / 100},${a.is_sip},${(a.sip_monthly_amount || 0) / 100}\n`;
    }

    const path = `${FileSystem.documentDirectory}finvault_export_${Date.now()}.csv`;
    await FileSystem.writeAsStringAsync(path, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
    
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Selected Assets' });
    } else {
      setSnackMsg('Sharing not available on this device');
    }
  };

  const filteredAssets = useMemo(() => {
    let list = activeTypeSlug ? assets.filter((a) => a.slug === activeTypeSlug) : assets;
    if (searchQuery.trim()) {
      list = list.filter((a) => a.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    
    // Sort logic
    return [...list].sort((a, b) => {
      if (sortBy === 'value') {
        return b.current_value - a.current_value;
      }
      if (sortBy === 'pnl') {
        const pnlA = assetPnl(a.current_value, a.invested_amount);
        const pnlB = assetPnl(b.current_value, b.invested_amount);
        const pctA = a.invested_amount > 0 ? (pnlA / a.invested_amount) : 0;
        const pctB = b.invested_amount > 0 ? (pnlB / b.invested_amount) : 0;
        return pctB - pctA;
      }
      if (sortBy === 'cagr') {
        const cagrA = calcCAGR(a.current_value, a.invested_amount, a.investment_date ?? a.purchase_date);
        const cagrB = calcCAGR(b.current_value, b.invested_amount, b.investment_date ?? b.purchase_date);
        const valA = a.current_value > a.invested_amount ? cagrA : 0;
        const valB = b.current_value > b.invested_amount ? cagrB : 0;
        return valB - valA;
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });
  }, [assets, activeTypeSlug, searchQuery, sortBy]);

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

  return (
    <>
      <Screen
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefreshPrices} />
        }
      >
        {/* KPI summary card - OVERHAULED HERO CARD */}
        <SectionCard style={{ marginBottom: 12, backgroundColor: theme.colors.surface, borderLeftWidth: 4, borderLeftColor: theme.colors.primary }}>
          <View style={{ paddingVertical: 4 }}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 1, fontSize: 10, fontWeight: '700' }}>
              Total Portfolio Value
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
              <Text variant="headlineMedium" style={{ fontWeight: '900', color: theme.colors.onSurface, fontSize: 32 }}>
                {formatINR(pf.total_value)}
              </Text>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: pf.total_pnl >= 0 ? 'rgba(82, 167, 126, 0.15)' : 'rgba(235, 94, 85, 0.15)',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 12,
                gap: 2
              }}>
                <MaterialCommunityIcons
                  name={pf.total_pnl >= 0 ? 'arrow-up-bold' : 'arrow-down-bold'}
                  size={14}
                  color={pf.total_pnl >= 0 ? palette.good : palette.danger}
                />
                <Text style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: pf.total_pnl >= 0 ? palette.good : palette.danger
                }}>
                  {pf.pnl_pct >= 0 ? '+' : ''}{pf.pnl_pct}%
                </Text>
              </View>
            </View>
          </View>
          <Divider style={{ marginVertical: 12, backgroundColor: theme.colors.outlineVariant }} />
          <Row>
            <Kpi flex label="Invested" value={formatINRCompact(pf.total_invested)} />
            <Kpi
              flex
              label="Total Return"
              value={formatINRCompact(pf.total_pnl)}
              subTone={pf.total_pnl >= 0 ? 'good' : 'bad'}
            />
            <Kpi
              flex
              label="Monthly SIP"
              value={formatINRCompact(pf.monthly_sip)}
              sub={pf.active_sips ? `${pf.active_sips} active` : undefined}
            />
          </Row>
        </SectionCard>

        {/* Integrated Search and Sort trigger */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 18, marginTop: 4, gap: 8 }}>
          <Searchbar
            placeholder="Search assets…"
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
            onPress={() => setSortMenuOpen(true)}
            accessibilityLabel="Sort Holdings"
          />
        </View>

        {/* Filter chips - integrated next to search */}
        <AssetTypeTabs
          assetTypes={assetTypes}
          activeSlug={activeTypeSlug}
          onSelect={setActiveTypeSlug}
        />

        {/* Portfolio drift and rebalancing alerts */}
        {bench.rows.length > 0 && !activeTypeSlug && (() => {
          const alerts: string[] = [];
          bench.rows.forEach((row) => {
            const diff = row.actual - row.recommended;
            if (diff > 10) {
              alerts.push(`⚠️ ${row.type} allocation is ${row.actual}%, exceeding your recommended ${row.recommended}% target. Consider rebalancing.`);
            } else if (diff < -10) {
              alerts.push(`ℹ️ ${row.type} is under-allocated by ${Math.abs(Math.round(diff))}%. Consider increasing your allocation.`);
            }
          });
          if (alerts.length === 0) return null;
          return (
            <View style={{ marginHorizontal: 18, marginBottom: 12, gap: 6 }}>
              {alerts.map((alert, i) => (
                <View key={i} style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  backgroundColor: alert.startsWith('⚠️') ? 'rgba(240, 180, 41, 0.1)' : 'rgba(82, 167, 126, 0.1)',
                  padding: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: alert.startsWith('⚠️') ? 'rgba(240, 180, 41, 0.2)' : 'rgba(82, 167, 126, 0.2)',
                }}>
                  <Text variant="bodySmall" style={{
                    color: alert.startsWith('⚠️') ? palette.warn : palette.good,
                    fontWeight: '600',
                    lineHeight: 16
                  }}>
                    {alert}
                  </Text>
                </View>
              ))}
            </View>
          );
        })()}

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

        {/* COMPARATIVE ALLOCATION LIST OVERHAUL */}
        {bench.rows.length > 0 && !activeTypeSlug && (
          <SectionCard
            title="Allocation vs Recommended"
            right={
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {bench.risk_profile} Risk Profile
              </Text>
            }
          >
            <View style={{ gap: 10 }}>
              {bench.rows.map((row) => {
                const diff = row.actual - row.recommended;
                const actionText = diff > 5 ? 'Reduce' : diff < -5 ? 'Increase' : 'Hold';
                const actionColor = diff > 5 ? palette.danger : diff < -5 ? palette.good : theme.colors.onSurfaceVariant;
                return (
                  <View key={row.type} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '700' }}>{row.type}</Text>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 1 }}>
                        Current: {row.actual}%  →  Target: {row.recommended}%
                      </Text>
                    </View>
                    <View style={{
                      backgroundColor: diff > 5 ? 'rgba(235, 94, 85, 0.12)' : diff < -5 ? 'rgba(82, 167, 126, 0.12)' : theme.colors.surfaceVariant,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6
                    }}>
                      <Text variant="labelSmall" style={{ fontWeight: '800', color: actionColor }}>
                        {actionText} {diff !== 0 && `(${diff > 0 ? '+' : ''}${Math.round(diff)}%)`}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </SectionCard>
        )}

        {/* Holdings header: title + actions on same line, count below */}
        <View style={{ marginTop: 16, paddingHorizontal: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="titleMedium" style={{ fontWeight: '700' }}>Holdings</Text>
            <Row gap={0} style={{ alignItems: 'center' }}>
              <Button
                compact
                mode="text"
                onPress={() => {
                  setSelectMode((prev) => {
                    if (prev) setSelectedAssetIds(new Set());
                    return !prev;
                  });
                }}
              >
                {selectMode ? 'Cancel' : 'Select'}
              </Button>
              {!selectMode && (
                <>
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
                </>
              )}
            </Row>
          </View>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            {filteredAssets.length} asset{filteredAssets.length !== 1 ? 's' : ''}
            {activeTypeSlug ? ` · ${activeTypeName}` : ''}
            {lastUpdated ? `  ·  Prices: ${timeAgo(lastUpdated)}` : ''}
          </Text>
        </View>

        {/* Holdings list */}
        {filteredAssets.length === 0 ? (
          <SectionCard style={{ marginTop: 12 }}>
            <EmptyState
              icon="chart-line"
              title="No holdings found"
              message={searchQuery ? 'Try matching something else.' : "You haven't added holdings of this type."}
            />
          </SectionCard>
        ) : (
          <View style={{ marginTop: 10, paddingHorizontal: 18, paddingBottom: 100 }}>
            {filteredAssets.map((a) => (
              <AssetRow
                key={a.id}
                asset={a}
                selectMode={selectMode}
                selected={selectedAssetIds.has(a.id)}
                onSelectToggle={handleSelectToggle}
                onPress={() => handleView(a.id)}
                onEdit={() => handleEdit(a.id)}
                onDelete={() => handleDelete(a.id)}
                onSip={() => handleSip(a.id)}
              />
            ))}
          </View>
        )}
      </Screen>

      {/* FAB pill - compliance with Fitts's law */}
      <BouncePressable
        onPress={() => router.push('/assets/add' as any)}
        style={{
          position: 'absolute',
          right: 16,
          bottom: selectMode ? 80 : 16,
          zIndex: 10,
        }}
      >
        <FAB
          icon="plus"
          label="Add Asset"
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: 28,
            elevation: 4
          }}
          color={theme.colors.onPrimary}
          pointerEvents="none"
        />
      </BouncePressable>

      {/* Sticky Bulk Action Footer */}
      {selectMode && selectedAssetIds.size > 0 && (
        <View style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: theme.colors.elevation.level2,
          borderTopWidth: 1,
          borderTopColor: theme.colors.outlineVariant,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 8,
        }}>
          <Text variant="titleSmall" style={{ fontWeight: '700' }}>
            {selectedAssetIds.size} selected
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              mode="contained-tonal"
              icon="file-export-outline"
              compact
              onPress={handleBulkExport}
            >
              Export
            </Button>
            <Button
              mode="contained"
              buttonColor={palette.danger}
              icon="delete-outline"
              compact
              onPress={handleBulkDelete}
            >
              Delete
            </Button>
          </View>
        </View>
      )}

      <Portal>
        {/* Sort selector Dialog */}
        <Dialog visible={sortMenuOpen} onDismiss={() => setSortMenuOpen(false)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title style={{ fontWeight: '700' }}>Sort Assets</Dialog.Title>
          <Dialog.Content style={{ gap: 8 }}>
            {[
              { key: 'value', label: 'Current Value (High to Low)' },
              { key: 'pnl', label: 'Total Returns % (High to Low)' },
              { key: 'cagr', label: 'CAGR % (High to Low)' },
              { key: 'name', label: 'Alphabetical (A to Z)' },
            ].map((opt) => (
              <Button
                key={opt.key}
                mode={sortBy === opt.key ? 'contained' : 'outlined'}
                onPress={() => {
                  setSortBy(opt.key as any);
                  setSortMenuOpen(false);
                }}
                style={{ borderRadius: theme.roundness }}
                contentStyle={{ justifyContent: 'flex-start' }}
              >
                {opt.label}
              </Button>
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSortMenuOpen(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Individual asset delete confirmation */}
        <Dialog visible={confirmDeleteId !== null} onDismiss={() => setConfirmDeleteId(null)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title>Delete Asset</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete this asset? This will also remove any linked SIP schedules and goal allocations.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button mode="contained" buttonColor={palette.danger} onPress={doDelete}>
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Bulk asset delete confirmation */}
        <Dialog visible={confirmBulkDeleteOpen} onDismiss={() => setConfirmBulkDeleteOpen(false)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title>Bulk Delete Assets</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete the {selectedAssetIds.size} selected assets? This will permanently remove all of them along with any linked SIP schedules and goal allocations.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmBulkDeleteOpen(false)}>Cancel</Button>
            <Button mode="contained" buttonColor={palette.danger} onPress={doBulkDelete}>
              Delete All
            </Button>
          </Dialog.Actions>
        </Dialog>

        <BulkImportModal
          visible={importOpen}
          userId={userId!}
          assetTypes={assetTypes || []}
          onDismiss={() => setImportOpen(false)}
          onImported={() => {
            refresh();
            setSnackMsg('Assets imported');
          }}
        />

        <SIPModal
          visible={sipModalOpen}
          sip={currentSip}
          onSave={handleSipSave}
          onDismiss={() => setSipModalOpen(false)}
        />
      </Portal>

      <Snackbar visible={snackMsg !== null} onDismiss={() => setSnackMsg(null)} duration={3000}>
        {snackMsg}
      </Snackbar>
    </>
  );
};

export default AssetsScreen;
