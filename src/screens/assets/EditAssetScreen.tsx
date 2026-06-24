import React from 'react';
import { Alert, View } from 'react-native';
import { ActivityIndicator, Button, useTheme } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../context/AppContext';
import { first, update, remove, all } from '../../db';
import type { Asset, AssetType } from '../../models/types';
import { Screen, SectionCard, EmptyState } from '../../components/ui';
import { palette } from '../../theme';
import AssetForm, { AssetFormValues, assetToFormValues } from '../../components/assets/AssetForm';

const EditAssetScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, refreshKey, refresh } = useApp();
  const router = useRouter();

  const { asset, assetError } = React.useMemo(() => {
    if (!id || !userId) return { asset: null, assetError: null };
    try {
      const res = first<Asset>('SELECT * FROM assets WHERE id = ? AND user_id = ?', [id, userId]) ?? null;
      return { asset: res, assetError: null };
    } catch (err: any) {
      return { asset: null, assetError: err?.message || 'Error loading asset' };
    }
  }, [id, userId, refreshKey]);

  const { assetTypes, typesError } = React.useMemo(() => {
    try {
      const res = all<AssetType>('SELECT * FROM asset_types ORDER BY sort_order');
      return { assetTypes: res, typesError: null };
    } catch (err: any) {
      return { assetTypes: null, typesError: err?.message || 'Error loading asset types' };
    }
  }, [refreshKey]);

  if (assetError || typesError) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle"
          title="Failed to load"
          message={assetError ?? typesError ?? 'Unknown error'}
        />
      </Screen>
    );
  }

  if (!asset || !assetTypes) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      </Screen>
    );
  }

  const handleSave = (values: AssetFormValues) => {
    // Attachments are persisted live via AssetForm's `assetId` (no second arg needed).
    update('assets', id, {
      invested_amount: values.invested_amount,
      current_value: values.current_value,
      quantity: values.quantity,
      investment_date: values.investment_date,
      purchase_date: values.investment_date,
      maturity_date: values.maturity_date,
      maturity_amount: values.maturity_amount,
      guaranteed_return_pct: values.guaranteed_return_pct,
      isin: values.isin,
      ticker: values.ticker,
      current_nav: values.current_nav,
      price_per_unit: values.price_per_unit,
      is_sip: values.is_sip ? 1 : 0,
      sip_monthly_amount: values.sip_monthly_amount,
      notes: values.notes,
      details_json: values.details_json,
    });
    refresh();
    router.back();
  };

  const handleDelete = () => {
    Alert.alert('Delete Asset', 'Delete this asset? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          remove('assets', id);
          refresh();
          router.back();
        },
      },
    ]);
  };

  const theme = useTheme();

  return (
    <Screen>
      <SectionCard style={{ marginBottom: 16 }}>
        <AssetForm
          visible
          inline
          readOnlyIdentity
          onDismiss={() => router.back()}
          onSave={handleSave}
          assetTypes={assetTypes}
          initial={assetToFormValues(asset)}
          title="Edit Asset"
          assetId={id}
        />
      </SectionCard>
      <View style={{ paddingHorizontal: 18 }}>
        <Button
          mode="outlined"
          icon="delete"
          textColor={palette.danger}
          style={{ borderRadius: theme.roundness }}
          onPress={handleDelete}
        >
          Delete Asset
        </Button>
      </View>
    </Screen>
  );
};

export default EditAssetScreen;
