import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Dialog, Portal, Text, TextInput, useTheme } from 'react-native-paper';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useApp } from '../../context/AppContext';
import { useDataSafe } from '../../hooks/useData';
import { all, first, insert, newId, remove, run } from '../../db';
import type { Asset, AssetImage, FinancialGoal } from '../../models/types';
import { Screen, SectionCard, Kpi, Row, EmptyState } from '../../components/ui';
import PerformanceChart from '../../components/assets/PerformanceChart';
import SIPModal from '../../components/assets/SIPModal';
import { useSIPConfig } from '../../hooks/assets/useSIPConfig';
import { getTypeConfig } from '../../components/assets/AssetTypeFieldConfig';
import { SIP_ELIGIBLE_TYPES } from '../../services/constants';
import { formatINR, pct, assetPnl } from '../../utils/money';
import { formatDisplayDate, nowISO } from '../../utils/date';
import { calcCAGR } from '../../utils/cagr';
import { palette } from '../../theme';

interface GoalWithLink extends FinancialGoal {
  is_linked: number;
  allocation_pct: number | null;
}

interface GoalDraft {
  goalId: string;
  name: string;
  target: number;
  linked: boolean;
  pct: string;
}

// ── MIME type helper for document opening ────────────────────────────────────
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

const AssetDetailScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, refresh } = useApp();
  const router = useRouter();
  const theme = useTheme();

  const { data: asset, error: assetError } = useDataSafe<(Asset & { type_name: string; slug: string }) | null>(() =>
    first<Asset & { type_name: string; slug: string }>(
      `SELECT a.*, t.name AS type_name, t.slug FROM assets a
       JOIN asset_types t ON t.id = a.asset_type_id WHERE a.id = ?`,
      [id],
    ),
  );

  const { data: allGoals } = useDataSafe<GoalWithLink[]>(() =>
    all<GoalWithLink>(
      `SELECT fg.*,
         CASE WHEN gal.id IS NOT NULL THEN 1 ELSE 0 END AS is_linked,
         gal.allocation_pct
       FROM financial_goals fg
       LEFT JOIN goal_asset_links gal ON gal.goal_id = fg.id AND gal.asset_id = ?
       WHERE fg.user_id = ? AND fg.is_completed = 0
       ORDER BY fg.name`,
      [id, userId],
    ),
  );

  const { data: images } = useDataSafe<AssetImage[]>(() =>
    all<AssetImage>(
      'SELECT * FROM asset_images WHERE asset_id = ? ORDER BY created_at',
      [id],
    ),
  );

  const { sip, save: saveSIP } = useSIPConfig(userId, id ?? '');
  const [sipOpen, setSipOpen] = useState(false);
  const [goalLinkOpen, setGoalLinkOpen] = useState(false);
  const [goalDrafts, setGoalDrafts] = useState<GoalDraft[]>([]);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  if (assetError) {
    return (
      <Screen>
        <SectionCard>
          <EmptyState icon="alert-circle" title="Failed to load asset" message={assetError} />
        </SectionCard>
      </Screen>
    );
  }

  if (!asset) {
    return (
      <Screen>
        <SectionCard>
          <Text variant="bodyMedium">Asset not found.</Text>
        </SectionCard>
      </Screen>
    );
  }

  const cfg = getTypeConfig(asset.slug ?? '');
  const pnl = assetPnl(asset.current_value, asset.invested_amount);
  const pnlPct = pct(pnl, asset.invested_amount);
  const cagr = calcCAGR(asset.current_value, asset.invested_amount, asset.investment_date ?? asset.purchase_date);

  let details: Record<string, string> = {};
  if (asset.details_json) {
    try { details = JSON.parse(asset.details_json); } catch { /* malformed json */ }
  }

  // ── Attachment helpers ───────────────────────────────────────────────────────

  const openCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) {
      const now = nowISO();
      for (const a of result.assets) {
        insert('asset_images', { id: newId(), asset_id: id ?? '', user_id: userId, uri: a.uri, label: null, created_at: now });
      }
      refresh();
    }
  };

  const pickSingle = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', 'Photo library access is needed to pick images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (!result.canceled) {
      const now = nowISO();
      for (const a of result.assets) {
        insert('asset_images', { id: newId(), asset_id: id ?? '', user_id: userId, uri: a.uri, label: null, created_at: now });
      }
      refresh();
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      const now = nowISO();
      // Copy documents to persistent storage (documentDirectory survives app restarts)
      const attachmentsDir = new Directory(Paths.document, 'attachments');
      try { attachmentsDir.create({ intermediates: true }); } catch { /* already exists */ }

      for (const file of result.assets) {
        const filename = file.name ?? 'document';
        const destFile = new File(attachmentsDir, newId() + '_' + filename);
        let persistentUri = file.uri;
        try {
          const srcFile = new File(file.uri);
          await srcFile.copy(destFile);
          persistentUri = destFile.uri;
        } catch { /* fallback: store cache URI */ }
        insert('asset_images', {
          id: newId(),
          asset_id: id ?? '',
          user_id: userId,
          uri: persistentUri,
          label: `pdf:${filename}`,
          created_at: now,
        });
      }
      refresh();
    }
  };

  const openDocument = async (uri: string, filename: string) => {
    try {
      const file = new File(uri);
      if (!file.exists) {
        Alert.alert('File not found', 'This document is no longer available on this device.');
        return;
      }
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
    } catch {
      Alert.alert('Cannot open', 'Unable to open this document. Please check that a compatible app is installed.');
    }
  };

  const confirmDeleteImage = (imgId: string) => {
    Alert.alert('Delete Attachment', 'Remove this attachment from the asset?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => { remove('asset_images', imgId); refresh(); },
      },
    ]);
  };

  // ── Asset delete ─────────────────────────────────────────────────────────────

  const handleDelete = () => {
    Alert.alert('Delete Asset', `Delete "${asset.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          remove('assets', id ?? '');
          refresh();
          router.back();
        },
      },
    ]);
  };

  // ── Goal link (with allocation %) ────────────────────────────────────────────

  const openManageGoals = () => {
    setGoalDrafts(
      (allGoals ?? []).map((g) => ({
        goalId: g.id,
        name: g.name,
        target: g.target_amount,
        linked: g.is_linked === 1,
        pct: g.is_linked === 1 ? String(g.allocation_pct ?? 100) : '',
      })),
    );
    setGoalLinkOpen(true);
  };

  const toggleGoalDraft = (goalId: string) => {
    setGoalDrafts((prev) => {
      const currentTotal = prev
        .filter((g) => g.linked && g.goalId !== goalId)
        .reduce((s, g) => s + (parseFloat(g.pct) || 0), 0);
      return prev.map((g) => {
        if (g.goalId !== goalId) return g;
        if (g.linked) return { ...g, linked: false, pct: '' };
        const suggested = Math.max(0, Math.min(100 - currentTotal, 100));
        return { ...g, linked: true, pct: String(Math.round(suggested)) };
      });
    });
  };

  const updateGoalPct = (goalId: string, val: string) => {
    setGoalDrafts((prev) => prev.map((g) => (g.goalId === goalId ? { ...g, pct: val } : g)));
  };

  const totalLinkedPct = goalDrafts
    .filter((g) => g.linked)
    .reduce((s, g) => s + (parseFloat(g.pct) || 0), 0);
  const overAllocated = totalLinkedPct > 100;

  const saveGoalLinks = () => {
    run('DELETE FROM goal_asset_links WHERE asset_id = ?', [id ?? '']);
    for (const g of goalDrafts.filter((g) => g.linked)) {
      const allocPct = Math.max(0, Math.min(100, parseFloat(g.pct) || 100));
      insert('goal_asset_links', {
        id: newId(),
        goal_id: g.goalId,
        asset_id: id ?? '',
        allocation_pct: allocPct,
      });
    }
    refresh();
    setGoalLinkOpen(false);
  };

  const goals = allGoals ?? [];
  const linkedGoals = goals.filter((g) => g.is_linked === 1);
  const linkedTotal = linkedGoals.reduce((s, g) => s + (g.allocation_pct ?? 100), 0);
  const unallocatedPct = Math.max(0, 100 - linkedTotal);

  const holdingSince = formatDisplayDate(asset.investment_date ?? asset.purchase_date);
  const photoList = images ?? [];
  const photoItems = photoList.filter((img) => !img.label?.startsWith('pdf:'));
  const docItems = photoList.filter((img) => img.label?.startsWith('pdf:'));
  const extraWithValues = (cfg.extraFields ?? []).filter((f) => !!details[f.key]);

  return (
    <>
      <Stack.Screen options={{ title: asset.name }} />
      <Screen>
        {/* Header */}
        <SectionCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialCommunityIcons name={cfg.icon as any} size={28} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="titleLarge" style={{ fontWeight: '800' }}>{asset.name}</Text>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {asset.type_name}
                {asset.isin ? ` · ${asset.isin}` : ''}
                {asset.ticker ? ` · ${asset.ticker}` : ''}
              </Text>
            </View>
          </View>
        </SectionCard>

        {/* Performance Chart */}
        <SectionCard title="Performance">
          <PerformanceChart
            investedPaise={asset.invested_amount}
            currentPaise={asset.current_value}
            color={pnl >= 0 ? palette.good : palette.danger}
          />
        </SectionCard>

        {/* Key Metrics */}
        <SectionCard title="Key Metrics">
          {/* Invested and Current stacked */}
          <Kpi label={cfg.investedLabel ?? 'Invested'} value={formatINR(asset.invested_amount)} />
          <View style={{ marginTop: 8 }}>
            <Kpi label={cfg.currentValueLabel ?? 'Current'} value={formatINR(asset.current_value)} />
          </View>
          <Row style={{ marginTop: 8 }}>
            <Kpi label="Total Return" value={formatINR(pnl)} subTone={pnl >= 0 ? 'good' : 'bad'} />
            <Kpi label="Return %" value={`${pnlPct}%`} subTone={pnl >= 0 ? 'good' : 'bad'} />
          </Row>
          <Row style={{ marginTop: 8 }}>
            {cagr !== 0 ? (
              <Kpi label="CAGR" value={`${cagr >= 0 ? '+' : ''}${cagr}%`} subTone={cagr >= 0 ? 'good' : 'bad'} />
            ) : null}
            <Kpi label="Holding Since" value={holdingSince} />
            {asset.quantity ? (
              <Kpi label={cfg.quantityLabel ?? 'Units'} value={String(asset.quantity)} />
            ) : null}
          </Row>

          {(asset.maturity_date || asset.guaranteed_return_pct != null) && (
            <Row style={{ marginTop: 8 }}>
              {asset.maturity_date ? (
                <Kpi label="Maturity" value={formatDisplayDate(asset.maturity_date)} />
              ) : null}
              {asset.guaranteed_return_pct != null ? (
                <Kpi
                  label={cfg.guaranteedReturnLabel ?? 'Guaranteed Return'}
                  value={`${asset.guaranteed_return_pct}%`}
                />
              ) : null}
            </Row>
          )}

          {(asset.price_per_unit != null || asset.current_nav != null) && (
            <Row style={{ marginTop: 8 }}>
              {asset.price_per_unit != null ? (
                <Kpi
                  label={cfg.pricePerUnitLabel ?? 'Price per Unit'}
                  value={`₹${asset.price_per_unit.toLocaleString('en-IN')}`}
                />
              ) : null}
              {asset.current_nav != null ? (
                <Kpi label={cfg.navLabel ?? 'NAV'} value={`₹${asset.current_nav}`} />
              ) : null}
            </Row>
          )}
        </SectionCard>

        {/* Type-specific extra field details */}
        {extraWithValues.length > 0 && (
          <SectionCard title={cfg.extraSection ?? 'Details'}>
            {extraWithValues.map((f) => {
              const val = details[f.key];
              const displayVal =
                f.type === 'select'
                  ? (f.options?.find((o) => o.value === val)?.label ?? val)
                  : val;
              return (
                <View key={f.key} style={{ marginBottom: 6 }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {f.label}
                  </Text>
                  <Text variant="bodyMedium">{displayVal}</Text>
                </View>
              );
            })}
          </SectionCard>
        )}

        {/* SIP Block — only for eligible asset types */}
        {SIP_ELIGIBLE_TYPES.has(asset.slug) && (
          asset.is_sip ? (
            <SectionCard title="SIP">
              <Row>
                <Kpi label={cfg.sipMonthlyLabel ?? 'Monthly'} value={formatINR(asset.sip_monthly_amount)} />
                {sip ? (
                  <>
                    <Kpi label="Frequency" value={sip.frequency || '—'} />
                    <Kpi label="Status" value={sip.status} subTone={sip.status === 'active' ? 'good' : 'muted'} />
                  </>
                ) : null}
              </Row>
              {sip?.start_date ? (
                <Row style={{ marginTop: 8 }}>
                  <Kpi label="Start" value={formatDisplayDate(sip.start_date)} />
                  {sip.end_date ? <Kpi label="End" value={formatDisplayDate(sip.end_date)} /> : null}
                  {sip.linked_bank ? <Kpi label="Bank" value={sip.linked_bank} /> : null}
                </Row>
              ) : null}
              <Button
                mode="outlined"
                compact
                icon="pencil"
                style={{ marginTop: 10, alignSelf: 'flex-start' }}
                onPress={() => setSipOpen(true)}
              >
                Edit SIP
              </Button>
            </SectionCard>
          ) : (
            <Button
              mode="outlined"
              compact
              icon="autorenew"
              style={{ alignSelf: 'flex-start' }}
              onPress={() => setSipOpen(true)}
            >
              Set up SIP
            </Button>
          )
        )}

        {/* Linked Goals */}
        <SectionCard
          title="Linked Goals"
          right={
            <Button compact mode="text" onPress={openManageGoals}>
              Manage
            </Button>
          }
        >
          {linkedGoals.length === 0 ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              No goals linked. Tap Manage to link this asset to a financial goal.
            </Text>
          ) : (
            <>
              {linkedGoals.map((g) => (
                <View
                  key={g.id}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}
                >
                  <Text variant="bodyMedium" style={{ flex: 1 }}>• {g.name}</Text>
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.primary, fontWeight: '700', marginLeft: 8 }}
                  >
                    {g.allocation_pct ?? 100}%
                  </Text>
                </View>
              ))}
              {unallocatedPct > 0 && (
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}
                >
                  <Text variant="bodyMedium" style={{ flex: 1, color: theme.colors.onSurfaceVariant }}>
                    • Unallocated
                  </Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
                    {unallocatedPct}%
                  </Text>
                </View>
              )}
            </>
          )}
        </SectionCard>

        {/* Attachments */}
        <SectionCard title={`Attachments${photoList.length > 0 ? ` (${photoList.length})` : ''}`}>
          {photoItems.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {photoItems.map((img) => (
                <View key={img.id} style={styles.photoWrap}>
                  <Pressable onPress={() => setLightboxUri(img.uri)}>
                    <Image source={{ uri: img.uri }} style={styles.photo} contentFit="cover" />
                  </Pressable>
                  <Pressable style={styles.photoDelete} onPress={() => confirmDeleteImage(img.id)}>
                    <MaterialCommunityIcons name="close-circle" size={18} color="#fff" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
          {docItems.length > 0 && (
            <View style={{ marginTop: photoItems.length > 0 ? 8 : 0 }}>
              {docItems.map((doc) => {
                const filename = doc.label?.replace('pdf:', '') ?? 'document';
                return (
                  <View
                    key={doc.id}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 }}
                  >
                    <MaterialCommunityIcons name="file-pdf-box" size={24} color={palette.danger} />
                    <Pressable style={{ flex: 1 }} onPress={() => openDocument(doc.uri, filename)}>
                      <Text
                        variant="bodySmall"
                        numberOfLines={1}
                        style={{ color: theme.colors.primary, textDecorationLine: 'underline' }}
                      >
                        {filename}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => confirmDeleteImage(doc.id)} style={{ padding: 4 }}>
                      <MaterialCommunityIcons name="delete-outline" size={20} color={palette.danger} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
          {photoList.length === 0 && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 10 }}>
              No attachments yet. Add photos, certificates, or PDF documents.
            </Text>
          )}
          <Row gap={6} style={{ marginTop: photoList.length > 0 ? 10 : 0 }}>
            <Button compact icon="camera" mode="outlined" onPress={openCamera} style={{ flex: 1 }}>
              Camera
            </Button>
            <Button compact icon="image" mode="outlined" onPress={pickSingle} style={{ flex: 1 }}>
              Gallery
            </Button>
            <Button compact icon="file-document-outline" mode="outlined" onPress={pickDocument} style={{ flex: 1 }}>
              Document
            </Button>
          </Row>
        </SectionCard>

        {/* Notes */}
        {asset.notes ? (
          <SectionCard title="Notes">
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {asset.notes}
            </Text>
          </SectionCard>
        ) : null}

        {/* Actions */}
        <SectionCard>
          <Row gap={8}>
            <Button
              mode="contained"
              icon="pencil"
              style={{ flex: 1 }}
              onPress={() => router.push(`/assets/${id}/edit` as any)}
            >
              Edit
            </Button>
            <Button
              mode="outlined"
              icon="delete"
              textColor={palette.danger}
              style={{ flex: 1 }}
              onPress={handleDelete}
            >
              Delete
            </Button>
          </Row>
        </SectionCard>

        <SIPModal
          visible={sipOpen}
          sip={sip}
          onSave={saveSIP}
          onDismiss={() => setSipOpen(false)}
        />
      </Screen>

      {/* Full-screen image lightbox */}
      <Modal
        visible={!!lightboxUri}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setLightboxUri(null)}
      >
        <View style={styles.lightbox}>
          <Image
            source={{ uri: lightboxUri ?? '' }}
            style={styles.lightboxImage}
            contentFit="contain"
            contentPosition="center"
            priority="high"
          />
          <Pressable style={styles.lightboxClose} onPress={() => setLightboxUri(null)}>
            <MaterialCommunityIcons name="close-circle" size={36} color="#fff" />
          </Pressable>
        </View>
      </Modal>

      {/* Goal Link Modal */}
      <Portal>
        <Dialog visible={goalLinkOpen} onDismiss={() => setGoalLinkOpen(false)}>
          <Dialog.Title>Link to Goals</Dialog.Title>

          {/* Allocation summary bar */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 4 }}>
            <Text
              variant="labelSmall"
              style={{ color: overAllocated ? palette.danger : theme.colors.onSurfaceVariant }}
            >
              {overAllocated
                ? `Total exceeds 100% by ${Math.round(totalLinkedPct - 100)}%`
                : `Allocated: ${Math.round(totalLinkedPct)}% · Remaining: ${Math.round(100 - totalLinkedPct)}%`}
            </Text>
          </View>

          <Dialog.ScrollArea style={{ maxHeight: 380 }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={{ paddingVertical: 4 }}>
                {goalDrafts.length === 0 ? (
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurfaceVariant, padding: 8 }}
                  >
                    No active goals found. Create a goal first from the Goals screen.
                  </Text>
                ) : (
                  goalDrafts.map((g) => (
                    <View
                      key={g.goalId}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, gap: 8 }}
                    >
                      <Checkbox
                        status={g.linked ? 'checked' : 'unchecked'}
                        onPress={() => toggleGoalDraft(g.goalId)}
                      />
                      <Text variant="bodyMedium" style={{ flex: 1 }} numberOfLines={2}>
                        {g.name}
                      </Text>
                      {g.linked && (
                        <TextInput
                          value={g.pct}
                          onChangeText={(v) => updateGoalPct(g.goalId, v)}
                          keyboardType="numeric"
                          mode="outlined"
                          dense
                          right={<TextInput.Affix text="%" />}
                          style={{ width: 80 }}
                          error={parseFloat(g.pct) <= 0 || isNaN(parseFloat(g.pct))}
                        />
                      )}
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </Dialog.ScrollArea>

          <Dialog.Actions>
            <Button onPress={() => setGoalLinkOpen(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={saveGoalLinks}
              disabled={overAllocated}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

const styles = StyleSheet.create({
  photoScroll: { marginBottom: 4 },
  photoWrap: {
    marginRight: 8,
    borderRadius: 10,
    overflow: 'hidden',
  },
  photo: {
    width: 90,
    height: 90,
    borderRadius: 10,
  },
  photoDelete: {
    position: 'absolute',
    top: 3,
    right: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
  },
  lightbox: {
    flex: 1,
    backgroundColor: '#000',
  },
  lightboxImage: {
    flex: 1,
    width: '100%',
  },
  lightboxClose: {
    position: 'absolute',
    top: 48,
    right: 16,
  },
});

export default AssetDetailScreen;
