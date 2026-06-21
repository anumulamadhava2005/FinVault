import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  Button,
  Dialog,
  HelperText,
  Menu,
  Portal,
  Text,
  useTheme,
} from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

import { newId, tx } from '../../db';
import type { AssetType } from '../../models/types';
import { rupeesToPaise } from '../../utils/money';
import { isValidISODate, nowISO } from '../../utils/date';

const ASSET_FIELDS = [
  { key: '_skip', label: '— Skip column —' },
  { key: 'name', label: 'Asset Name *' },
  { key: 'asset_type', label: 'Asset Type (slug) *' },
  { key: 'invested_amount', label: 'Invested Amount (₹) *' },
  { key: 'current_value', label: 'Current Value (₹)' },
  { key: 'quantity', label: 'Quantity / Units' },
  { key: 'investment_date', label: 'Investment Date (YYYY-MM-DD)' },
  { key: 'maturity_date', label: 'Maturity Date (YYYY-MM-DD)' },
  { key: 'isin', label: 'ISIN' },
  { key: 'ticker', label: 'Ticker Symbol' },
  { key: 'current_nav', label: 'Current NAV (₹)' },
  { key: 'price_per_unit', label: 'Price per Unit (₹)' },
  { key: 'guaranteed_return_pct', label: 'Guaranteed Return %' },
  { key: 'notes', label: 'Notes' },
];

const ALIASES: Record<string, string> = {
  asset_name: 'name',
  fund_name: 'name',
  scheme_name: 'name',
  type: 'asset_type',
  category: 'asset_type',
  asset_type_slug: 'asset_type',
  invested: 'invested_amount',
  amount: 'invested_amount',
  investment_amount: 'invested_amount',
  buy_value: 'invested_amount',
  current: 'current_value',
  value: 'current_value',
  market_value: 'current_value',
  units: 'quantity',
  shares: 'quantity',
  lots: 'quantity',
  date: 'investment_date',
  buy_date: 'investment_date',
  purchase_date: 'investment_date',
  maturity: 'maturity_date',
  nav: 'current_nav',
  price: 'price_per_unit',
  unit_price: 'price_per_unit',
  return: 'guaranteed_return_pct',
  return_pct: 'guaranteed_return_pct',
  interest_rate: 'guaranteed_return_pct',
  rate: 'guaranteed_return_pct',
  description: 'notes',
  remarks: 'notes',
  comment: 'notes',
  comments: 'notes',
};

function autoMapHeader(header: string): string {
  const n = header.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (ASSET_FIELDS.find((f) => f.key === n && f.key !== '_skip')) return n;
  return ALIASES[n] ?? '_skip';
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  return { headers: parseRow(lines[0]), rows: lines.slice(1).map(parseRow) };
}

interface BulkImportModalProps {
  visible: boolean;
  userId: string;
  assetTypes: AssetType[];
  onDismiss: () => void;
  onImported: (count: number) => void;
}

