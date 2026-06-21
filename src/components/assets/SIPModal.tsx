import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button, Dialog, Portal, Switch, Text, TextInput } from 'react-native-paper';
import type { SIPConfigValues } from '../../hooks/assets/useSIPConfig';
import type { SIPSchedule } from '../../models/types';
import { rupeesToPaise, paiseToRupees } from '../../utils/money';
import DatePickerField from './DatePickerField';

const FREQUENCIES = ['monthly', 'quarterly', 'half-yearly', 'yearly'] as const;

interface SIPModalProps {
  visible: boolean;
  sip: SIPSchedule | null;
  onSave: (values: SIPConfigValues) => void;
  onDismiss: () => void;
}

const SIPModal: React.FC<SIPModalProps> = ({ visible, sip, onSave, onDismiss }) => {
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
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>SIP Configuration</Dialog.Title>
        <Dialog.ScrollArea style={{ maxHeight: 500 }}>
          <ScrollView keyboardShouldPersistTaps="handled">
          <View style={{ paddingTop: 8, paddingBottom: 24, gap: 12 }}>
            <TextInput
              label="Monthly Amount (₹)"
              value={amountStr}
              onChangeText={setAmountStr}
              keyboardType="numeric"
              mode="outlined"
              dense
            />
            <Text variant="labelMedium">Frequency</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {FREQUENCIES.map((f) => (
                <Button
                  key={f}
                  mode={frequency === f ? 'contained' : 'outlined'}
                  compact
                  onPress={() => setFrequency(f)}
                >
                  {f}
                </Button>
              ))}
            </View>
            <TextInput
              label="Day of Month (1–28)"
              value={dayStr}
              onChangeText={setDayStr}
              keyboardType="numeric"
              mode="outlined"
              dense
            />
            <TextInput
              label="Annual Step-Up %"
              value={stepUpStr}
              onChangeText={setStepUpStr}
              keyboardType="numeric"
              mode="outlined"
              dense
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
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="bodyMedium">Active</Text>
              <Switch value={isActive} onValueChange={setIsActive} />
            </View>
          </View>
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button mode="contained" onPress={handleSave}>Save</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

export default SIPModal;
