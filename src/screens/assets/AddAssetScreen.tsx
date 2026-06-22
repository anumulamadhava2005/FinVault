import React from 'react';
import { View } from 'react-native';
import { ActivityIndicator, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { useApp } from '../../context/AppContext';
import { useDataSafe } from '../../hooks/useData';
import { all, insert, newId } from '../../db';
import type { AssetType } from '../../models/types';
import { Screen, SectionCard, EmptyState } from '../../components/ui';
import AssetForm, { AssetFormValues } from '../../components/assets/AssetForm';
import { nowISO } from '../../utils/date';

const AddAssetScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const router = useRouter();

  const { data: assetTypes, error: typesError } = useDataSafe(() =>
    all<AssetType>('SELECT * FROM asset_types ORDER BY sort_order'),
  );

  const theme = useTheme();

  if (typesError) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle"
          title="Failed to load"
          message={typesError}
        />
      </Screen>
    );
  }

  if (!assetTypes) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      </Screen>
    );
  }

  const handleSave = (values: AssetFormValues) => {
    const typeId = values.asset_type_id || assetTypes[0]?.id;
    if (!values.name.trim() || !typeId) return;

    insert('assets', {
      id: newId(),
      user_id: userId!,
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

    refresh();
    router.back();
  };

  return (
    <Screen>
      <SectionCard style={{ marginBottom: 16 }}>
        <AssetForm
          visible
          inline
          onDismiss={() => router.back()}
          onSave={handleSave}
          assetTypes={assetTypes}
          title="Add Asset"
        />
      </SectionCard>
    </Screen>
  );
};

export default AddAssetScreen;
