import React, { useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Checkbox, Dialog, Portal, Text, TextInput, useTheme, ActivityIndicator } from 'react-native-paper';
import BouncePressable from '../../components/BouncePressable';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { File, Directory, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useApp } from '../../context/AppContext';
import { all, first, insert, newId, remove, run } from '../../db';
import type { Asset, AssetImage, FinancialGoal } from '../../models/types';
import { Screen, SectionCard, Kpi, Row, EmptyState } from '../../components/ui';
import PerformanceChart from '../../components/assets/PerformanceChart';
import SIPModal from '../../components/assets/SIPModal';
import { useSIPConfig } from '../../hooks/assets/useSIPConfig';
import { getTypeConfig } from '../../components/assets/AssetTypeFieldConfig';
import { SIP_ELIGIBLE_TYPES } from '../../services/constants';
import { sellAsset, prematureClosure, QUANTITY_SELL_SLUGS, MATURITY_SLUGS } from '../../services/lifecycle';
import { formatINR, pct, assetPnl, rupeesToPaise } from '../../utils/money';
import { formatDisplayDate, nowISO, todayISO } from '../../utils/date';
import { calcCAGR } from '../../utils/cagr';
import { palette } from '../../theme';
import { getPerSipReturns, PerSipXirrItem } from '../../services/sipXirrService';

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

const ZoomableImage: React.FC<{ uri: string }> = ({ uri }) => {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, savedScale.value * e.scale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.05) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onStart(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTap);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }, animatedStyle]}>
        <Image
          source={{ uri }}
          style={styles.lightboxImage}
          contentFit="contain"
          contentPosition="center"
          priority="high"
        />
      </Animated.View>
    </GestureDetector>
  );
};

const AssetDetailScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, refreshKey, refresh } = useApp();
  const router = useRouter();
  const theme = useTheme();

  const { asset, assetError } = React.useMemo(() => {
    if (!id) return { asset: null, assetError: null };
    try {
      const res = first<Asset & { type_name: string; slug: string }>(
        `SELECT a.*, t.name AS type_name, t.slug FROM assets a
         JOIN asset_types t ON t.id = a.asset_type_id WHERE a.id = ?`,
        [id],
      ) ?? null;
      return { asset: res, assetError: null };
    } catch (err: any) {
      return { asset: null, assetError: err?.message || 'Error loading asset' };
    }
  }, [id, refreshKey]);

  const [sipReturns, setSipReturns] = useState<PerSipXirrItem[] | null>(null);
  const [loadingSipReturns, setLoadingSipReturns] = useState(false);

  React.useEffect(() => {
    if (!asset || !(asset.slug === 'mutual_fund' || asset.slug === 'equity')) {
      setSipReturns(null);
      return;
    }
    let active = true;
    const load = async () => {
      setLoadingSipReturns(true);
      try {
        const res = await getPerSipReturns(asset, asset.slug);
        if (active) setSipReturns(res);
      } catch (err) {
        console.warn('[sipDetail] Error loading Per-SIP returns:', err);
      } finally {
        if (active) setLoadingSipReturns(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [asset, refreshKey]);

  const formatSipMonth = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-');
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const allGoals = React.useMemo(() => {
    if (!id || !userId) return [];
    try {
      return all<GoalWithLink>(
        `SELECT fg.*,
           CASE WHEN gal.id IS NOT NULL THEN 1 ELSE 0 END AS is_linked,
           gal.allocation_pct
         FROM financial_goals fg
         LEFT JOIN goal_asset_links gal ON gal.goal_id = fg.id AND gal.asset_id = ?
         WHERE fg.user_id = ? AND fg.is_completed = 0
         ORDER BY fg.name`,
        [id, userId],
      );
    } catch {
      return [];
    }
  }, [id, userId, refreshKey]);

  const images = React.useMemo(() => {
    if (!id) return [];
    try {
      return all<AssetImage>(
        'SELECT * FROM asset_images WHERE asset_id = ? ORDER BY created_at',
        [id],
      );
    } catch {
      return [];
    }
  }, [id, refreshKey]);

  const { sip, save: saveSIP } = useSIPConfig(userId!, id ?? '');
  const [sipOpen, setSipOpen] = useState(false);
  const [goalLinkOpen, setGoalLinkOpen] = useState(false);
  const [goalDrafts, setGoalDrafts] = useState<GoalDraft[]>([]);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  // ── Lifecycle (Sell / Premature closure) ──
  const [lcMode, setLcMode] = useState<null | 'sell' | 'premature'>(null);
  const [lcDatePicker, setLcDatePicker] = useState(false);
  const blankLc = { date: todayISO(), qty: '', price: '', charges: '', saleValue: '', redemption: '', notes: '', toCash: true };
  const [lc, setLc] = useState({ ...blankLc });
  const setLcField = (k: keyof typeof lc, v: string | boolean) => setLc((f) => ({ ...f, [k]: v }));

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

  // ── Lifecycle helpers (Sell / Premature closure) ─────────────────────────────
  const isQuantitySell = QUANTITY_SELL_SLUGS.has(asset.slug);
  const isMaturityType = MATURITY_SLUGS.has(asset.slug);

  const openSell = () => {
    // Pre-fill sell price with current LTP (market price), not the avg buy price.
    const ltp = asset.quantity > 0
      ? (asset.slug === 'mutual_fund' && asset.current_nav != null
          ? asset.current_nav
          : (asset.current_value / 100) / asset.quantity)
      : null;
    setLc({
      ...blankLc,
      price: ltp != null ? ltp.toFixed(2) : '',
      saleValue: asset.current_value ? String(asset.current_value / 100) : '',
    });
    setLcMode('sell');
  };
  const openPremature = () => {
    setLc({ ...blankLc, redemption: asset.current_value ? String(asset.current_value / 100) : '' });
    setLcMode('premature');
  };

  const confirmLifecycle = () => {
    const charges = rupeesToPaise(lc.charges || '0');
    if (lcMode === 'premature') {
      const redemption = rupeesToPaise(lc.redemption || '0');
      if (redemption <= 0) { Alert.alert('Enter redemption amount', 'Redemption amount must be greater than 0.'); return; }
      prematureClosure(userId!, asset, { closureDate: lc.date, redemptionAmount: redemption, notes: lc.notes, toCash: lc.toCash });
      setLcMode(null); refresh(); router.back();
      return;
    }
    // Sell
    if (isQuantitySell) {
      const qty = parseFloat(lc.qty);
      const price = rupeesToPaise(lc.price || '0');
      if (!qty || qty <= 0) { Alert.alert('Invalid quantity', 'Quantity to sell must be greater than 0.'); return; }
      if (qty > asset.quantity) { Alert.alert('Too many units', `You only have ${asset.quantity} units available.`); return; }
      if (price <= 0) { Alert.alert('Invalid price', 'Sale price per unit must be greater than 0.'); return; }
      const full = qty >= asset.quantity;
      sellAsset(userId!, asset, { saleDate: lc.date, notes: lc.notes, toCash: lc.toCash, charges, qtyToSell: qty, pricePerUnit: price });
      setLcMode(null); refresh();
      if (full) router.back();
    } else {
      const saleValue = rupeesToPaise(lc.saleValue || '0');
      if (saleValue <= 0) { Alert.alert('Invalid sale value', 'Sale value must be greater than 0.'); return; }
      sellAsset(userId!, asset, { saleDate: lc.date, notes: lc.notes, toCash: lc.toCash, charges, saleValue });
      setLcMode(null); refresh(); router.back();
    }
  };

  // Live preview for the lifecycle dialog.
  const lcQty = parseFloat(lc.qty) || 0;
  const lcCharges = rupeesToPaise(lc.charges || '0');
  const lcSaleValue = lcMode === 'sell'
    ? (isQuantitySell ? Math.round(lcQty * rupeesToPaise(lc.price || '0')) : rupeesToPaise(lc.saleValue || '0'))
    : 0;
  const lcCostBasis = isQuantitySell && asset.quantity ? Math.round((asset.invested_amount * lcQty) / asset.quantity) : asset.invested_amount;
  const lcRedemption = rupeesToPaise(lc.redemption || '0');
  const lcProceeds = lcMode === 'premature' ? lcRedemption : lcSaleValue - lcCharges;
  const lcPnl = lcMode === 'premature' ? lcRedemption - asset.invested_amount : lcSaleValue - lcCostBasis - lcCharges;

  // ── Attachment helpers ───────────────────────────────────────────────────────

  const copyToPersistentStorage = async (uri: string, originalName?: string): Promise<string> => {
    try {
      const attachmentsDir = new Directory(Paths.document, 'attachments');
      try { attachmentsDir.create({ intermediates: true }); } catch { /* already exists */ }
      const ext = uri.split('.').pop()?.split('?')[0].toLowerCase() || 'jpg';
      const name = originalName || `img_${newId()}.${ext}`;
      const destFile = new File(attachmentsDir, newId() + '_' + name);
      const srcFile = new File(uri);
      await srcFile.copy(destFile);
      return destFile.uri;
    } catch (err) {
      console.warn('Failed to copy to persistent storage, using original cached URI:', err);
      return uri;
    }
  };

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
        const persistentUri = await copyToPersistentStorage(a.uri);
        insert('asset_images', {
          id: newId(),
          asset_id: id ?? '',
          user_id: userId,
          uri: persistentUri,
          label: null,
          created_at: now,
          local_path: persistentUri.startsWith('file://') ? decodeURIComponent(persistentUri.replace('file://', '')) : persistentUri,
        });
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
        const persistentUri = await copyToPersistentStorage(a.uri, a.fileName || undefined);
        insert('asset_images', {
          id: newId(),
          asset_id: id ?? '',
          user_id: userId,
          uri: persistentUri,
          label: null,
          created_at: now,
          local_path: persistentUri.startsWith('file://') ? decodeURIComponent(persistentUri.replace('file://', '')) : persistentUri,
        });
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
      for (const file of result.assets) {
        const filename = file.name ?? 'document';
        const persistentUri = await copyToPersistentStorage(file.uri, filename);
        insert('asset_images', {
          id: newId(),
          asset_id: id ?? '',
          user_id: userId,
          uri: persistentUri,
          label: `pdf:${filename}`,
          created_at: now,
          local_path: persistentUri.startsWith('file://') ? decodeURIComponent(persistentUri.replace('file://', '')) : persistentUri,
        });
      }
      refresh();
    }
  };

  const openDocument = async (uri: string, filename: string) => {
    try {
      if (Platform.OS === 'android') {
        const contentUri = await FileSystem.getContentUriAsync(uri);
        const mimeType = getMimeType(filename);
        try {
          await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
            data: contentUri,
            flags: 1, // Intent.FLAG_GRANT_READ_URI_PERMISSION
            type: mimeType,
          });
          return;
        } catch (intentErr) {
          console.warn('Intent view failed, falling back to shareAsync:', intentErr);
        }
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('no such file') || msg.includes('not found') || msg.includes('ENOENT')) {
        Alert.alert('File not found', 'This document is no longer available on this device. It may have been deleted.');
      } else {
        Alert.alert('Cannot open', `Unable to open this document: ${msg}`);
      }
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
        <SectionCard style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialCommunityIcons name={cfg.icon as any} size={28} color={theme.colors.primary} />
            <View style={{ flex: 1 }}>
              <Text variant="titleLarge" style={{ fontWeight: '700' }}>{asset.name}</Text>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                {asset.type_name}
                {asset.isin ? ` · ${asset.isin}` : ''}
                {asset.ticker ? ` · ${asset.ticker}` : ''}
              </Text>
            </View>
          </View>
        </SectionCard>

        {/* Performance Chart */}
        <SectionCard title="Performance" style={{ marginBottom: 12 }}>
          <PerformanceChart
            investedPaise={asset.invested_amount}
            currentPaise={asset.current_value}
            color={pnl >= 0 ? palette.good : palette.danger}
          />
        </SectionCard>

        {/* Key Metrics */}
        <SectionCard title="Key Metrics" style={{ marginBottom: 12 }}>
          {/* Invested and Current stacked */}
          <Kpi label={cfg.investedLabel ?? 'Invested'} value={formatINR(asset.invested_amount)} />
          <View style={{ marginTop: 12 }}>
            <Kpi label={cfg.currentValueLabel ?? 'Current'} value={formatINR(asset.current_value)} />
          </View>
          <Row style={{ marginTop: 12 }}>
            <Kpi label="Total Return" value={formatINR(pnl)} subTone={pnl >= 0 ? 'good' : 'bad'} />
            <Kpi label="Return %" value={`${pnlPct}%`} subTone={pnl >= 0 ? 'good' : 'bad'} />
          </Row>
          <Row style={{ marginTop: 12 }}>
            {cagr !== 0 ? (
              <Kpi label="CAGR" value={`${cagr >= 0 ? '+' : ''}${cagr}%`} subTone={cagr >= 0 ? 'good' : 'bad'} />
            ) : null}
            <Kpi label="Holding Since" value={holdingSince} />
            {asset.quantity ? (
              <Kpi label={cfg.quantityLabel ?? 'Units'} value={String(asset.quantity)} />
            ) : null}
          </Row>

          {(asset.maturity_date || asset.guaranteed_return_pct != null) && (
            <Row style={{ marginTop: 12 }}>
              {asset.maturity_date ? (
                <Kpi label="Maturity Date" value={formatDisplayDate(asset.maturity_date)} />
              ) : null}
              {asset.guaranteed_return_pct != null ? (
                <Kpi
                  label={cfg.guaranteedReturnLabel ?? 'Guaranteed Return'}
                  value={`${asset.guaranteed_return_pct}%`}
                />
              ) : null}
            </Row>
          )}

          {asset.maturity_amount != null ? (
            <Row style={{ marginTop: 12 }}>
              <Kpi label={cfg.maturityAmountLabel ?? 'Maturity Amount'} value={formatINR(asset.maturity_amount)} />
            </Row>
          ) : null}

          {(asset.price_per_unit != null || asset.current_nav != null) && (
            <Row style={{ marginTop: 12 }}>
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
          <SectionCard title={cfg.extraSection ?? 'Details'} style={{ marginBottom: 12 }}>
            {extraWithValues.map((f) => {
              const val = details[f.key];
              const displayVal =
                f.type === 'select'
                  ? (f.options?.find((o) => o.value === val)?.label ?? val)
                  : val;
              return (
                <View key={f.key} style={{ marginBottom: 8 }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 2 }}>
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
            <SectionCard title="SIP" style={{ marginBottom: 12 }}>
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
                <Row style={{ marginTop: 12 }}>
                  <Kpi label="Start" value={formatDisplayDate(sip.start_date)} />
                  {sip.end_date ? <Kpi label="End" value={formatDisplayDate(sip.end_date)} /> : null}
                  {sip.linked_bank ? <Kpi label="Bank" value={sip.linked_bank} /> : null}
                </Row>
              ) : null}
              <Button
                mode="outlined"
                compact
                icon="pencil"
                style={{ marginTop: 12, alignSelf: 'flex-start', borderRadius: theme.roundness }}
                onPress={() => setSipOpen(true)}
              >
                Edit SIP
              </Button>
            </SectionCard>
          ) : (
            <View style={{ paddingHorizontal: 18, marginBottom: 12 }}>
              <Button
                mode="outlined"
                compact
                icon="autorenew"
                style={{ alignSelf: 'flex-start', borderRadius: theme.roundness }}
                onPress={() => setSipOpen(true)}
              >
                Set up SIP
              </Button>
            </View>
          )
        )}

        {/* Per-SIP Performance Card */}
        {(asset.slug === 'mutual_fund' || asset.slug === 'equity') && (asset.is_sip || (sipReturns && sipReturns.length > 0)) && (
          <SectionCard title="Per-SIP Performance" style={{ marginBottom: 12 }}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              Track the individual annualized return (CAGR) for each monthly installment purchase.
            </Text>
            
            {loadingSipReturns ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, marginTop: 8 }}>
                  Calculating installment returns...
                </Text>
              </View>
            ) : sipReturns && sipReturns.length > 0 ? (
              <View style={{ gap: 10 }}>
                {/* Table Header */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 2 }}>
                  <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant, flex: 1.2 }}>Installment</Text>
                  <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant, flex: 1, textAlign: 'right' }}>Invested</Text>
                  <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant, flex: 1.2, textAlign: 'right' }}>Current Value</Text>
                  <Text variant="labelSmall" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant, flex: 1, textAlign: 'right' }}>Return</Text>
                </View>
                <View style={{ height: 1, backgroundColor: theme.colors.outlineVariant, marginBottom: 4 }} />

                {/* Table Rows */}
                {sipReturns.map((item) => {
                  const isPositive = item.cagr >= 0;
                  return (
                    <View key={item.id} style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 }}>
                        {/* Month & Purchase Nav */}
                        <View style={{ flex: 1.2 }}>
                          <Text variant="bodyMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                            {formatSipMonth(item.paymentDate)}
                          </Text>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 10, marginTop: 1 }}>
                            Buy: ₹{item.purchaseNav.toFixed(2)}
                          </Text>
                        </View>

                        {/* Invested Amount */}
                        <Text variant="bodyMedium" style={{ flex: 1, textAlign: 'right', color: theme.colors.onSurface }}>
                          {formatINR(item.amountPaid * 100)}
                        </Text>

                        {/* Current Value */}
                        <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                          <Text variant="bodyMedium" style={{ fontWeight: '600', color: theme.colors.onSurface }}>
                            {formatINR(Math.round(item.currentValue * 100))}
                          </Text>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 9.5, marginTop: 1 }}>
                            {item.unitsBought.toFixed(2)} units
                          </Text>
                        </View>

                        {/* Return % (XIRR/CAGR) */}
                        <Text variant="bodyMedium" style={{
                          flex: 1,
                          textAlign: 'right',
                          fontWeight: '800',
                          color: isPositive ? palette.good : palette.danger
                        }}>
                          {isPositive ? '+' : ''}{item.cagr.toFixed(1)}%
                        </Text>
                      </View>
                      <View style={{ height: 1, backgroundColor: theme.colors.outlineVariant, opacity: 0.3 }} />
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={{ paddingVertical: 16, alignItems: 'center', backgroundColor: theme.colors.surfaceVariant + '20', borderRadius: theme.roundness, paddingHorizontal: 16 }}>
                <MaterialCommunityIcons name="history" size={24} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.6, marginBottom: 6 }} />
                <Text style={{ color: theme.colors.onSurface, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
                  No Installment Data
                </Text>
                <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11.5, textAlign: 'center', marginTop: 4, lineHeight: 16 }}>
                  Mark your scheduled SIP payments as paid on the Dashboard to track your individual installment returns and CAGR over time.
                </Text>
              </View>
            )}
          </SectionCard>
        )}

        {/* Linked Goals */}
        <SectionCard
          title="Linked Goals"
          style={{ marginBottom: 12 }}
          right={
            <Button compact mode="text" onPress={openManageGoals} style={{ margin: 0 }}>
              Manage
            </Button>
          }
        >
          {linkedGoals.length === 0 ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
              No goals linked. Tap Manage to link this asset to a financial goal.
            </Text>
          ) : (
            <>
              <View style={{ gap: 8 }}>
                {linkedGoals.map((g) => (
                  <View
                    key={g.id}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
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
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <Text variant="bodyMedium" style={{ flex: 1, color: theme.colors.onSurfaceVariant }}>
                      • Unallocated
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
                      {unallocatedPct}%
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </SectionCard>

        {/* Attachments */}
        <SectionCard title={`Attachments${photoList.length > 0 ? ` (${photoList.length})` : ''}`} style={{ marginBottom: 12 }}>
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
            <View style={{ marginTop: photoItems.length > 0 ? 12 : 0, gap: 6 }}>
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
                      {doc.local_path ? (
                        <Text
                          variant="bodySmall"
                          numberOfLines={1}
                          style={{ color: theme.colors.onSurfaceVariant, fontSize: 10, marginTop: 2 }}
                        >
                          Path: {doc.local_path}
                        </Text>
                      ) : null}
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
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              No attachments yet. Add photos, certificates, or PDF documents.
            </Text>
          )}
          <Row gap={8} style={{ marginTop: photoList.length > 0 ? 12 : 0 }}>
            <Button compact icon="camera" mode="outlined" onPress={openCamera} style={{ flex: 1, borderRadius: theme.roundness }}>
              Camera
            </Button>
            <Button compact icon="image" mode="outlined" onPress={pickSingle} style={{ flex: 1, borderRadius: theme.roundness }}>
              Gallery
            </Button>
            <Button compact icon="file-document-outline" mode="outlined" onPress={pickDocument} style={{ flex: 1, borderRadius: theme.roundness }}>
              Document
            </Button>
          </Row>
        </SectionCard>

        {/* Notes */}
        {asset.notes ? (
          <SectionCard title="Notes" style={{ marginBottom: 12 }}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
              {asset.notes}
            </Text>
          </SectionCard>
        ) : null}

        {/* Lifecycle actions */}
        <SectionCard title="Manage Asset" style={{ marginBottom: 12 }}>
          {isMaturityType ? (
            <>
              {asset.maturity_date ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <MaterialCommunityIcons name="information-outline" size={16} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
                    Auto-matures on {formatDisplayDate(asset.maturity_date)} — proceeds sweep to your Cash portfolio automatically.
                  </Text>
                </View>
              ) : null}
              <Button mode="contained" icon="cash-fast" onPress={openPremature} style={{ borderRadius: theme.roundness }}>
                Premature Closure
              </Button>
            </>
          ) : (asset.slug === 'savings' && asset.name === 'Cash & Money') ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              This is your Cash & Money portfolio — sale, maturity and claim proceeds are credited here.
            </Text>
          ) : (
            <Button mode="contained" icon="cash-minus" onPress={openSell} style={{ borderRadius: theme.roundness }}>
              Sell Asset
            </Button>
          )}
        </SectionCard>

        {/* Actions */}
        <SectionCard style={{ marginBottom: 24 }}>
          <Row gap={8}>
            <Button
              mode="contained"
              icon="pencil"
              style={{ flex: 1, borderRadius: theme.roundness }}
              onPress={() => router.push(`/assets/${id}/edit` as any)}
            >
              Edit
            </Button>
            <Button
              mode="outlined"
              icon="delete"
              textColor={palette.danger}
              style={{ flex: 1, borderRadius: theme.roundness }}
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
          {lightboxUri ? (
            <ZoomableImage uri={lightboxUri} />
          ) : null}
          {lightboxUri && photoList.find((img) => img.uri === lightboxUri)?.local_path ? (
            <View style={{
              position: 'absolute',
              bottom: 40,
              left: 20,
              right: 20,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 20,
              alignItems: 'center',
            }}>
              <Text style={{ color: '#fff', fontSize: 11, textAlign: 'center' }} numberOfLines={2}>
                Path: {photoList.find((img) => img.uri === lightboxUri)?.local_path}
              </Text>
            </View>
          ) : null}
          <Pressable style={styles.lightboxClose} onPress={() => setLightboxUri(null)}>
            <MaterialCommunityIcons name="close-circle" size={36} color="#fff" />
          </Pressable>
        </View>
      </Modal>

      {/* Sell / Premature-closure dialog */}
      <Portal>
        <Dialog visible={lcMode !== null} onDismiss={() => setLcMode(null)} style={{ maxHeight: '85%', borderRadius: theme.roundness }}>
          <Dialog.Title>{lcMode === 'premature' ? 'Premature Closure' : 'Sell Asset'}</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={{ paddingVertical: 8, gap: 8 }}>
              {/* Date */}
              <Button mode="outlined" icon="calendar" onPress={() => setLcDatePicker(true)} style={{ borderRadius: theme.roundness }}>
                {lcMode === 'premature' ? `Closure date: ${lc.date}` : `Sale date: ${lc.date}`}
              </Button>
              {lcDatePicker && (
                <DateTimePicker
                  value={lc.date ? new Date(lc.date + 'T00:00:00') : new Date()}
                  mode="date"
                  onChange={(_e, d) => { setLcDatePicker(false); if (d) setLcField('date', d.toISOString().slice(0, 10)); }}
                />
              )}

              {lcMode === 'premature' ? (
                <TextInput label="Redemption Amount (₹) *" keyboardType="numeric" value={lc.redemption} onChangeText={(v) => setLcField('redemption', v)} mode="outlined" dense />
              ) : isQuantitySell ? (
                <>
                  <TextInput label="Available Quantity" value={String(asset.quantity)} editable={false} mode="outlined" dense style={{ backgroundColor: theme.colors.surfaceVariant }} />
                  <TextInput label="Quantity to Sell *" keyboardType="numeric" value={lc.qty} onChangeText={(v) => setLcField('qty', v)} mode="outlined" dense />
                  <TextInput label="Sale Price Per Unit (₹) *" keyboardType="numeric" value={lc.price} onChangeText={(v) => setLcField('price', v)} mode="outlined" dense />
                  <TextInput label="Transaction Charges (₹)" keyboardType="numeric" value={lc.charges} onChangeText={(v) => setLcField('charges', v)} mode="outlined" dense />
                </>
              ) : (
                <>
                  <TextInput label="Sale Value (₹) *" keyboardType="numeric" value={lc.saleValue} onChangeText={(v) => setLcField('saleValue', v)} mode="outlined" dense />
                  <TextInput label="Transaction Charges (₹)" keyboardType="numeric" value={lc.charges} onChangeText={(v) => setLcField('charges', v)} mode="outlined" dense />
                </>
              )}

              <TextInput label="Notes" value={lc.notes} onChangeText={(v) => setLcField('notes', v)} mode="outlined" dense multiline />

              {/* Live preview */}
              <View style={{ backgroundColor: theme.colors.surfaceVariant, borderRadius: theme.roundness, padding: 12, marginTop: 4, gap: 4 }}>
                {lcMode === 'sell' && (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Sale Value</Text>
                    <Text variant="bodySmall" style={{ fontWeight: '700' }}>{formatINR(lcSaleValue)}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Proceeds to credit</Text>
                  <Text variant="bodySmall" style={{ fontWeight: '700' }}>{formatINR(lcProceeds)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Profit / Loss</Text>
                  <Text variant="bodySmall" style={{ fontWeight: '700', color: lcPnl >= 0 ? palette.good : palette.danger }}>
                    {lcPnl >= 0 ? '+' : ''}{formatINR(lcPnl)}
                  </Text>
                </View>
              </View>

              {/* Transfer to cash */}
              <Pressable onPress={() => setLcField('toCash', !lc.toCash)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Checkbox status={lc.toCash ? 'checked' : 'unchecked'} onPress={() => setLcField('toCash', !lc.toCash)} />
                <Text variant="bodyMedium" style={{ flex: 1 }}>Transfer proceeds to Cash / Money portfolio</Text>
              </Pressable>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setLcMode(null)}>Cancel</Button>
            <Button mode="contained" onPress={confirmLifecycle}>
              {lcMode === 'premature' ? 'Close Asset' : 'Confirm Sale'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Goal Link Modal */}
      <Portal>
        <Dialog visible={goalLinkOpen} onDismiss={() => setGoalLinkOpen(false)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title style={{ fontWeight: '700', color: theme.colors.onSurface, fontSize: 18 }}>
            Link to Goals
          </Dialog.Title>

          {/* Allocation summary bar */}
          <View style={{ paddingHorizontal: 24, paddingBottom: 8 }}>
            <Text
              variant="labelSmall"
              style={{ color: overAllocated ? palette.danger : theme.colors.onSurfaceVariant, fontWeight: '600' }}
            >
              {overAllocated
                ? `Total exceeds 100% by ${Math.round(totalLinkedPct - 100)}%`
                : `Allocated: ${Math.round(totalLinkedPct)}% · Remaining: ${Math.round(100 - totalLinkedPct)}%`}
            </Text>
          </View>

          <Dialog.ScrollArea style={{ maxHeight: 380, paddingHorizontal: 16 }}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ paddingVertical: 12, gap: 4 }}>
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
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 8,
                        paddingHorizontal: 4,
                        gap: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.outlineVariant,
                      }}
                    >
                      <Checkbox
                        status={g.linked ? 'checked' : 'unchecked'}
                        onPress={() => toggleGoalDraft(g.goalId)}
                      />
                      <Text variant="bodyMedium" style={{ flex: 1, color: theme.colors.onSurface }} numberOfLines={2}>
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
                          style={{ width: 80, backgroundColor: theme.colors.surface }}
                          error={parseFloat(g.pct) <= 0 || isNaN(parseFloat(g.pct))}
                        />
                      )}
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          </Dialog.ScrollArea>

          <Dialog.Actions style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
            <BouncePressable
              onPress={() => setGoalLinkOpen(false)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: theme.roundness,
                borderWidth: 1,
                borderColor: theme.colors.outline,
                backgroundColor: theme.colors.surface,
              }}
            >
              <Text variant="labelMedium" style={{ fontWeight: '600', color: theme.colors.onSurface, fontSize: 13 }}>
                Cancel
              </Text>
            </BouncePressable>
            <BouncePressable
              onPress={saveGoalLinks}
              disabled={overAllocated}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: theme.roundness,
                backgroundColor: theme.colors.primary,
                opacity: overAllocated ? 0.6 : 1,
              }}
            >
              <Text variant="labelMedium" style={{ fontWeight: '600', color: theme.colors.onPrimary, fontSize: 13 }}>
                Save
              </Text>
            </BouncePressable>
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
