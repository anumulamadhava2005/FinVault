import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Dialog, FAB, IconButton, Portal, Text, TextInput, useTheme } from 'react-native-paper';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { all, insert, newId, remove } from '../db';
import type { VaultCredential } from '../models/types';
import { Screen, SectionCard, Kpi, Row, ProgressBar, EmptyState } from '../components/ui';
import { palette, statusColor } from '../theme';
import { nowISO } from '../utils/date';

/** Lightweight password-strength heuristic (0..100). */
const strengthOf = (pw: string): number => {
  let s = 0;
  if (pw.length >= 8) s += 30;
  if (pw.length >= 12) s += 15;
  if (/[A-Z]/.test(pw)) s += 15;
  if (/[a-z]/.test(pw)) s += 10;
  if (/[0-9]/.test(pw)) s += 15;
  if (/[^A-Za-z0-9]/.test(pw)) s += 15;
  return Math.min(s, 100);
};

const genPassword = (): string => {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*';
  let out = '';
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

const VaultScreen: React.FC = () => {
  const { userId, refresh } = useApp();
  const theme = useTheme();
  const creds = useData(() => all<VaultCredential>('SELECT * FROM vault_credentials WHERE user_id = ? ORDER BY service', [userId]));

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ service: '', username: '', password: '', url: '' });
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [showFormPw, setShowFormPw] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const avgStrength = creds.length ? Math.round(creds.reduce((s, c) => s + c.password_strength, 0) / creds.length) : 0;
  const weak = creds.filter((c) => c.password_strength < 50).length;

  const save = () => {
    if (!form.service.trim()) return;
    insert('vault_credentials', {
      id: newId(),
      user_id: userId,
      category_id: null,
      service: form.service.trim(),
      username: form.username,
      password_enc: form.password,
      url: form.url || null,
      notes: null,
      password_strength: strengthOf(form.password),
      created_at: nowISO(),
    });
    setForm({ service: '', username: '', password: '', url: '' });
    setAddOpen(false);
    refresh();
  };

  const doDelete = () => {
    if (confirmId) remove('vault_credentials', confirmId);
    setConfirmId(null);
    refresh();
  };

  return (
    <>
      <Screen>
        <Row>
          <Kpi label="Credentials" value={String(creds.length)} />
          <Kpi label="Vault Score" value={`${avgStrength}%`} subTone={avgStrength >= 70 ? 'good' : avgStrength >= 40 ? 'muted' : 'bad'} />
          <Kpi label="Weak" value={String(weak)} subTone={weak ? 'bad' : 'good'} />
        </Row>

        {creds.length === 0 ? (
          <SectionCard><EmptyState icon="lock" title="Vault is empty" message="Save a credential to keep it secure and handy." /></SectionCard>
        ) : (
          creds.map((c) => {
            const tone = c.password_strength >= 70 ? 'good' : c.password_strength >= 40 ? 'warn' : 'bad';
            return (
              <SectionCard key={c.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="titleSmall" style={{ fontWeight: '800' }}>{c.service}</Text>
                  <IconButton icon="delete" iconColor={palette.danger} size={20} onPress={() => setConfirmId(c.id)} accessibilityLabel="Delete credential" />
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>{c.username}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                  <Text variant="bodyMedium" style={{ fontFamily: 'monospace', flex: 1 }}>
                    {revealed[c.id] ? c.password_enc : '•'.repeat(Math.min(c.password_enc.length || 8, 12))}
                  </Text>
                  <IconButton
                    icon={revealed[c.id] ? 'eye-off' : 'eye'}
                    size={20}
                    onPress={() => setRevealed((r) => ({ ...r, [c.id]: !r[c.id] }))}
                    accessibilityLabel={revealed[c.id] ? 'Hide password' : 'Show password'}
                  />
                </View>
                <ProgressBar pct={c.password_strength} color={statusColor(tone)} height={6} />
              </SectionCard>
            );
          })
        )}
      </Screen>

      <FAB icon="plus" label="Add" style={{ position: 'absolute', right: 16, bottom: 16 }} onPress={() => setAddOpen(true)} />

      <Portal>
        <Dialog visible={addOpen} onDismiss={() => setAddOpen(false)}>
          <Dialog.Title>Add Credential</Dialog.Title>
          <Dialog.Content>
            <TextInput label="Service" value={form.service} onChangeText={(v) => set('service', v)} mode="outlined" dense style={{ marginBottom: 8 }} />
            <TextInput label="Username / Email" value={form.username} onChangeText={(v) => set('username', v)} mode="outlined" dense style={{ marginBottom: 8 }} autoCapitalize="none" />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                label="Password"
                value={form.password}
                onChangeText={(v) => set('password', v)}
                mode="outlined"
                dense
                secureTextEntry={!showFormPw}
                autoCapitalize="none"
                style={{ flex: 1 }}
              />
              <IconButton icon={showFormPw ? 'eye-off' : 'eye'} onPress={() => setShowFormPw((s) => !s)} accessibilityLabel={showFormPw ? 'Hide password' : 'Show password'} />
              <IconButton icon="dice-5" onPress={() => set('password', genPassword())} accessibilityLabel="Generate a strong password" />
            </View>
            {form.password ? <ProgressBar pct={strengthOf(form.password)} color={statusColor(strengthOf(form.password) >= 70 ? 'good' : strengthOf(form.password) >= 40 ? 'warn' : 'bad')} height={6} /> : null}
            <TextInput label="URL (optional)" value={form.url} onChangeText={(v) => set('url', v)} mode="outlined" dense autoCapitalize="none" style={{ marginTop: 8 }} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={save}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={!!confirmId} onDismiss={() => setConfirmId(null)}>
          <Dialog.Title>Delete Credential</Dialog.Title>
          <Dialog.Content><Text>Delete this credential? This cannot be undone.</Text></Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmId(null)}>Cancel</Button>
            <Button textColor={palette.danger} onPress={doDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default VaultScreen;
