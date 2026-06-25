import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { Button, Dialog, Divider, List, Menu, Portal, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { first, update, run } from '../db';
import { scheduleSipReminders, cancelSipReminders } from '../services/sipPushNotifications';
import type { User, UserPreferences } from '../models/types';
import { Screen, SectionCard, Kpi, Row } from '../components/ui';
import { formatINR, rupeesToPaise, paiseToRupees } from '../utils/money';

const RISK = ['conservative', 'moderate', 'aggressive'];

const SettingsScreen: React.FC = () => {
  const { userId, refresh, themeMode, setThemeMode, vaultLockMode, setVaultLockMode } = useApp();
  const router = useRouter();
  const theme = useTheme();
  const user = useData(() => first<User>('SELECT * FROM users WHERE id = ?', [userId!]));
  const prefs = useData(() => first<UserPreferences>('SELECT * FROM user_preferences WHERE user_id = ?', [userId!]));

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', income: '', risk: 'moderate', dob: '' });
  const [riskMenu, setRiskMenu] = useState(false);
  const [sipMenu, setSipMenu] = useState(false);
  const [lockMenu, setLockMenu] = useState(false);
  const [lockModeMenu, setLockModeMenu] = useState(false);
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

  const updatePref = (key: 'sip_reminder_days' | 'auto_lock_minutes', value: number) => {
    run(`UPDATE user_preferences SET ${key} = ? WHERE user_id = ?`, [value, userId!]);
    refresh();
  };

  const toggleSipPushReminders = (enabled: boolean) => {
    run(`UPDATE user_preferences SET sip_reminders_enabled = ? WHERE user_id = ?`, [enabled ? 1 : 0, userId!]);
    refresh();
    if (enabled) {
      scheduleSipReminders(userId!).catch(() => {});
    } else {
      cancelSipReminders().catch(() => {});
    }
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
          <Menu
            visible={sipMenu}
            onDismiss={() => setSipMenu(false)}
            anchor={
              <List.Item
                title="SIP reminder"
                description={`${prefs?.sip_reminder_days ?? 3} days before due`}
                left={(p) => <List.Icon {...p} icon="bell-ring" />}
                right={(p) => <List.Icon {...p} icon="chevron-right" />}
                onPress={() => setSipMenu(true)}
              />
            }
          >
            {[1, 2, 3, 5, 7].map((d) => (
              <Menu.Item
                key={d}
                title={`${d} ${d === 1 ? 'day' : 'days'} before`}
                leadingIcon={prefs?.sip_reminder_days === d ? 'check' : undefined}
                onPress={() => { updatePref('sip_reminder_days', d); setSipMenu(false); }}
              />
            ))}
          </Menu>
          <List.Item
            title="SIP push notifications"
            description="Remind me the day before each SIP is due"
            left={(p) => <List.Icon {...p} icon="bell-badge" />}
            right={() => (
              <Switch
                value={(prefs?.sip_reminders_enabled ?? 1) === 1}
                onValueChange={toggleSipPushReminders}
                trackColor={{ false: theme.colors.outlineVariant, true: theme.colors.primary }}
              />
            )}
          />
          <Menu
            visible={lockMenu}
            onDismiss={() => setLockMenu(false)}
            anchor={
              <List.Item
                title="Auto-lock"
                description={prefs?.auto_lock_minutes === 0 ? 'Never' : `${prefs?.auto_lock_minutes ?? 15} minutes of inactivity`}
                left={(p) => <List.Icon {...p} icon="lock-clock" />}
                right={(p) => <List.Icon {...p} icon="chevron-right" />}
                onPress={() => setLockMenu(true)}
              />
            }
          >
            {[5, 10, 15, 30, 60, 0].map((m) => (
              <Menu.Item
                key={m}
                title={m === 0 ? 'Never' : `${m} minutes`}
                leadingIcon={prefs?.auto_lock_minutes === m ? 'check' : undefined}
                onPress={() => { updatePref('auto_lock_minutes', m); setLockMenu(false); }}
              />
            ))}
          </Menu>
          <Menu
            visible={lockModeMenu}
            onDismiss={() => setLockModeMenu(false)}
            anchor={
              <List.Item
                title="Lock mode"
                description={vaultLockMode === 'biometric' ? 'Fingerprint / Face ID' : 'Master Password'}
                left={(p) => <List.Icon {...p} icon={vaultLockMode === 'biometric' ? 'fingerprint' : 'lock'} />}
                right={(p) => <List.Icon {...p} icon="chevron-right" />}
                onPress={() => setLockModeMenu(true)}
              />
            }
          >
            <Menu.Item
              title="Master Password"
              leadingIcon={vaultLockMode === 'password' ? 'check' : 'lock'}
              onPress={() => { setVaultLockMode('password'); setLockModeMenu(false); }}
            />
            <Menu.Item
              title="Fingerprint / Face ID"
              leadingIcon={vaultLockMode === 'biometric' ? 'check' : 'fingerprint'}
              onPress={() => { setVaultLockMode('biometric'); setLockModeMenu(false); }}
            />
          </Menu>
        </SectionCard>

        <SectionCard title="Data & Backup" style={{ marginBottom: 12 }}>
          <List.Item
            title="Backup & Restore"
            description="Export an encrypted backup or restore from a file"
            left={(p) => <List.Icon {...p} icon="shield-lock-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/backup' as any)}
          />
        </SectionCard>

        <SectionCard title="Family" style={{ marginBottom: 12 }}>
          <List.Item
            title="Manage Family"
            description="Link profiles, view combined net worth, switch accounts"
            left={(p) => <List.Icon {...p} icon="account-group" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/family' as any)}
          />
        </SectionCard>

        <SectionCard title="About" style={{ marginBottom: 12 }}>
          <List.Item
            title="FinVault"
            description="v1.0.0 · Privacy-first offline wealth manager"
            left={(p) => <List.Icon {...p} icon="wallet-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/about' as any)}
          />
          <List.Item
            title="Architecture & Product Info"
            description="Value proposition, tech stack, and team"
            left={(p) => <List.Icon {...p} icon="information-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => router.push('/about' as any)}
          />
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
