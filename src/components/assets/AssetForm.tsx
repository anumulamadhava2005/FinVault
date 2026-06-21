import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Dialog, Menu, Switch, Text, TextInput, useTheme } from 'react-native-paper';

import type { Asset, AssetType } from '../../models/types';
import { Row } from '../ui';
import { rupeesToPaise } from '../../utils/money';
import { getTypeConfig } from './AssetTypeFieldConfig';
import { SIP_ELIGIBLE_TYPES } from '../../services/constants';
import DatePickerField from './DatePickerField';

export interface AssetFormValues {
  name: string;
  asset_type_id: string;
  invested_amount: number;
  current_value: number;
  quantity: number;
  investment_date: string | null;
  maturity_date: string | null;
  guaranteed_return_pct: number | null;
  isin: string | null;
  ticker: string | null;
  current_nav: number | null;
  price_per_unit: number | null;
  is_sip: boolean;
  sip_monthly_amount: number;
  notes: string | null;
  details_json: string | null;
}

const BLANK: AssetFormValues = {
  name: '',
  asset_type_id: '',
  invested_amount: 0,
  current_value: 0,
  quantity: 0,
  investment_date: null,
  maturity_date: null,
  guaranteed_return_pct: null,
  isin: null,
  ticker: null,
  current_nav: null,
  price_per_unit: null,
  is_sip: false,
  sip_monthly_amount: 0,
  notes: null,
  details_json: null,
};

export const assetToFormValues = (a: Asset): AssetFormValues => ({
  name: a.name,
  asset_type_id: a.asset_type_id,
  invested_amount: a.invested_amount,
  current_value: a.current_value,
  quantity: a.quantity,
  investment_date: a.investment_date ?? a.purchase_date,
  maturity_date: a.maturity_date,
  guaranteed_return_pct: a.guaranteed_return_pct,
  isin: a.isin,
  ticker: a.ticker,
  current_nav: a.current_nav,
  price_per_unit: a.price_per_unit,
  is_sip: !!a.is_sip,
  sip_monthly_amount: a.sip_monthly_amount,
  notes: a.notes,
  details_json: a.details_json,
});

interface AssetFormProps {
  visible: boolean;
  onDismiss: () => void;
  onSave: (values: AssetFormValues) => void;
  assetTypes: AssetType[];
  initial?: Partial<AssetFormValues>;
  title?: string;
  inline?: boolean;
  readOnlyIdentity?: boolean;
}

const SectionHeading: React.FC<{ label: string }> = ({ label }) => {
  const theme = useTheme();
  return (
    <Text
      variant="labelSmall"
      style={{
        color: theme.colors.onSurfaceVariant,
        letterSpacing: 0.8,
        marginTop: 6,
        marginBottom: 2,
      }}
    >
      {label}
    </Text>
  );
};

