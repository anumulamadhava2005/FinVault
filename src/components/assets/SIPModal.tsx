import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Dialog, Portal, Switch, Text, TextInput, useTheme } from 'react-native-paper';
import type { SIPConfigValues } from '../../hooks/assets/useSIPConfig';
import type { SIPSchedule } from '../../models/types';
import { rupeesToPaise, paiseToRupees } from '../../utils/money';
import DatePickerField from './DatePickerField';
import BouncePressable from '../BouncePressable';

const FREQUENCIES = ['monthly', 'quarterly', 'half-yearly', 'yearly'] as const;

interface SIPModalProps {
  visible: boolean;
  sip: SIPSchedule | null;
  onSave: (values: SIPConfigValues) => void;
  onDismiss: () => void;
}

const SIPModal: React.FC<SIPModalProps> = ({ visible, sip, onSave, onDismiss }) => {
  const theme = useTheme();
  const [amountStr, setAmountStr] = useState('');
  const [frequency, setFrequency] = useState<string>('monthly');
  const [dayStr, setDayStr] = useState('1');
  const [stepUpStr, setStepUpStr] = useState('0');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [linkedBank, setLinkedBank] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (sip) {
      setAmountStr(String(paiseToRupees(sip.amount)));
      setFrequency(sip.frequency || 'monthly');
      setDayStr(String(sip.day_of_month ?? 1));
      setStepUpStr(String(sip.annual_step_up_pct ?? 0));
      setStartDate(sip.start_date ?? null);
      setEndDate(sip.end_date ?? null);
      setLinkedBank(sip.linked_bank ?? '');
      setIsActive(sip.status === 'active');
    } else {
      setAmountStr('');
      setFrequency('monthly');
      setDayStr('1');
      setStepUpStr('0');
      setStartDate(null);
      setEndDate(null);
      setLinkedBank('');
      setIsActive(true);
    }
  }, [sip, visible]);

  const handleSave = () => {
    const amount = rupeesToPaise(parseFloat(amountStr) || 0);
    if (!amount) return;
    onSave({
      amount,
      frequency,
      day_of_month: parseInt(dayStr, 10) || 1,
      annual_step_up_pct: parseFloat(stepUpStr) || 0,
      start_date: startDate,
      end_date: endDate,
      linked_bank: linkedBank || null,
      status: isActive ? 'active' : 'paused',
    });
    onDismiss();
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ borderRadius: theme.roundness }}>
        <Dialog.Title style={{ fontWeight: '700', color: theme.colors.onSurface, fontSize: 18 }}>
          SIP Configuration
        </Dialog.Title>
        <Dialog.ScrollArea style={{ maxHeight: 440, paddingHorizontal: 16 }}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ paddingTop: 12, paddingBottom: 24, gap: 16 }}>
              <TextInput
                label="Monthly Amount (₹)"
                value={amountStr}
                onChangeText={setAmountStr}
                keyboardType="numeric"
                mode="outlined"
                dense
                style={{ backgroundColor: theme.colors.surface }}
              />

              <View style={{ gap: 6 }}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Frequency</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {FREQUENCIES.map((f) => {
                    const active = frequency === f;
                    return (
                      <BouncePressable
                        key={f}
                        onPress={() => setFrequency(f)}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: theme.roundness,
                          backgroundColor: active ? theme.colors.primary : theme.colors.surface,
                          borderWidth: 1,
                          borderColor: active ? theme.colors.primary : theme.colors.outline,
                        }}
                      >
                        <Text
                          variant="labelMedium"
                          style={{
                            color: active ? theme.colors.onPrimary : theme.colors.onSurfaceVariant,
                            fontWeight: '600',
                            textTransform: 'capitalize',
                            fontSize: 12,
                          }}
                        >
                          {f.replace('-', ' ')}
                        </Text>
                      </BouncePressable>
                    );
                  })}
                </View>
              </View>

              <TextInput
                label="Day of Month (1–28)"
                value={dayStr}
                onChangeText={setDayStr}
                keyboardType="numeric"
                mode="outlined"
                dense
                style={{ backgroundColor: theme.colors.surface }}
              />

              <TextInput
                label="Annual Step-Up %"
                value={stepUpStr}
                onChangeText={setStepUpStr}
                keyboardType="numeric"
                mode="outlined"
                dense
                style={{ backgroundColor: theme.colors.surface }}
              />

              <DatePickerField
                label="Start Date"
                value={startDate}
                onChange={setStartDate}
                clearable
              />

              <DatePickerField
                label="End Date (optional)"
                value={endDate}
                onChange={setEndDate}
                clearable
              />

              <TextInput
                label="Linked Bank (optional)"
                value={linkedBank}
                onChangeText={setLinkedBank}
                mode="outlined"
                dense
                style={{ backgroundColor: theme.colors.surface }}
              />

              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: 4,
                paddingHorizontal: 2,
              }}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: '500' }}>Active Status</Text>
                <Switch value={isActive} onValueChange={setIsActive} />
              </View>
            </View>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
          <BouncePressable
            onPress={onDismiss}
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
            onPress={handleSave}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 20,
              borderRadius: theme.roundness,
              backgroundColor: theme.colors.primary,
            }}
          >
            <Text variant="labelMedium" style={{ fontWeight: '600', color: theme.colors.onPrimary, fontSize: 13 }}>
              Save
            </Text>
          </BouncePressable>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

export default SIPModal;
