/**
 * Scan-a-bill expense flow used from the Dashboard "Log Expense" button.
 *
 * Opens the camera, runs on-device OCR (ML Kit) on the captured receipt,
 * parses out the total / date / merchant / line-items, and shows an intuitive,
 * fully-editable review card before saving the expense (with the bill attached).
 *
 * OCR module: @dariyd/react-native-text-recognition (on-device, no API key).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Divider, Menu, Text, TextInput, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import TextRecognition from '@dariyd/react-native-text-recognition';

import { useApp } from '../context/AppContext';
import { all, insert, newId } from '../db';
import type { ExpenseCategory } from '../models/types';
import { copyToPersistentStorage } from '../services/attachments';
import { parseBill, type BillLineItem } from '../utils/billParser';
import { formatDisplayDate, localISODate, todayISO } from '../utils/date';
import { formatINR, rupeesToPaise } from '../utils/money';

type Phase = 'capturing' | 'processing' | 'review';

// Merchant/keyword → category-name hints for a smart default category.
const CATEGORY_HINTS: [RegExp, string][] = [
  [/swiggy|zomato|restaurant|cafe|hotel|food|dine|pizza|burger|kitchen|bakery|dhaba|grocery|bigbasket|blinkit|zepto/i, 'Food'],
  [/uber|ola|fuel|petrol|diesel|metro|cab|taxi|transport|parking|toll|rapido/i, 'Transport'],
  [/electric|water|\bgas\b|broadband|wifi|recharge|mobile|dth|utility|airtel|jio|vodafone/i, 'Utilities'],
  [/amazon|flipkart|myntra|mall|store|mart|shopping|fashion|apparel|nykaa|reliance/i, 'Shopping'],
  [/pharma|medical|hospital|clinic|apollo|health|chemist|diagnostic|lab/i, 'Health'],
  [/movie|cinema|pvr|inox|netflix|spotify|game|entertain/i, 'Entertainment'],
  [/\brent\b|lease/i, 'Rent'],
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const BillScanModal: React.FC<Props> = ({ visible, onClose, onSaved }) => {
  const theme = useTheme();
  const { userId, refresh } = useApp();

  const [phase, setPhase] = useState<Phase>('capturing');
  const [billUri, setBillUri] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<string>(todayISO());
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [lineItems, setLineItems] = useState<BillLineItem[]>([]);
  const [rawText, setRawText] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [catMenu, setCatMenu] = useState(false);

  const startedRef = useRef(false);

  const categories: ExpenseCategory[] = useMemo(() => {
    if (!userId) return [];
    const rows = all<ExpenseCategory>(
      'SELECT * FROM expense_categories WHERE user_id = ? OR (is_system = 1 AND user_id IS NULL) ORDER BY sort_order',
      [userId],
    );
    const seen = new Set<string>();
    return rows.filter((c) => {
      const k = c.name.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [userId, visible]);

  const guessCategory = (text: string): string => {
    for (const [re, name] of CATEGORY_HINTS) {
      if (re.test(text)) {
        const match = categories.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
        if (match) return match.id;
      }
    }
    return categories[0]?.id ?? '';
  };

  const resetState = () => {
    setPhase('capturing');
    setBillUri(null);
    setAmount('');
    setDate(todayISO());
    setDescription('');
    setCategoryId('');
    setLineItems([]);
    setRawText('');
    setShowRaw(false);
  };

  const runScan = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission required', 'Camera access is needed to scan a bill.');
      onClose();
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets?.length) {
      onClose();
      return;
    }

    const captured = result.assets[0];
    setPhase('processing');

    // Persist the bill image for the expense attachment.
    const persistentUri = await copyToPersistentStorage(captured.uri, captured.fileName || 'bill.jpg');
    setBillUri(persistentUri);

    // Run OCR on the captured image. @dariyd/react-native-text-recognition
    // returns an array of recognized text blocks/lines, which we join into one
    // string for the field parser. ML Kit (Android) / Vision (iOS) want a plain
    // file path, so strip the file:// scheme.
    let text = '';
    try {
      const path = captured.uri.replace(/^file:\/\//, '');
      const result = await TextRecognition.recognizeText(path);
      text = result.fullText
        ?? result.pages?.map((p) => p.fullText).join('\n')
        ?? '';
    } catch (err) {
      console.warn('OCR failed:', err);
      Alert.alert(
        'Could not read the bill',
        'Text recognition failed — you can still enter the details manually.',
      );
    }

    const parsed = parseBill(text);
    setRawText(parsed.rawText);
    setAmount(parsed.amountText);
    setDate(parsed.date ?? todayISO());
    setDescription(parsed.merchant ?? '');
    setLineItems(parsed.lineItems);
    setCategoryId(guessCategory(`${parsed.merchant ?? ''}\n${parsed.rawText}`));
    setPhase('review');
  };

  // Launch the camera once when the modal opens; reset when it closes.
  useEffect(() => {
    if (visible && !startedRef.current) {
      startedRef.current = true;
      resetState();
      runScan();
    } else if (!visible) {
      startedRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleSave = () => {
    const paise = rupeesToPaise(amount || '0');
    const catId = categoryId || categories[0]?.id;
    if (paise <= 0) {
      Alert.alert('Amount required', 'Enter the bill amount before saving.');
      return;
    }
    if (!catId) {
      Alert.alert('Category required', 'Select a category before saving.');
      return;
    }
    insert('expenses', {
      id: newId(),
      user_id: userId!,
      category_id: catId,
      amount: paise,
      description: description.trim() || 'Scanned bill',
      expense_date: date,
      spent_by_id: null,
      notes: null,
      bill_uri: billUri,
    });
    refresh();
    onSaved?.();
    onClose();
  };

  const selectedCat = categories.find((c) => c.id === categoryId);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.outlineVariant }]}>
          <Pressable onPress={onClose} hitSlop={10} style={{ padding: 4 }}>
            <MaterialCommunityIcons name="close" size={24} color={theme.colors.onSurface} />
          </Pressable>
          <Text variant="titleMedium" style={{ fontWeight: '700' }}>Scan Bill</Text>
          <View style={{ width: 32 }} />
        </View>

        {phase !== 'review' ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text variant="bodyMedium" style={{ marginTop: 16, color: theme.colors.onSurfaceVariant }}>
              {phase === 'capturing' ? 'Opening camera…' : 'Reading your bill…'}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {/* Bill preview */}
            {billUri && (
              <View style={styles.previewWrap}>
                <Image source={{ uri: billUri }} style={styles.preview} contentFit="cover" />
                <Pressable
                  style={[styles.retake, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}
                  onPress={runScan}
                >
                  <MaterialCommunityIcons name="camera-retake" size={16} color={theme.colors.primary} />
                  <Text variant="labelSmall" style={{ color: theme.colors.primary, fontWeight: '700' }}>Retake</Text>
                </Pressable>
              </View>
            )}

            {/* Detected total — hero field */}
            <View style={[styles.amountCard, { backgroundColor: theme.colors.primaryContainer + '22', borderColor: theme.colors.primary }]}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', letterSpacing: 0.5 }}>
                DETECTED TOTAL
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Text variant="headlineMedium" style={{ fontWeight: '800', color: theme.colors.primary }}>₹</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="numeric"
                  mode="flat"
                  underlineColor="transparent"
                  activeUnderlineColor="transparent"
                  style={{ flex: 1, backgroundColor: 'transparent', fontSize: 28, fontWeight: '800', height: 48 }}
                  placeholder="0"
                />
              </View>
            </View>

            {/* Merchant / description */}
            <TextInput
              label="Description / Merchant"
              value={description}
              onChangeText={setDescription}
              mode="outlined"
              dense
              style={{ marginTop: 14, backgroundColor: theme.colors.surface }}
              left={<TextInput.Icon icon="store-outline" />}
            />

            {/* Date */}
            <Pressable onPress={() => setDatePickerOpen(true)}>
              <View pointerEvents="none">
                <TextInput
                  label="Date"
                  value={formatDisplayDate(date)}
                  mode="outlined"
                  dense
                  editable={false}
                  style={{ marginTop: 12, backgroundColor: theme.colors.surface }}
                  left={<TextInput.Icon icon="calendar" />}
                />
              </View>
            </Pressable>
            {datePickerOpen && (
              <DateTimePicker
                value={date ? new Date(date + 'T00:00:00') : new Date()}
                mode="date"
                onChange={(_e, d) => {
                  if (Platform.OS !== 'ios') setDatePickerOpen(false);
                  if (d) setDate(localISODate(d));
                }}
              />
            )}

            {/* Category */}
            <View style={{ marginTop: 12 }}>
              <Menu
                visible={catMenu}
                onDismiss={() => setCatMenu(false)}
                anchor={
                  <Pressable onPress={() => setCatMenu(true)}>
                    <View pointerEvents="none">
                      <TextInput
                        label="Category"
                        value={selectedCat?.name ?? 'Select category'}
                        mode="outlined"
                        dense
                        editable={false}
                        style={{ backgroundColor: theme.colors.surface }}
                        left={<TextInput.Icon icon="shape-outline" />}
                        right={<TextInput.Icon icon="chevron-down" />}
                      />
                    </View>
                  </Pressable>
                }
              >
                {categories.map((c) => (
                  <Menu.Item key={c.id} title={c.name} onPress={() => { setCategoryId(c.id); setCatMenu(false); }} />
                ))}
              </Menu>
            </View>

            {/* Detected line items */}
            {lineItems.length > 0 && (
              <View style={[styles.itemsCard, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface }]}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>
                  DETECTED ITEMS ({lineItems.length})
                </Text>
                {lineItems.map((it, i) => (
                  <View key={i} style={styles.itemRow}>
                    <Text variant="bodySmall" numberOfLines={1} style={{ flex: 1, color: theme.colors.onSurface }}>
                      {it.name}
                    </Text>
                    <Text variant="bodySmall" style={{ fontWeight: '700', color: theme.colors.onSurface, fontVariant: ['tabular-nums'] }}>
                      {formatINR(Math.round(it.price * 100))}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Raw OCR text (collapsible) */}
            {rawText ? (
              <View style={{ marginTop: 14 }}>
                <Button
                  compact
                  mode="text"
                  icon={showRaw ? 'chevron-up' : 'chevron-down'}
                  onPress={() => setShowRaw((s) => !s)}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {showRaw ? 'Hide scanned text' : 'View scanned text'}
                </Button>
                {showRaw && (
                  <View style={{ backgroundColor: theme.colors.surfaceVariant, borderRadius: theme.roundness, padding: 12, marginTop: 4 }}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                      {rawText}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}

            <Divider style={{ marginVertical: 18 }} />

            <Button mode="contained" icon="content-save" onPress={handleSave} style={{ borderRadius: theme.roundness }}>
              Save Expense
            </Button>
            <Button mode="text" onPress={onClose} style={{ marginTop: 8 }}>
              Cancel
            </Button>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  previewWrap: { borderRadius: 14, overflow: 'hidden', position: 'relative' },
  preview: { width: '100%', height: 180, borderRadius: 14 },
  retake: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  amountCard: { marginTop: 16, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  itemsCard: { marginTop: 14, borderWidth: 1, borderRadius: 12, padding: 12 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 4 },
});

export default BillScanModal;
