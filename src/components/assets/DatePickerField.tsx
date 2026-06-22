import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button, HelperText, TextInput, useTheme } from 'react-native-paper';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { formatDisplayDate, parseISO } from '../../utils/date';

interface DatePickerFieldProps {
  label: string;
  value: string | null;
  onChange: (date: string | null) => void;
  error?: string | null;
  dense?: boolean;
  clearable?: boolean;
}

const DatePickerField: React.FC<DatePickerFieldProps> = ({
  label,
  value,
  onChange,
  error,
  dense = true,
  clearable = false,
}) => {
  const theme = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  const [iosPending, setIosPending] = useState<Date | null>(null);

  const resolvedDate = parseISO(value) ?? new Date();

  const handleAndroidChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShowPicker(false);
    if (event.type === 'set' && selected) {
      onChange(selected.toISOString().slice(0, 10));
    }
  };

  const handleIosChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (selected) setIosPending(selected);
  };

  const confirmIos = () => {
    const picked = iosPending ?? resolvedDate;
    onChange(picked.toISOString().slice(0, 10));
    setShowPicker(false);
    setIosPending(null);
  };

  const cancelIos = () => {
    setShowPicker(false);
    setIosPending(null);
  };

  return (
    <View>
      <Pressable onPress={() => setShowPicker(true)}>
        <TextInput
          label={label}
          value={value ? formatDisplayDate(value) : ''}
          editable={false}
          pointerEvents="none"
          right={
            clearable && value ? (
              <TextInput.Icon
                icon="close-circle"
                onPress={() => onChange(null)}
              />
            ) : (
              <TextInput.Icon icon="calendar" onPress={() => setShowPicker(true)} />
            )
          }
          error={!!error}
          mode="outlined"
          dense={dense}
        />
      </Pressable>

      {!!error && <HelperText type="error">{error}</HelperText>}

      {/* Android: native calendar dialog */}
      {showPicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={resolvedDate}
          mode="date"
          display="default"
          onChange={handleAndroidChange}
        />
      )}

      {/* iOS: spinner inside a bottom modal */}
      <Modal
        visible={showPicker && Platform.OS === 'ios'}
        transparent
        animationType="slide"
        onRequestClose={cancelIos}
      >
        <View style={styles.iosOverlay}>
          <View style={[styles.iosSheet, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outline, borderTopWidth: 1 }]}>
            <View style={styles.iosActions}>
              <Button onPress={cancelIos}>Cancel</Button>
              <Button mode="contained" onPress={confirmIos}>Done</Button>
            </View>
            <DateTimePicker
              value={iosPending ?? resolvedDate}
              mode="date"
              display="spinner"
              onChange={handleIosChange}
              textColor={theme.colors.onSurface}
              style={[styles.iosPicker, { backgroundColor: theme.colors.surface }]}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  iosOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  iosSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 32,
  },
  iosActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  iosPicker: {
    height: 220,
  },
});

export default DatePickerField;
