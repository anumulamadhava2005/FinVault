import React from 'react';
import { Alert, View } from 'react-native';
import { ActivityIndicator, Button } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '../../context/AppContext';
import { useDataSafe } from '../../hooks/useData';
import { first, update, remove, all } from '../../db';
import type { Asset, AssetType } from '../../models/types';
import { Screen, SectionCard, EmptyState } from '../../components/ui';
import { palette } from '../../theme';
import AssetForm, { AssetFormValues, assetToFormValues } from '../../components/assets/AssetForm';

const EditAssetScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, refresh } = useApp();
  const router = useRouter();

  const { data: asset, error: assetError } = useDataSafe(() =>
    first<Asset>('SELECT * FROM assets WHERE id = ? AND user_id = ?', [id, userId]),
  );
  const { data: assetTypes, error: typesError } = useDataSafe(() =>
    all<AssetType>('SELECT * FROM asset_types ORDER BY sort_order'),
  );

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
    update('assets', id, {
      invested_amount: values.invested_amount,
      current_value: values.current_value,
      quantity: values.quantity,
      investment_date: values.investment_date,
      purchase_date: values.investment_date,
      maturity_date: values.maturity_date,
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

  return (
    <Screen>
      <SectionCard>
        <AssetForm
          visible
          inline
          readOnlyIdentity
          onDismiss={() => router.back()}
          onSave={handleSave}
          assetTypes={assetTypes}
          initial={assetToFormValues(asset)}
          title="Edit Asset"
        />
      </SectionCard>
      <Button
        mode="outlined"
        icon="delete"
        textColor={palette.danger}
        onPress={handleDelete}
      >
        Delete Asset
      </Button>
    </Screen>
  );
};

export default EditAssetScreen;