const BulkImportModal: React.FC<BulkImportModalProps> = ({
  visible,
  userId,
  assetTypes,
  onDismiss,
  onImported,
}) => {
  const theme = useTheme();
  const [step, setStep] = useState<'pick' | 'map' | 'result'>('pick');
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [openMenuIdx, setOpenMenuIdx] = useState<number | null>(null);
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);

  const reset = () => {
    setStep('pick');
    setLoading(false);
    setParseError(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setOpenMenuIdx(null);
    setResult(null);
  };

  const handleDismiss = () => {
    reset();
    onDismiss();
  };

  const pickFile = async () => {
    setLoading(true);
    setParseError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'text/comma-separated-values', 'application/csv', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled) { setLoading(false); return; }

      const uri = res.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(uri);
      const { headers: h, rows: r } = parseCSV(content);

      if (!h.length) {
        setParseError('No columns detected. Make sure the file has a header row.');
        setLoading(false);
        return;
      }
      if (!r.length) {
        setParseError('No data rows found. The CSV has a header but no data.');
        setLoading(false);
        return;
      }

      const autoMapped: Record<number, string> = {};
      h.forEach((hdr, i) => { autoMapped[i] = autoMapHeader(hdr); });
      setHeaders(h);
      setRows(r);
      setMapping(autoMapped);
      setStep('map');
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to read file');
    }
    setLoading(false);
  };

  const canImport = (): boolean => {
    const mapped = Object.values(mapping);
    return mapped.includes('name') && mapped.includes('asset_type') && mapped.includes('invested_amount');
  };

  const doImport = () => {
    let imported = 0;
    let failed = 0;
    const createdAt = nowISO();

    tx((db) => {
      for (const row of rows) {
        try {
          const record: Record<string, string> = {};
          Object.entries(mapping).forEach(([colIdx, fieldKey]) => {
            if (fieldKey !== '_skip') {
              record[fieldKey] = row[parseInt(colIdx, 10)]?.trim() ?? '';
            }
          });

          if (!record.name?.trim()) { failed++; continue; }

          const typeInput = (record.asset_type ?? '').toLowerCase().trim();
          const assetType = assetTypes.find(
            (t) =>
              t.slug === typeInput ||
              t.name.toLowerCase() === typeInput ||
              t.slug.replace(/_/g, '') === typeInput.replace(/[_\s]/g, ''),
          );
          if (!assetType) { failed++; continue; }

          const investedPaise = rupeesToPaise(record.invested_amount || '0');
          if (!investedPaise || investedPaise <= 0) { failed++; continue; }

          const currentPaise = rupeesToPaise(record.current_value || '0') || investedPaise;
          const investDate = isValidISODate(record.investment_date ?? '') ? record.investment_date : null;
          const matDate = isValidISODate(record.maturity_date ?? '') ? record.maturity_date : null;

          db.runSync(
            `INSERT INTO assets
               (id, user_id, asset_type_id, name, invested_amount, current_value, quantity,
                investment_date, purchase_date, maturity_date, isin, ticker,
                current_nav, price_per_unit, guaranteed_return_pct, notes,
                details_json, is_sip, sip_monthly_amount, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              newId(), userId, assetType.id, record.name.trim(),
              investedPaise, currentPaise,
              parseFloat(record.quantity || '0') || 0,
              investDate ?? null, investDate ?? null, matDate ?? null,
              record.isin || null, record.ticker || null,
              parseFloat(record.current_nav || '0') || null,
              parseFloat(record.price_per_unit || '0') || null,
              parseFloat(record.guaranteed_return_pct || '0') || null,
              record.notes || null,
              null, 0, 0, createdAt,
            ],
          );
          imported++;
        } catch {
          failed++;
        }
      }
    });

    setResult({ imported, failed });
    setStep('result');
    if (imported > 0) onImported(imported);
  };

  const previewRows = rows.slice(0, 2);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss} style={{ maxHeight: '92%' }}>
        <Dialog.Title>
          {step === 'pick' ? 'Import Assets from CSV' : step === 'map' ? `Map Columns · ${rows.length} rows` : 'Import Complete'}
        </Dialog.Title>

        {step === 'pick' && (
          <>
            <Dialog.Content>
              <Text variant="bodyMedium" style={{ marginBottom: 10 }}>
                Pick a CSV file from your device. The first row must be column headers.
                Columns are matched to asset fields automatically — review the mapping before importing.
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                Required columns:{' '}
                <Text style={{ fontWeight: '700' }}>name</Text>,{' '}
                <Text style={{ fontWeight: '700' }}>asset_type</Text>,{' '}
                <Text style={{ fontWeight: '700' }}>invested_amount</Text>
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                asset_type must match one of: {assetTypes.map((t) => t.slug).join(', ')}
              </Text>
              {parseError ? (
                <HelperText type="error" style={{ marginTop: 6 }}>{parseError}</HelperText>
              ) : null}
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={handleDismiss}>Cancel</Button>
              <Button
                mode="contained"
                loading={loading}
                disabled={loading}
                onPress={pickFile}
                icon="file-delimited"
              >
                Pick CSV File
              </Button>
            </Dialog.Actions>
          </>
        )}

        {step === 'map' && (
          <>
            <Dialog.ScrollArea style={{ maxHeight: 440 }}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={{ paddingVertical: 8, gap: 8 }}>
                  <Text variant="labelMedium" style={{ marginBottom: 2 }}>
                    Map each CSV column to an asset field:
                  </Text>

                  {headers.map((hdr, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text
                        variant="bodySmall"
                        numberOfLines={1}
                        style={{ flex: 1, color: theme.colors.onSurfaceVariant }}
                      >
                        {hdr}
                      </Text>
                      <Menu
                        visible={openMenuIdx === i}
                        onDismiss={() => setOpenMenuIdx(null)}
                        anchor={
                          <Button
                            compact
                            mode="outlined"
                            onPress={() => setOpenMenuIdx(i)}
                            style={{ flex: 1.5 }}
                            contentStyle={{ paddingHorizontal: 2 }}
                            labelStyle={{ fontSize: 11 }}
                          >
                            {(ASSET_FIELDS.find((f) => f.key === mapping[i])?.label ?? '— Skip —').replace(' *', '')}
                          </Button>
                        }
                      >
                        {ASSET_FIELDS.map((f) => (
                          <Menu.Item
                            key={f.key}
                            title={f.label}
                            onPress={() => {
                              setMapping((m) => ({ ...m, [i]: f.key }));
                              setOpenMenuIdx(null);
                            }}
                          />
                        ))}
                      </Menu>
                    </View>
                  ))}

                  {previewRows.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                      <Text variant="labelMedium" style={{ marginBottom: 4 }}>
                        Preview (first {previewRows.length} rows):
                      </Text>
                      {previewRows.map((row, ri) => (
                        <Text
                          key={ri}
                          variant="bodySmall"
                          numberOfLines={1}
                          style={{ color: theme.colors.onSurfaceVariant }}
                        >
                          {row.join(' | ')}
                        </Text>
                      ))}
                    </View>
                  )}

                  {!canImport() && (
                    <HelperText type="error" style={{ marginTop: 4 }}>
                      Map name, asset_type, and invested_amount columns to continue.
                    </HelperText>
                  )}
                </View>
              </ScrollView>
            </Dialog.ScrollArea>
            <Dialog.Actions>
              <Button onPress={() => setStep('pick')}>Back</Button>
              <Button
                mode="contained"
                disabled={!canImport()}
                onPress={doImport}
                icon="upload"
              >
                Import {rows.length} rows
              </Button>
            </Dialog.Actions>
          </>
        )}

        {step === 'result' && result && (
          <>
            <Dialog.Content>
              <Text variant="titleMedium" style={{ fontWeight: '700', marginBottom: 8 }}>
                {result.imported} asset{result.imported !== 1 ? 's' : ''} imported
              </Text>
              {result.failed > 0 && (
                <Text variant="bodyMedium" style={{ color: theme.colors.error }}>
                  {result.failed} row{result.failed !== 1 ? 's' : ''} skipped — missing required field or unrecognised asset_type.
                </Text>
              )}
              {result.imported === 0 && result.failed === 0 && (
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  No rows were processed.
                </Text>
              )}
            </Dialog.Content>
            <Dialog.Actions>
              <Button mode="contained" onPress={handleDismiss}>Done</Button>
            </Dialog.Actions>
          </>
        )}
      </Dialog>
    </Portal>
  );
};

export default BulkImportModal;
