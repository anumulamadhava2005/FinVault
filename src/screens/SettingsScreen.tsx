import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, Divider, List, Menu, Portal, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { first, update } from '../db';
import type { User, UserPreferences } from '../models/types';
import { Screen, SectionCard, Kpi, Row } from '../components/ui';
import { formatINR, rupeesToPaise, paiseToRupees } from '../utils/money';

const RISK = ['conservative', 'moderate', 'aggressive'];

const SettingsScreen: React.FC = () => {
  const { userId, refresh, themeMode, setThemeMode } = useApp();
  const theme = useTheme();
  const user = useData(() => first<User>('SELECT * FROM users WHERE id = ?', [userId!]));
  const prefs = useData(() => first<UserPreferences>('SELECT * FROM user_preferences WHERE user_id = ?', [userId!]));

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', income: '', risk: 'moderate', dob: '' });
  const [riskMenu, setRiskMenu] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const openEdit = () => {
    if (!user) return;
    setForm({
      full_name: user.full_name,
      email: user.email,
      income: String(paiseToRupees(user.monthly_income)),
      risk: user.risk_profile,
      dob: user.date_of_birth || '',
    });
    setEditOpen(true);
  };

  const saveProfile = () => {
    update('users', userId!, {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      monthly_income: rupeesToPaise(form.income || '0'),
      risk_profile: form.risk,
      date_of_birth: form.dob || null,
    });
    setEditOpen(false);
    refresh();
  };

  const updatePref = (key: keyof UserPreferences, value: number) => {
    update('user_preferences', userId!, { [key]: value } as any);
    // user_preferences PK is user_id, not id — use direct update:
    refresh();
  };

  if (!user) return null;

  return (
    <>
      <Screen>
        <SectionCard title="Profile" right={<Button mode="outlined" compact onPress={openEdit} style={{ borderRadius: theme.roundness }}>Edit</Button>} style={{ marginBottom: 12 }}>
          <List.Item title={user.full_name} description="Name" left={(p) => <List.Icon {...p} icon="account" />} />
          <List.Item title={user.email} description="Email" left={(p) => <List.Icon {...p} icon="email" />} />
          <List.Item title={formatINR(user.monthly_income)} description="Monthly income" left={(p) => <List.Icon {...p} icon="cash" />} />
          <List.Item title={user.risk_profile} description="Risk profile" left={(p) => <List.Icon {...p} icon="chart-bell-curve" />} titleStyle={{ textTransform: 'capitalize' }} />
        </SectionCard>

        <SectionCard title="Appearance" style={{ marginBottom: 12 }}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>Theme</Text>
          <SegmentedButtons
            value={themeMode}
            onValueChange={(v) => setThemeMode(v as any)}
            buttons={[
              { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
              { value: 'dark', label: 'Dark', icon: 'weather-night' },
              { value: 'system', label: 'Auto', icon: 'theme-light-dark' },
            ]}
          />
        </SectionCard>

        <SectionCard title="Preferences" style={{ marginBottom: 12 }}>
          <List.Item
            title="SIP reminder"
            description={`${prefs?.sip_reminder_days ?? 3} days before due`}
            left={(p) => <List.Icon {...p} icon="bell-ring" />}
          />
          <List.Item
            title="Auto-lock"
            description={`${prefs?.auto_lock_minutes ?? 15} minutes of inactivity`}
            left={(p) => <List.Icon {...p} icon="lock-clock" />}
          />
        </SectionCard>

        <SectionCard title="About" style={{ marginBottom: 12 }}>
          <List.Item title="FinVault Mobile" description="v1.0.0 · standalone (local SQLite)" left={(p) => <List.Icon {...p} icon="information" />} />
          <List.Item title="Data" description="All data is stored on this device only." left={(p) => <List.Icon {...p} icon="database" />} />
        </SectionCard>
      </Screen>

      <Portal>
        <Dialog visible={editOpen} onDismiss={() => setEditOpen(false)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title>Edit Profile</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Full name" value={form.full_name} onChangeText={(v) => set('full_name', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <TextInput label="Email" value={form.email} onChangeText={(v) => set('email', v)} mode="outlined" dense autoCapitalize="none" style={{ marginBottom: 8 }} />
            <TextInput label="Monthly income (₹)" keyboardType="numeric" value={form.income} onChangeText={(v) => set('income', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <Menu visible={riskMenu} onDismiss={() => setRiskMenu(false)} anchor={<Button mode="outlined" onPress={() => setRiskMenu(true)} style={{ marginBottom: 8 }}>{form.risk}</Button>}>
              {RISK.map((r) => <Menu.Item key={r} title={r} onPress={() => { set('risk', r); setRiskMenu(false); }} />)}
            </Menu>
            <TextInput label="Date of birth (YYYY-MM-DD)" value={form.dob} onChangeText={(v) => set('dob', v)} mode="outlined" dense />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={saveProfile}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default SettingsScreen;