const AssetForm: React.FC<AssetFormProps> = ({
  visible,
  onDismiss,
  onSave,
  assetTypes,
  initial,
  title = 'Add Asset',
  inline,
  readOnlyIdentity,
}) => {
  const theme = useTheme();
  const [form, setForm] = useState<AssetFormValues>({ ...BLANK, ...initial });
  const [details, setDetails] = useState<Record<string, string>>(() => {
    try { return initial?.details_json ? JSON.parse(initial.details_json) : {}; } catch { return {}; }
  });
  const [typeMenu, setTypeMenu] = useState(false);
  const [selectMenus, setSelectMenus] = useState<Record<string, boolean>>({});

  const set = <K extends keyof AssetFormValues>(k: K, v: AssetFormValues[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const selectedType = assetTypes.find((t) => t.id === form.asset_type_id);
  const slug = selectedType?.slug ?? '';
  const cfg = useMemo(() => getTypeConfig(slug), [slug]);
  const sipEligible = SIP_ELIGIBLE_TYPES.has(slug);

  const handleSave = () => {
    if (!form.name.trim() || !form.asset_type_id || form.invested_amount <= 0) return;
    const detailsStr = Object.keys(details).length ? JSON.stringify(details) : null;
    onSave({ ...form, details_json: detailsStr });
  };

  const handleTypeSelect = (id: string) => {
    set('asset_type_id', id);
  };

  const openSelectMenu = (key: string) =>
    setSelectMenus((m) => ({ ...m, [key]: true }));
  const closeSelectMenu = (key: string) =>
    setSelectMenus((m) => ({ ...m, [key]: false }));

  const formContent = (
    <View style={{ gap: 10, paddingVertical: 8 }}>
      {/* Asset name + type selector */}
      <TextInput
        label={`${cfg.assetNameLabel ?? 'Asset Name'} *`}
        value={form.name}
        onChangeText={(v) => set('name', v)}
        mode="outlined"
        dense
        disabled={readOnlyIdentity}
      />

      {readOnlyIdentity ? (
        <View style={{
          borderWidth: 1,
          borderColor: theme.colors.outline,
          borderRadius: 4,
          paddingHorizontal: 12,
          paddingVertical: 12,
          backgroundColor: theme.colors.surfaceVariant,
          opacity: 0.72,
          marginTop: 2,
        }}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 2 }}>Asset type</Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>{selectedType?.name ?? '—'}</Text>
        </View>
      ) : (
        <Menu
          visible={typeMenu}
          onDismiss={() => setTypeMenu(false)}
          anchor={
            <Button mode="outlined" onPress={() => setTypeMenu(true)} style={{ marginTop: 2 }}>
              {selectedType?.name ?? 'Select asset type…'}
            </Button>
          }
        >
          {assetTypes.map((t) => (
            <Menu.Item key={t.id} title={t.name} onPress={() => { handleTypeSelect(t.id); setTypeMenu(false); }} />
          ))}
        </Menu>
      )}

      {/* IDENTIFIERS section (equity, MF, SGB) */}
      {(cfg.showIsin || cfg.showTicker) && cfg.identifiersSection && (
        <SectionHeading label={cfg.identifiersSection} />
      )}
      {cfg.showIsin && (
        <TextInput
          label="ISIN code"
          value={form.isin ?? ''}
          onChangeText={(v) => set('isin', v || null)}
          mode="outlined"
          dense
          autoCapitalize="characters"
        />
      )}
      {cfg.showTicker && (
        <TextInput
          label={cfg.slug === 'equity' ? 'NSE/BSE ticker' : 'BSE/NSE ticker'}
          value={form.ticker ?? ''}
          onChangeText={(v) => set('ticker', v || null)}
          mode="outlined"
          dense
          autoCapitalize="characters"
          placeholder={cfg.slug === 'equity' ? 'e.g. RELIANCE' : cfg.slug === 'mutual_fund' ? 'e.g. HDFCMIDCAP' : 'e.g. SGBAUG28'}
        />
      )}

      {/* Type-specific extra fields BEFORE financial details (account details, item details, property details) */}
      {(cfg.extraFields ?? []).length > 0 && cfg.extraSection && (
        <SectionHeading label={cfg.extraSection} />
      )}
      {(cfg.extraFields ?? []).map((f) => {
        if (f.type === 'select') {
          const selectedOpt = f.options?.find((o) => o.value === details[f.key]);
          return (
            <Menu
              key={f.key}
              visible={!!selectMenus[f.key]}
              onDismiss={() => closeSelectMenu(f.key)}
              anchor={
                <Button
                  mode="outlined"
                  onPress={() => openSelectMenu(f.key)}
                  style={{ marginTop: 2 }}
                >
                  {selectedOpt ? `${f.label}: ${selectedOpt.label}` : `${f.label}…`}
                </Button>
              }
            >
              {(f.options ?? []).map((opt) => (
                <Menu.Item
                  key={opt.value}
                  title={opt.label}
                  onPress={() => {
                    setDetails((d) => ({ ...d, [f.key]: opt.value }));
                    closeSelectMenu(f.key);
                  }}
                />
              ))}
            </Menu>
          );
        }
        return (
          <TextInput
            key={f.key}
            label={f.label}
            keyboardType={f.type === 'numeric' ? 'numeric' : 'default'}
            value={details[f.key] ?? ''}
            onChangeText={(v) => setDetails((d) => ({ ...d, [f.key]: v }))}
            mode="outlined"
            dense
          />
        );
      })}

      {/* Investment details section heading */}
      {cfg.investmentDetailsSection && (
        <SectionHeading label={cfg.investmentDetailsSection} />
      )}

      {/* Quantity / Units (shown before financial for most types) */}
      {cfg.showQuantity !== false && (
        <TextInput
          label={`${cfg.quantityLabel ?? 'Quantity / Units'} *`}
          keyboardType="numeric"
          value={form.quantity ? String(form.quantity) : ''}
          onChangeText={(v) => set('quantity', parseFloat(v) || 0)}
          mode="outlined"
          dense
        />
      )}

      {/* NAV / purchase price */}
      {cfg.showNav && (
        <TextInput
          label={cfg.navLabel ?? 'Current NAV (₹)'}
          keyboardType="numeric"
          value={form.current_nav ? String(form.current_nav) : ''}
          onChangeText={(v) => set('current_nav', parseFloat(v) || null)}
          mode="outlined"
          dense
        />
      )}

      {/* Price per unit */}
      {cfg.showPricePerUnit && (
        <TextInput
          label={cfg.pricePerUnitLabel ?? 'Price per Unit (₹)'}
          keyboardType="numeric"
          value={form.price_per_unit ? String(form.price_per_unit) : ''}
          onChangeText={(v) => set('price_per_unit', parseFloat(v) || null)}
          mode="outlined"
          dense
        />
      )}

      {/* Invested + Current Value (stacked) */}
      <TextInput
        label={`${cfg.investedLabel ?? 'Invested (₹)'} *`}
        keyboardType="numeric"
        value={form.invested_amount ? String(form.invested_amount / 100) : ''}
        onChangeText={(v) => set('invested_amount', rupeesToPaise(v || '0'))}
        mode="outlined"
        dense
      />
      <TextInput
        label={cfg.currentValueLabel ?? 'Current value (₹)'}
        keyboardType="numeric"
        value={form.current_value ? String(form.current_value / 100) : ''}
        onChangeText={(v) => set('current_value', rupeesToPaise(v || '0'))}
        mode="outlined"
        dense
      />

      {/* Investment / purchase / start date */}
      <DatePickerField
        label={cfg.investmentDateLabel ?? 'Investment date'}
        value={form.investment_date}
        onChange={(d) => set('investment_date', d)}
        clearable
      />

      {/* Guaranteed return % (interest rate / coupon rate) */}
      {cfg.showGuaranteedReturn && (
        <TextInput
          label={cfg.guaranteedReturnLabel ?? 'Guaranteed Return %'}
          keyboardType="numeric"
          value={form.guaranteed_return_pct ? String(form.guaranteed_return_pct) : ''}
          onChangeText={(v) => set('guaranteed_return_pct', parseFloat(v) || null)}
          mode="outlined"
          dense
        />
      )}

      {/* Maturity date */}
      {cfg.showMaturityDate && (
        <DatePickerField
          label="Maturity date"
          value={form.maturity_date}
          onChange={(d) => set('maturity_date', d)}
          clearable
        />
      )}

      {/* SIP section */}
      {sipEligible && (
        <>
          <SectionHeading label="SIP" />
          <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="bodyMedium">{cfg.sipCheckboxLabel ?? 'This asset has an active SIP'}</Text>
            <Switch value={form.is_sip} onValueChange={(v) => set('is_sip', v)} />
          </Row>
        </>
      )}

      {sipEligible && form.is_sip && (
        <TextInput
          label={cfg.sipMonthlyLabel ?? 'Monthly SIP (₹)'}
          keyboardType="numeric"
          value={form.sip_monthly_amount ? String(form.sip_monthly_amount / 100) : ''}
          onChangeText={(v) => set('sip_monthly_amount', rupeesToPaise(v || '0'))}
          mode="outlined"
          dense
        />
      )}

      {/* Notes */}
      <SectionHeading label="NOTES" />
      <TextInput
        label="Notes"
        value={form.notes ?? ''}
        onChangeText={(v) => set('notes', v || null)}
        mode="outlined"
        dense
        multiline
        numberOfLines={2}
      />
    </View>
  );

  if (inline) {
    return (
      <>
        {formContent}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Button mode="outlined" onPress={onDismiss} style={{ flex: 1 }}>Cancel</Button>
          <Button mode="contained" onPress={handleSave} style={{ flex: 1 }}>Save</Button>
        </View>
      </>
    );
  }

  return (
    <Dialog visible={visible} onDismiss={onDismiss} style={{ maxHeight: '90%' }}>
      <Dialog.Title>{title}</Dialog.Title>
      <Dialog.ScrollArea>
        <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          {formContent}
        </ScrollView>
      </Dialog.ScrollArea>
      <Dialog.Actions>
        <Button onPress={onDismiss}>Cancel</Button>
        <Button mode="contained" onPress={handleSave}>Save</Button>
      </Dialog.Actions>
    </Dialog>
  );
};

export default AssetForm;
