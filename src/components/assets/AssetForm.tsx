import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ScrollView, View, Modal, Animated, Easing } from 'react-native';
import { Button, HelperText, Menu, Switch, Text, TextInput, useTheme } from 'react-native-paper';

import type { Asset, AssetType } from '../../models/types';
import { Row } from '../ui';
import { rupeesToPaise } from '../../utils/money';
import { getTypeConfig } from './AssetTypeFieldConfig';
import { SIP_ELIGIBLE_TYPES } from '../../services/constants';
import DatePickerField from './DatePickerField';
import BouncePressable from '../BouncePressable';

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
        fontWeight: '600',
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
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Input text state management to avoid cursor jumping and support decimal editing
  const [quantityText, setQuantityText] = useState(form.quantity ? String(form.quantity) : '');
  const [pricePerUnitText, setPricePerUnitText] = useState(form.price_per_unit ? String(form.price_per_unit) : '');
  const [currentNavText, setCurrentNavText] = useState(form.current_nav ? String(form.current_nav) : '');
  const [investedAmountText, setInvestedAmountText] = useState(form.invested_amount ? String(form.invested_amount / 100) : '');
  const [currentValueText, setCurrentValueText] = useState(form.current_value ? String(form.current_value / 100) : '');
  const [sipMonthlyAmountText, setSipMonthlyAmountText] = useState(form.sip_monthly_amount ? String(form.sip_monthly_amount / 100) : '');

  // Synchronise state when initial values update
  useEffect(() => {
    const nextForm = { ...BLANK, ...initial };
    setForm(nextForm);
    setQuantityText(nextForm.quantity ? String(nextForm.quantity) : '');
    setPricePerUnitText(nextForm.price_per_unit ? String(nextForm.price_per_unit) : '');
    setCurrentNavText(nextForm.current_nav ? String(nextForm.current_nav) : '');
    setInvestedAmountText(nextForm.invested_amount ? String(nextForm.invested_amount / 100) : '');
    setCurrentValueText(nextForm.current_value ? String(nextForm.current_value / 100) : '');
    setSipMonthlyAmountText(nextForm.sip_monthly_amount ? String(nextForm.sip_monthly_amount / 100) : '');
    try {
      setDetails(initial?.details_json ? JSON.parse(initial.details_json) : {});
    } catch {
      setDetails({});
    }
  }, [initial]);

  // Emil Kowalski style transition animations
  const [shouldRender, setShouldRender] = useState(visible);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const fieldsOpacity = useRef(new Animated.Value(1)).current;
  const fieldsTranslateY = useRef(new Animated.Value(0)).current;

  // Animate dialog entry/exit
  useEffect(() => {
    if (visible) {
      setShouldRender(true);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.bezier(0.23, 1, 0.32, 1),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 200,
          easing: Easing.bezier(0.23, 1, 0.32, 1),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          easing: Easing.bezier(0.23, 1, 0.32, 1),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 150,
          easing: Easing.bezier(0.23, 1, 0.32, 1),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShouldRender(false);
      });
    }
  }, [visible]);

  // Animate dynamic fields slide/fade crossfade on asset type swap
  useEffect(() => {
    fieldsOpacity.setValue(0.5);
    fieldsTranslateY.setValue(4);
    Animated.parallel([
      Animated.timing(fieldsOpacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        useNativeDriver: true,
      }),
      Animated.timing(fieldsTranslateY, {
        toValue: 0,
        duration: 180,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        useNativeDriver: true,
      }),
    ]).start();
  }, [form.asset_type_id]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 150,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShouldRender(false);
      onDismiss();
    });
  };

  const set = <K extends keyof AssetFormValues>(k: K, v: AssetFormValues[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const selectedType = assetTypes.find((t) => t.id === form.asset_type_id);
  const slug = selectedType?.slug ?? '';
  const cfg = useMemo(() => getTypeConfig(slug), [slug]);
  const sipEligible = SIP_ELIGIBLE_TYPES.has(slug);

  // Dynamic Math Auto-Calculations
  const handleQuantityChange = (v: string) => {
    setQuantityText(v);
    const parsed = parseFloat(v);
    if (!isNaN(parsed)) {
      setForm((f) => {
        const next = { ...f, quantity: parsed };
        if (parsed > 0) {
          // Invested amount calculation
          if (f.price_per_unit !== null && f.price_per_unit > 0) {
            const calculatedInvested = Math.round(parsed * f.price_per_unit * 100);
            next.invested_amount = calculatedInvested;
            setInvestedAmountText(String(calculatedInvested / 100));
          } else if (f.current_nav !== null && f.current_nav > 0) {
            const calculatedInvested = Math.round(parsed * f.current_nav * 100);
            next.invested_amount = calculatedInvested;
            setInvestedAmountText(String(calculatedInvested / 100));
          }
          // Current value calculation
          const currentPrice = f.current_nav !== null && f.current_nav > 0 ? f.current_nav : (f.price_per_unit !== null && f.price_per_unit > 0 ? f.price_per_unit : null);
          if (currentPrice !== null) {
            const calculatedCurrent = Math.round(parsed * currentPrice * 100);
            next.current_value = calculatedCurrent;
            setCurrentValueText(String(calculatedCurrent / 100));
          }
        }
        return next;
      });
    } else {
      set('quantity', 0);
    }
  };

  const handlePricePerUnitChange = (v: string) => {
    setPricePerUnitText(v);
    const parsed = parseFloat(v);
    if (!isNaN(parsed)) {
      setForm((f) => {
        const next = { ...f, price_per_unit: parsed };
        if (f.quantity > 0) {
          const calculatedInvested = Math.round(f.quantity * parsed * 100);
          next.invested_amount = calculatedInvested;
          setInvestedAmountText(String(calculatedInvested / 100));

          if (f.current_nav === null || f.current_nav === 0) {
            const calculatedCurrent = Math.round(f.quantity * parsed * 100);
            next.current_value = calculatedCurrent;
            setCurrentValueText(String(calculatedCurrent / 100));
          }
        }
        return next;
      });
    } else if (v === '') {
      setForm((f) => ({ ...f, price_per_unit: null }));
    }
  };

  const handleCurrentNavChange = (v: string) => {
    setCurrentNavText(v);
    const parsed = parseFloat(v);
    if (!isNaN(parsed)) {
      setForm((f) => {
        const next = { ...f, current_nav: parsed };
        if (f.quantity > 0) {
          if (f.price_per_unit === null || f.price_per_unit === 0) {
            const calculatedInvested = Math.round(f.quantity * parsed * 100);
            next.invested_amount = calculatedInvested;
            setInvestedAmountText(String(calculatedInvested / 100));
          }
          const calculatedCurrent = Math.round(f.quantity * parsed * 100);
          next.current_value = calculatedCurrent;
          setCurrentValueText(String(calculatedCurrent / 100));
        }
        return next;
      });
    } else if (v === '') {
      setForm((f) => ({ ...f, current_nav: null }));
    }
  };

  const handleInvestedAmountChange = (v: string) => {
    setInvestedAmountText(v);
    const amt = rupeesToPaise(v || '0');
    set('invested_amount', amt);
  };

  const handleCurrentValueChange = (v: string) => {
    setCurrentValueText(v);
    const amt = rupeesToPaise(v || '0');
    set('current_value', amt);
  };

  const handleSipMonthlyAmountChange = (v: string) => {
    setSipMonthlyAmountText(v);
    const amt = rupeesToPaise(v || '0');
    set('sip_monthly_amount', amt);
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    // 1. Asset Name (always required)
    if (!form.name.trim()) {
      newErrors.name = 'Asset name is required';
    }

    // 2. Asset Type (always required)
    if (!form.asset_type_id) {
      newErrors.asset_type_id = 'Asset type is required';
    }

    // 3. Ticker (required for Equity)
    if (cfg.slug === 'equity' && !form.ticker?.trim()) {
      newErrors.ticker = 'Ticker is required';
    }

    // 4. Extra fields validation
    (cfg.extraFields ?? []).forEach((field) => {
      if (field.required && !details[field.key]?.trim()) {
        newErrors[field.key] = `${field.label} is required`;
      }
    });

    // 5. Quantity / Units (required if showQuantity !== false)
    if (cfg.showQuantity !== false) {
      const parsedQty = parseFloat(quantityText);
      if (isNaN(parsedQty) || parsedQty <= 0) {
        newErrors.quantity = `${cfg.quantityLabel ?? 'Quantity'} must be greater than 0`;
      }
    }

    // 6. Price per unit / NAV (required for equity, sgb, physical_gold, digital_gold)
    if (cfg.slug === 'equity' || cfg.slug === 'sgb' || cfg.slug === 'physical_gold' || cfg.slug === 'digital_gold') {
      const priceVal = parseFloat(pricePerUnitText);
      const labelName = cfg.pricePerUnitLabel ?? 'Price';
      if (isNaN(priceVal) || priceVal <= 0) {
        newErrors.price_per_unit = `${labelName} must be greater than 0`;
      }
    }

    // 7. Invested Amount (always required and > 0)
    const investedVal = parseFloat(investedAmountText);
    if (isNaN(investedVal) || investedVal <= 0) {
      newErrors.invested_amount = `${cfg.investedLabel ?? 'Invested amount'} must be greater than 0`;
    }

    // 8. Current Value (always required and > 0)
    const currentVal = parseFloat(currentValueText);
    if (isNaN(currentVal) || currentVal <= 0) {
      newErrors.current_value = `${cfg.currentValueLabel ?? 'Current value'} must be greater than 0`;
    }

    // 9. Investment Date (always required)
    if (!form.investment_date) {
      newErrors.investment_date = `${cfg.investmentDateLabel ?? 'Investment date'} is required`;
    }

    // 10. Maturity Date (required for sgb and fd)
    if (cfg.showMaturityDate && (cfg.slug === 'sgb' || cfg.slug === 'fd')) {
      if (!form.maturity_date) {
        newErrors.maturity_date = 'Maturity date is required';
      } else if (form.investment_date && form.maturity_date <= form.investment_date) {
        newErrors.maturity_date = 'Maturity date must be after investment/start date';
      }
    }

    // 11. Guaranteed Return / Coupon Rate / Interest Rate (required for sgb, fd, ppf)
    if (cfg.showGuaranteedReturn && (cfg.slug === 'sgb' || cfg.slug === 'fd' || cfg.slug === 'ppf')) {
      if (form.guaranteed_return_pct === null || isNaN(form.guaranteed_return_pct) || form.guaranteed_return_pct <= 0) {
        newErrors.guaranteed_return_pct = `${cfg.guaranteedReturnLabel ?? 'Interest rate'} must be greater than 0`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const detailsStr = Object.keys(details).length ? JSON.stringify(details) : null;
    onSave({ ...form, details_json: detailsStr });
  };

  const handleTypeSelect = (id: string) => {
    set('asset_type_id', id);
    setErrors({});
    const selected = assetTypes.find((t) => t.id === id);
    if (selected?.slug === 'sgb') {
      set('guaranteed_return_pct', 2.5);
    } else if (selected?.slug === 'fd') {
      set('guaranteed_return_pct', 7.0);
    } else if (selected?.slug === 'ppf') {
      set('guaranteed_return_pct', 7.1);
    } else {
      set('guaranteed_return_pct', null);
    }
  };

  const openSelectMenu = (key: string) =>
    setSelectMenus((m) => ({ ...m, [key]: true }));
  const closeSelectMenu = (key: string) =>
    setSelectMenus((m) => ({ ...m, [key]: false }));

  const formContent = (
    <View style={{ gap: 12, paddingVertical: 8 }}>
      {/* Asset name + type selector */}
      <View>
        <TextInput
          label={`${cfg.assetNameLabel ?? 'Asset Name'} *`}
          value={form.name}
          onChangeText={(v) => set('name', v)}
          mode="outlined"
          dense
          disabled={readOnlyIdentity}
          error={!!errors.name}
          style={{ backgroundColor: theme.colors.surface }}
        />
        {!!errors.name && <HelperText type="error">{errors.name}</HelperText>}
      </View>

      {readOnlyIdentity ? (
        <View style={{
          borderWidth: 1,
          borderColor: theme.colors.outline,
          borderRadius: 8,
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
        <View>
          <Menu
            visible={typeMenu}
            onDismiss={() => setTypeMenu(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setTypeMenu(true)}
                style={{ marginTop: 2, borderRadius: theme.roundness }}
                contentStyle={{ height: 44, justifyContent: 'flex-start' }}
              >
                {selectedType?.name ?? 'Select asset type…'}
              </Button>
            }
          >
            {assetTypes.map((t) => (
              <Menu.Item key={t.id} title={t.name} onPress={() => { handleTypeSelect(t.id); setTypeMenu(false); }} />
            ))}
          </Menu>
          {!!errors.asset_type_id && <HelperText type="error">{errors.asset_type_id}</HelperText>}
        </View>
      )}

      {/* IDENTIFIERS section (equity, MF, SGB) */}
      {(cfg.showIsin || cfg.showTicker) && cfg.identifiersSection && (
        <SectionHeading label={cfg.identifiersSection} />
      )}
      {cfg.showIsin && cfg.showTicker ? (
        <Row gap={12}>
          <View style={{ flex: 1 }}>
            <TextInput
              label="ISIN code (optional)"
              value={form.isin ?? ''}
              onChangeText={(v) => set('isin', v || null)}
              mode="outlined"
              dense
              error={!!errors.isin}
              autoCapitalize="characters"
              style={{ backgroundColor: theme.colors.surface }}
            />
            {!!errors.isin && <HelperText type="error">{errors.isin}</HelperText>}
          </View>
          <View style={{ flex: 1 }}>
            <TextInput
              label={cfg.slug === 'equity' ? 'NSE/BSE ticker *' : 'BSE/NSE ticker (optional)'}
              value={form.ticker ?? ''}
              onChangeText={(v) => set('ticker', v || null)}
              mode="outlined"
              dense
              error={!!errors.ticker}
              autoCapitalize="characters"
              placeholder={cfg.slug === 'equity' ? 'e.g. RELIANCE' : cfg.slug === 'mutual_fund' ? 'e.g. HDFCMIDCAP' : 'e.g. SGBAUG28'}
              style={{ backgroundColor: theme.colors.surface }}
            />
            {!!errors.ticker && <HelperText type="error">{errors.ticker}</HelperText>}
          </View>
        </Row>
      ) : (
        <>
          {cfg.showIsin && (
            <View>
              <TextInput
                label="ISIN code (optional)"
                value={form.isin ?? ''}
                onChangeText={(v) => set('isin', v || null)}
                mode="outlined"
                dense
                error={!!errors.isin}
                autoCapitalize="characters"
                style={{ backgroundColor: theme.colors.surface }}
              />
              {!!errors.isin && <HelperText type="error">{errors.isin}</HelperText>}
            </View>
          )}
          {cfg.showTicker && (
            <View>
              <TextInput
                label={cfg.slug === 'equity' ? 'NSE/BSE ticker *' : 'BSE/NSE ticker (optional)'}
                value={form.ticker ?? ''}
                onChangeText={(v) => set('ticker', v || null)}
                mode="outlined"
                dense
                error={!!errors.ticker}
                autoCapitalize="characters"
                placeholder={cfg.slug === 'equity' ? 'e.g. RELIANCE' : cfg.slug === 'mutual_fund' ? 'e.g. HDFCMIDCAP' : 'e.g. SGBAUG28'}
                style={{ backgroundColor: theme.colors.surface }}
              />
              {!!errors.ticker && <HelperText type="error">{errors.ticker}</HelperText>}
            </View>
          )}
        </>
      )}

      {/* Type-specific extra fields BEFORE financial details (account details, item details, property details) */}
      {(cfg.extraFields ?? []).length > 0 && cfg.extraSection && (
        <SectionHeading label={cfg.extraSection} />
      )}
      {(cfg.extraFields ?? []).length === 2 ? (
        <Row gap={12}>
          {(cfg.extraFields ?? []).map((f) => {
            const isRequired = f.required;
            const displayLabel = `${f.label}${isRequired ? ' *' : ' (optional)'}`;
            return (
              <View key={f.key} style={{ flex: 1 }}>
                <TextInput
                  label={displayLabel}
                  keyboardType={f.type === 'numeric' ? 'numeric' : 'default'}
                  value={details[f.key] ?? ''}
                  onChangeText={(v) => setDetails((d) => ({ ...d, [f.key]: v }))}
                  mode="outlined"
                  dense
                  error={!!errors[f.key]}
                  style={{ backgroundColor: theme.colors.surface }}
                />
                {!!errors[f.key] && <HelperText type="error">{errors[f.key]}</HelperText>}
              </View>
            );
          })}
        </Row>
      ) : (
        (cfg.extraFields ?? []).map((f) => {
          const isRequired = f.required;
          const displayLabel = `${f.label}${isRequired ? ' *' : ' (optional)'}`;
          if (f.type === 'select') {
            const selectedOpt = f.options?.find((o) => o.value === details[f.key]);
            return (
              <View key={f.key}>
                <Menu
                  visible={!!selectMenus[f.key]}
                  onDismiss={() => closeSelectMenu(f.key)}
                  anchor={
                    <Button
                      mode="outlined"
                      onPress={() => openSelectMenu(f.key)}
                      style={{ marginTop: 2, borderRadius: theme.roundness }}
                      contentStyle={{ height: 44, justifyContent: 'flex-start' }}
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
                {!!errors[f.key] && <HelperText type="error">{errors[f.key]}</HelperText>}
              </View>
            );
          }
          return (
            <View key={f.key}>
              <TextInput
                label={displayLabel}
                keyboardType={f.type === 'numeric' ? 'numeric' : 'default'}
                value={details[f.key] ?? ''}
                onChangeText={(v) => setDetails((d) => ({ ...d, [f.key]: v }))}
                mode="outlined"
                dense
                error={!!errors[f.key]}
                style={{ backgroundColor: theme.colors.surface }}
              />
              {!!errors[f.key] && <HelperText type="error">{errors[f.key]}</HelperText>}
            </View>
          );
        })
      )}

      {/* Investment details section heading */}
      {cfg.investmentDetailsSection && (
        <SectionHeading label={cfg.investmentDetailsSection} />
      )}

      {/* Quantity / Units + NAV / Price per unit side-by-side if both are shown */}
      {cfg.showQuantity !== false && (cfg.showNav || cfg.showPricePerUnit) ? (
        <Row gap={12}>
          <View style={{ flex: 1 }}>
            <TextInput
              label={`${cfg.quantityLabel ?? 'Quantity / Units'} *`}
              keyboardType="numeric"
              value={quantityText}
              onChangeText={handleQuantityChange}
              mode="outlined"
              dense
              error={!!errors.quantity}
              style={{ backgroundColor: theme.colors.surface }}
            />
            {!!errors.quantity && <HelperText type="error">{errors.quantity}</HelperText>}
          </View>
          <View style={{ flex: 1 }}>
            {cfg.showNav && (
              <View>
                <TextInput
                  label={`${cfg.navLabel ?? 'Current NAV (₹)'} (optional)`}
                  keyboardType="numeric"
                  value={currentNavText}
                  onChangeText={handleCurrentNavChange}
                  mode="outlined"
                  dense
                  error={!!errors.current_nav}
                  style={{ backgroundColor: theme.colors.surface }}
                />
                {!!errors.current_nav && <HelperText type="error">{errors.current_nav}</HelperText>}
              </View>
            )}
            {cfg.showPricePerUnit && (
              <View>
                <TextInput
                  label={`${cfg.pricePerUnitLabel ?? 'Price per Unit (₹)'} *`}
                  keyboardType="numeric"
                  value={pricePerUnitText}
                  onChangeText={handlePricePerUnitChange}
                  mode="outlined"
                  dense
                  error={!!errors.price_per_unit}
                  style={{ backgroundColor: theme.colors.surface }}
                />
                {!!errors.price_per_unit && <HelperText type="error">{errors.price_per_unit}</HelperText>}
              </View>
            )}
          </View>
        </Row>
      ) : (
        <>
          {cfg.showQuantity !== false && (
            <View>
              <TextInput
                label={`${cfg.quantityLabel ?? 'Quantity / Units'} *`}
                keyboardType="numeric"
                value={quantityText}
                onChangeText={handleQuantityChange}
                mode="outlined"
                dense
                error={!!errors.quantity}
                style={{ backgroundColor: theme.colors.surface }}
              />
              {!!errors.quantity && <HelperText type="error">{errors.quantity}</HelperText>}
            </View>
          )}
          {cfg.showNav && (
            <View>
              <TextInput
                label={`${cfg.navLabel ?? 'Current NAV (₹)'} (optional)`}
                keyboardType="numeric"
                value={currentNavText}
                onChangeText={handleCurrentNavChange}
                mode="outlined"
                dense
                error={!!errors.current_nav}
                style={{ backgroundColor: theme.colors.surface }}
              />
              {!!errors.current_nav && <HelperText type="error">{errors.current_nav}</HelperText>}
            </View>
          )}
          {cfg.showPricePerUnit && (
            <View>
              <TextInput
                label={`${cfg.pricePerUnitLabel ?? 'Price per Unit (₹)'} *`}
                keyboardType="numeric"
                value={pricePerUnitText}
                onChangeText={handlePricePerUnitChange}
                mode="outlined"
                dense
                error={!!errors.price_per_unit}
                style={{ backgroundColor: theme.colors.surface }}
              />
              {!!errors.price_per_unit && <HelperText type="error">{errors.price_per_unit}</HelperText>}
            </View>
          )}
        </>
      )}

      {/* Invested + Current Value */}
      <Row gap={12}>
        <View style={{ flex: 1 }}>
          <TextInput
            label={`${cfg.investedLabel ?? 'Invested (₹)'} *`}
            keyboardType="numeric"
            value={investedAmountText}
            onChangeText={handleInvestedAmountChange}
            mode="outlined"
            dense
            editable={cfg.slug !== 'equity'}
            error={!!errors.invested_amount}
            style={{
              backgroundColor: cfg.slug === 'equity' ? theme.colors.surfaceVariant : theme.colors.surface,
              opacity: cfg.slug === 'equity' ? 0.72 : 1,
            }}
          />
          {cfg.slug === 'equity' && (
            <HelperText type="info" style={{ marginTop: -2, paddingHorizontal: 4 }}>
              Auto = shares × buy price
            </HelperText>
          )}
          {!!errors.invested_amount && <HelperText type="error">{errors.invested_amount}</HelperText>}
        </View>
        <View style={{ flex: 1 }}>
          <TextInput
            label={`${cfg.currentValueLabel ?? 'Current value (₹)'} *`}
            keyboardType="numeric"
            value={currentValueText}
            onChangeText={handleCurrentValueChange}
            mode="outlined"
            dense
            error={!!errors.current_value}
            style={{ backgroundColor: theme.colors.surface }}
          />
          {!!errors.current_value && <HelperText type="error">{errors.current_value}</HelperText>}
        </View>
      </Row>

      {/* Investment date + Coupon rate / Monthly SIP */}
      {cfg.showGuaranteedReturn || (sipEligible && form.is_sip) ? (
        <Row gap={12}>
          <View style={{ flex: 1 }}>
            <DatePickerField
              label={`${cfg.investmentDateLabel ?? 'Investment date'} *`}
              value={form.investment_date}
              onChange={(d) => set('investment_date', d)}
              error={errors.investment_date}
              clearable
            />
          </View>
          <View style={{ flex: 1 }}>
            {cfg.showGuaranteedReturn && (
              <View>
                <TextInput
                  label={`${cfg.guaranteedReturnLabel ?? 'Guaranteed Return %'} *`}
                  keyboardType="numeric"
                  value={form.guaranteed_return_pct !== null ? String(form.guaranteed_return_pct) : ''}
                  onChangeText={(v) => set('guaranteed_return_pct', parseFloat(v) || null)}
                  mode="outlined"
                  dense
                  error={!!errors.guaranteed_return_pct}
                  style={{ backgroundColor: theme.colors.surface }}
                />
                {!!errors.guaranteed_return_pct && <HelperText type="error">{errors.guaranteed_return_pct}</HelperText>}
              </View>
            )}
            {sipEligible && form.is_sip && (
              <View>
                <TextInput
                  label={`${cfg.sipMonthlyLabel ?? 'Monthly SIP (₹)'} (optional)`}
                  keyboardType="numeric"
                  value={sipMonthlyAmountText}
                  onChangeText={handleSipMonthlyAmountChange}
                  mode="outlined"
                  dense
                  error={!!errors.sip_monthly_amount}
                  style={{ backgroundColor: theme.colors.surface }}
                />
                {!!errors.sip_monthly_amount && <HelperText type="error">{errors.sip_monthly_amount}</HelperText>}
              </View>
            )}
          </View>
        </Row>
      ) : (
        <DatePickerField
          label={`${cfg.investmentDateLabel ?? 'Investment date'} *`}
          value={form.investment_date}
          onChange={(d) => set('investment_date', d)}
          error={errors.investment_date}
          clearable
        />
      )}

      {/* Maturity date */}
      {cfg.showMaturityDate && (
        <DatePickerField
          label="Maturity date *"
          value={form.maturity_date}
          onChange={(d) => set('maturity_date', d)}
          error={errors.maturity_date}
          clearable
        />
      )}

      {/* SIP section */}
      {sipEligible && (
        <>
          <SectionHeading label="SIP" />
          <Row style={{ alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text variant="bodyMedium">{cfg.sipCheckboxLabel ?? 'This asset has an active SIP'}</Text>
            <Switch value={form.is_sip} onValueChange={(v) => { set('is_sip', v); if (!v) { set('sip_monthly_amount', 0); setSipMonthlyAmountText(''); } }} />
          </Row>
        </>
      )}

      {/* Notes */}
      <SectionHeading label="NOTES" />
      <TextInput
        label="Notes (optional)"
        value={form.notes ?? ''}
        onChangeText={(v) => set('notes', v || null)}
        mode="outlined"
        dense
        multiline
        numberOfLines={2}
        style={{ backgroundColor: theme.colors.surface }}
      />
    </View>
  );

  if (inline) {
    return (
      <Animated.View style={{ opacity: fieldsOpacity, transform: [{ translateY: fieldsTranslateY }] }}>
        {formContent}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <BouncePressable style={{ flex: 1 }} onPress={onDismiss}>
            <Button mode="outlined" style={{ width: '100%', borderRadius: theme.roundness }}>Cancel</Button>
          </BouncePressable>
          <BouncePressable style={{ flex: 1 }} onPress={handleSave}>
            <Button mode="contained" style={{ width: '100%', borderRadius: theme.roundness }}>Save</Button>
          </BouncePressable>
        </View>
      </Animated.View>
    );
  }

  if (!shouldRender) return null;

  return (
    <Modal
      transparent
      visible={visible || shouldRender}
      animationType="none"
      onRequestClose={handleDismiss}
    >
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Animated.View
          style={{
            width: '90%',
            maxHeight: '80%',
            backgroundColor: theme.colors.surface,
            borderRadius: theme.roundness,
            borderWidth: 1,
            borderColor: theme.colors.outline,
            padding: 20,
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
            elevation: 8,
          }}
        >
          <Text variant="titleLarge" style={{ color: theme.colors.onSurface, marginBottom: 12, fontWeight: 'bold' }}>
            {title}
          </Text>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            style={{ marginBottom: 16 }}
            contentContainerStyle={{ paddingRight: 4 }}
          >
            <Animated.View style={{ opacity: fieldsOpacity, transform: [{ translateY: fieldsTranslateY }] }}>
              {formContent}
            </Animated.View>
          </ScrollView>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <BouncePressable onPress={handleDismiss}>
              <Button mode="text" style={{ borderRadius: theme.roundness }}>Cancel</Button>
            </BouncePressable>
            <BouncePressable onPress={handleSave}>
              <Button mode="contained" style={{ borderRadius: theme.roundness }}>Save</Button>
            </BouncePressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default AssetForm;
