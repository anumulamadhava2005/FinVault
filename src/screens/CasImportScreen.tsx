import React, { useState, useMemo, useLayoutEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert, LayoutAnimation, Platform, Pressable } from 'react-native';
import { Button, Card, Dialog, Portal, TextInput, Text, useTheme, Snackbar, Checkbox, IconButton, List, Divider, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Screen, SectionCard, Kpi, Row } from '../components/ui';
import ThemeToggle from '../components/ThemeToggle';
import { extractAndParseCas, importCasData, type ParsedCasData } from '../services/casParserService';
import { formatINR } from '../utils/money';
import { palette } from '../theme';

type Phase = 'upload' | 'password' | 'processing' | 'review' | 'success';

const CasImportScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();

  // Screen phases and loading states
  const [phase, setPhase] = useState<Phase>('upload');
  const [loadingMsg, setLoadingMsg] = useState('');
  const [snackMsg, setSnackMsg] = useState<string | null>(null);

  // File & Password states
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string } | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Parsed Data states
  const [parsedData, setParsedData] = useState<ParsedCasData | null>(null);
  const [selectedMFs, setSelectedMFs] = useState<Set<string>>(new Set());
  const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set());
  const [expandedMF, setExpandedMF] = useState<string | null>(null);

  // Import results
  const [importResult, setImportResult] = useState<{ assets: number; txns: number } | null>(null);

  // Header options
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: 'CAS Statement Import',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
          <ThemeToggle color={theme.colors.onSurface} />
        </View>
      ),
    });
  }, [navigation, theme]);

  // File Picker
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) return;

      const file = result.assets[0];
      setSelectedFile({ uri: file.uri, name: file.name });
      
      // Prompt for password
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPhase('password');
    } catch (err) {
      Alert.alert('Error', 'Failed to select PDF file. Please try again.');
    }
  };

  // Process PDF Decryption & Parsing
  const handleProcessPdf = async (usePassword = true) => {
    if (!selectedFile) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPhase('processing');
    setLoadingMsg('Extracting holdings and transaction history...');

    try {
      // Extract and Parse text content using native decryption directly
      const data = await extractAndParseCas(selectedFile.uri, usePassword ? password : undefined);

      if (data.mutualFunds.length === 0 && data.stocks.length === 0) {
        throw new Error('No supported mutual fund or stock holdings could be detected in this statement. Ensure this is an authentic CAS statement.');
      }

      // Set parsed data and default checklists to true
      setParsedData(data);
      setSelectedMFs(new Set(data.mutualFunds.map(mf => mf.isin)));
      setSelectedStocks(new Set(data.stocks.map(s => s.isin)));

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPhase('review');
    } catch (err: any) {
      console.error('[CasImportScreen] Processing error:', err);
      Alert.alert('Import Failed', err?.message ?? 'An unexpected error occurred while parsing the CAS statement.');
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPhase('password');
    }
  };

  // Toggle MF selection
  const handleToggleMF = (isin: string) => {
    setSelectedMFs((prev) => {
      const next = new Set(prev);
      if (next.has(isin)) {
        next.delete(isin);
      } else {
        next.add(isin);
      }
      return next;
    });
  };

  // Toggle Stock selection
  const handleToggleStock = (isin: string) => {
    setSelectedStocks((prev) => {
      const next = new Set(prev);
      if (next.has(isin)) {
        next.delete(isin);
      } else {
        next.add(isin);
      }
      return next;
    });
  };

  // Perform SQLite Bulk Import
  const handleImport = () => {
    if (!parsedData) return;

    // Filter based on user checklist selections
    const filteredData: ParsedCasData = {
      investorName: parsedData.investorName,
      email: parsedData.email,
      mutualFunds: parsedData.mutualFunds.filter(mf => selectedMFs.has(mf.isin)),
      stocks: parsedData.stocks.filter(s => selectedStocks.has(s.isin)),
    };

    if (filteredData.mutualFunds.length === 0 && filteredData.stocks.length === 0) {
      setSnackMsg('Please select at least one holding to import.');
      return;
    }

    try {
      const results = importCasData('default_user', filteredData); // Mapping to default_user context
      setImportResult({ assets: results.importedAssets, txns: results.importedTransactions });
      
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPhase('success');
    } catch (err: any) {
      Alert.alert('Import Database Error', `Failed to save holdings to database: ${err.message}`);
    }
  };

  // Totals calculations for Preview
  const previewTotals = useMemo(() => {
    if (!parsedData) return { fundsCount: 0, stocksCount: 0, txnsCount: 0 };
    const fundsCount = parsedData.mutualFunds.filter(mf => selectedMFs.has(mf.isin)).length;
    const stocksCount = parsedData.stocks.filter(s => selectedStocks.has(s.isin)).length;
    const txnsCount = parsedData.mutualFunds
      .filter(mf => selectedMFs.has(mf.isin))
      .reduce((sum, mf) => sum + mf.transactions.length, 0);

    return { fundsCount, stocksCount, txnsCount };
  }, [parsedData, selectedMFs, selectedStocks]);

  return (
    <>
      <Screen>
        {/* PHASE 1: UPLOAD CARD */}
        {phase === 'upload' && (
          <View style={styles.centerContainer}>
            <Card
              style={[
                styles.uploadCard,
                {
                  borderColor: theme.colors.outlineVariant,
                  backgroundColor: theme.colors.elevation.level1,
                },
              ]}
            >
              <Card.Content style={styles.uploadContent}>
                <View style={[styles.iconCircle, { backgroundColor: theme.colors.primaryContainer + '20' }]}>
                  <MaterialCommunityIcons name="file-pdf-box" size={44} color={theme.colors.primary} />
                </View>
                <Text variant="headlineSmall" style={{ fontWeight: '800', textAlign: 'center', marginTop: 12 }}>
                  Import CAS Statement
                </Text>
                <Text
                  variant="bodyMedium"
                  style={{
                    color: theme.colors.onSurfaceVariant,
                    textAlign: 'center',
                    marginTop: 8,
                    lineHeight: 20,
                    paddingHorizontal: 16,
                  }}
                >
                  Upload your password-protected Consolidated Account Statement (CAS) PDF. FinVault will extract your mutual funds, stocks, and transaction histories completely offline.
                </Text>

                <Button
                  mode="contained"
                  icon="upload"
                  onPress={handlePickDocument}
                  style={{ marginTop: 24, width: '100%', borderRadius: theme.roundness }}
                  contentStyle={{ height: 48 }}
                >
                  Choose CAS PDF File
                </Button>
              </Card.Content>
            </Card>

            <SectionCard title="Statement Security & Privacy" style={{ marginTop: 20, width: '100%' }}>
              <View style={{ gap: 10 }}>
                <View style={styles.bulletRow}>
                  <MaterialCommunityIcons name="shield-check" size={18} color={palette.good} style={{ marginTop: 1 }} />
                  <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant, lineHeight: 16 }}>
                    <strong>100% Local Decryption</strong>: Your statement password and PDF content never leave your device. All calculations occur locally in temporary memory.
                  </Text>
                </View>
                <View style={styles.bulletRow}>
                  <MaterialCommunityIcons name="database-check" size={18} color={theme.colors.primary} style={{ marginTop: 1 }} />
                  <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant, lineHeight: 16 }}>
                    <strong>Automatic Portfolio Creation</strong>: Auto-detects units, NAVs, ISINs, and creates assets. No manual configuration needed.
                  </Text>
                </View>
                <View style={styles.bulletRow}>
                  <MaterialCommunityIcons name="chart-timeline-variant" size={18} color={palette.warn} style={{ marginTop: 1 }} />
                  <Text variant="bodySmall" style={{ flex: 1, color: theme.colors.onSurfaceVariant, lineHeight: 16 }}>
                    <strong>Populates Per-SIP XIRR</strong>: Scans and imports entire historical transaction streams to unlock instant, individual purchase return CAGR graphs.
                  </Text>
                </View>
              </View>
            </SectionCard>
          </View>
        )}

        {/* PHASE 2: PASSWORD PROMPT */}
        {phase === 'password' && selectedFile && (
          <View style={styles.centerContainer}>
            <Card style={[styles.uploadCard, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.elevation.level1 }]}>
              <Card.Content style={{ paddingVertical: 10 }}>
                <IconButton
                  icon="arrow-left"
                  size={20}
                  onPress={() => setPhase('upload')}
                  style={{ margin: 0, alignSelf: 'flex-start' }}
                />
                
                <View style={[styles.iconCircle, { backgroundColor: palette.warn + '15', alignSelf: 'center', marginTop: 10 }]}>
                  <MaterialCommunityIcons name="lock-open-outline" size={32} color={palette.warn} />
                </View>
                
                <Text variant="titleLarge" style={{ fontWeight: '800', textAlign: 'center', marginTop: 14 }}>
                  Enter Statement Password
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 6, paddingHorizontal: 12 }}>
                  Selected: <strong>{selectedFile.name}</strong>
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8, lineHeight: 16, paddingHorizontal: 16 }}>
                  CAS statements from CAMS or CDSL are encrypted. The password is typically your **PAN in uppercase** or your **email address**.
                </Text>

                <TextInput
                  label="PDF Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  mode="outlined"
                  autoFocus
                  right={
                    <TextInput.Icon
                      icon={showPassword ? 'eye-off' : 'eye'}
                      onPress={() => setShowPassword(!showPassword)}
                    />
                  }
                  style={{ marginTop: 20, backgroundColor: theme.colors.surface }}
                />

                <Button
                  mode="contained"
                  icon="lock-open"
                  onPress={() => handleProcessPdf(true)}
                  style={{ marginTop: 16, borderRadius: theme.roundness }}
                  contentStyle={{ height: 44 }}
                >
                  Decrypt & Parse PDF
                </Button>

                <Button
                  mode="text"
                  onPress={() => handleProcessPdf(false)}
                  style={{ marginTop: 8 }}
                >
                  Statement is not password protected
                </Button>
              </Card.Content>
            </Card>
          </View>
        )}

        {/* PHASE 3: PROCESSING LOADER */}
        {phase === 'processing' && (
          <View style={[styles.centerContainer, { justifyContent: 'center' }]}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text variant="bodyLarge" style={{ fontWeight: '700', marginTop: 20, color: theme.colors.onSurface }}>
              {loadingMsg}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center', paddingHorizontal: 40, lineHeight: 18 }}>
              This takes a few seconds. The statement is being decrypted in memory and native libraries are extracting the text nodes.
            </Text>
          </View>
        )}

        {/* PHASE 4: REVIEW HOLDINGS */}
        {phase === 'review' && parsedData && (
          <View style={{ gap: 12, paddingBottom: 100 }}>
            {/* Investor Summary Card */}
            <Card style={{ backgroundColor: theme.colors.elevation.level1, borderWidth: 1, borderColor: theme.colors.outlineVariant, borderRadius: theme.roundness }}>
              <Card.Content style={{ padding: 16 }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', fontWeight: '700' }}>
                  STATEMENT HOLDER
                </Text>
                <Text variant="titleLarge" style={{ fontWeight: '800', marginTop: 4, color: theme.colors.primary }}>
                  {parsedData.investorName}
                </Text>
                {parsedData.email ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                    Linked Email: {parsedData.email}
                  </Text>
                ) : null}
              </Card.Content>
            </Card>

            {/* Preview KPI scoreboard */}
            <Row gap={8}>
              <Kpi flex label="Mutual Funds Selected" value={String(previewTotals.fundsCount)} />
              <Kpi flex label="Stocks Selected" value={String(previewTotals.stocksCount)} />
              <Kpi flex label="Transactions Found" value={String(previewTotals.txnsCount)} />
            </Row>

            <Divider style={{ marginVertical: 4, backgroundColor: theme.colors.outlineVariant }} />

            {/* A. MUTUAL FUNDS SECTION */}
            {parsedData.mutualFunds.length > 0 && (
              <SectionCard title={`Mutual Funds (${parsedData.mutualFunds.length} detected)`}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                  Expand a fund scheme to review its historical buy transactions that will be imported into your SIP/Lumpsum transaction ledger.
                </Text>
                <View style={{ gap: 10 }}>
                  {parsedData.mutualFunds.map((mf) => {
                    const isSelected = selectedMFs.has(mf.isin);
                    const isExpanded = expandedMF === mf.isin;
                    return (
                      <View
                        key={mf.isin}
                        style={[
                          styles.itemBorderRow,
                          {
                            borderColor: theme.colors.outlineVariant,
                            backgroundColor: theme.colors.surface,
                            borderRadius: theme.roundness,
                          },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
                          <Checkbox.Android
                            status={isSelected ? 'checked' : 'unchecked'}
                            onPress={() => handleToggleMF(mf.isin)}
                          />
                          <Pressable
                            onPress={() => setExpandedMF(isExpanded ? null : mf.isin)}
                            style={{ flex: 1, marginLeft: 6 }}
                          >
                            <Text variant="bodyMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }} numberOfLines={2}>
                              {mf.name}
                            </Text>
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                              Folio: {mf.folio} · ISIN: {mf.isin}
                            </Text>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                              <Text variant="bodySmall" style={{ fontWeight: '800', color: theme.colors.primary }}>
                                {mf.units.toFixed(4)} Units
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                <Text variant="labelSmall" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                                  {mf.transactions.length} txns
                                </Text>
                                <MaterialCommunityIcons
                                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                  size={16}
                                  color={theme.colors.primary}
                                />
                              </View>
                            </View>
                          </Pressable>
                        </View>

                        {/* Expandable transaction table */}
                        {isExpanded && (
                          <View style={[styles.transactionSection, { borderTopColor: theme.colors.outlineVariant, backgroundColor: theme.colors.elevation.level1 }]}>
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', marginBottom: 6 }}>
                              TRANSACTION HISTORY
                            </Text>
                            {mf.transactions.length === 0 ? (
                              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>No transactions parsed.</Text>
                            ) : (
                              <View style={{ gap: 8 }}>
                                {mf.transactions.map((t, idx) => (
                                  <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View style={{ flex: 1 }}>
                                      <Text variant="bodySmall" style={{ fontWeight: '700' }} numberOfLines={1}>
                                        {t.description}
                                      </Text>
                                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                        {t.date} · NAV: ₹{t.nav.toFixed(4)}
                                      </Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                      <Text variant="bodySmall" style={{ fontWeight: '800', color: t.amount >= 0 ? palette.good : palette.danger }}>
                                        {t.amount >= 0 ? '+' : ''}{formatINR(t.amount * 100)}
                                      </Text>
                                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                        {t.units.toFixed(4)} units
                                      </Text>
                                    </View>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </SectionCard>
            )}

            {/* B. STOCKS SECTION */}
            {parsedData.stocks.length > 0 && (
              <SectionCard title={`Stock Holdings (${parsedData.stocks.length} detected)`}>
                <View style={{ gap: 10 }}>
                  {parsedData.stocks.map((stock) => {
                    const isSelected = selectedStocks.has(stock.isin);
                    return (
                      <View
                        key={stock.isin}
                        style={[
                          styles.itemBorderRow,
                          {
                            borderColor: theme.colors.outlineVariant,
                            backgroundColor: theme.colors.surface,
                            borderRadius: theme.roundness,
                          },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
                          <Checkbox.Android
                            status={isSelected ? 'checked' : 'unchecked'}
                            onPress={() => handleToggleStock(stock.isin)}
                          />
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text variant="bodyMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                              {stock.name}
                            </Text>
                            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 1 }}>
                              ISIN: {stock.isin}
                            </Text>
                          </View>
                          <Text variant="bodyMedium" style={{ fontWeight: '800', color: theme.colors.primary, marginRight: 4 }}>
                            {stock.units} Shares
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </SectionCard>
            )}

            {/* Floating Import Actions */}
            <Card style={[styles.stickyFooter, { backgroundColor: theme.colors.elevation.level2, borderTopColor: theme.colors.outlineVariant }]}>
              <Card.Content style={styles.footerContent}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall" style={{ fontWeight: '800' }}>
                    Ready to Import
                  </Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {previewTotals.fundsCount + previewTotals.stocksCount} assets · {previewTotals.txnsCount} transactions
                  </Text>
                </View>
                <Button
                  mode="contained"
                  icon="database-import"
                  onPress={handleImport}
                  style={{ borderRadius: theme.roundness }}
                >
                  Confirm & Import
                </Button>
              </Card.Content>
            </Card>
          </View>
        )}

        {/* PHASE 5: SUCCESS CARD */}
        {phase === 'success' && importResult && (
          <View style={styles.centerContainer}>
            <Card style={[styles.uploadCard, { borderColor: palette.good + '40', backgroundColor: theme.colors.elevation.level1 }]}>
              <Card.Content style={styles.successContent}>
                <View style={[styles.iconCircle, { backgroundColor: palette.good + '15' }]}>
                  <MaterialCommunityIcons name="check-all" size={44} color={palette.good} />
                </View>
                <Text variant="headlineSmall" style={{ fontWeight: '900', textAlign: 'center', marginTop: 16, color: palette.good }}>
                  Import Successful
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 10, lineHeight: 20, paddingHorizontal: 12 }}>
                  Your Consolidated Account Statement has been parsed and integrated successfully.
                </Text>

                <View style={styles.resultsBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text variant="bodyMedium" style={{ fontWeight: '600' }}>New Assets Imported/Updated:</Text>
                    <Text variant="bodyMedium" style={{ fontWeight: '800', color: theme.colors.primary }}>{importResult.assets}</Text>
                  </View>
                  <Divider style={{ marginVertical: 6 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text variant="bodyMedium" style={{ fontWeight: '600' }}>Transactions Imported:</Text>
                    <Text variant="bodyMedium" style={{ fontWeight: '800', color: theme.colors.primary }}>{importResult.txns}</Text>
                  </View>
                </View>

                <Button
                  mode="contained"
                  icon="chart-donut"
                  onPress={() => {
                    router.replace('/assets');
                  }}
                  style={{ marginTop: 24, width: '100%', borderRadius: theme.roundness }}
                  contentStyle={{ height: 44 }}
                >
                  View My Assets Dashboard
                </Button>
              </Card.Content>
            </Card>
          </View>
        )}
      </Screen>

      <Snackbar visible={snackMsg !== null} onDismiss={() => setSnackMsg(null)} duration={3000}>
        {snackMsg}
      </Snackbar>
    </>
  );
};

const styles = StyleSheet.create({
  centerContainer: {
    flex: 1,
    paddingTop: 40,
    alignItems: 'center',
    gap: 16,
  },
  uploadCard: {
    width: '100%',
    borderWidth: 1,
    elevation: 0,
    borderRadius: 16,
    overflow: 'hidden',
  },
  uploadContent: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  itemBorderRow: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  transactionSection: {
    borderTopWidth: 1,
    padding: 12,
    gap: 8,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    elevation: 4,
    borderTopWidth: 1,
    borderRadius: 0,
  },
  footerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  successContent: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  resultsBox: {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
  },
});

export default CasImportScreen;
