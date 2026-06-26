import React, { useState, useEffect } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Button, Dialog, FAB, IconButton, Portal, Text, TextInput, useTheme, ActivityIndicator, Divider } from 'react-native-paper';
import BouncePressable from '../components/BouncePressable';
import * as LocalAuthentication from 'expo-local-authentication';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { all, insert, newId, remove, first } from '../db';
import type { VaultCredential } from '../models/types';
import { Screen, SectionCard, Kpi, Row, ProgressBar, EmptyState } from '../components/ui';
import { palette, statusColor } from '../theme';
import { nowISO } from '../utils/date';
import {
  encryptWithKey,
  decryptWithKey,
  deriveEncryptionKey,
  genSecurePassword,
  verifyPassword,
} from '../utils/crypto';

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

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

const VaultScreen: React.FC = () => {
  const { userId, refresh, vaultLockMode, masterPassword } = useApp();
  const theme = useTheme();

  // Vault lock state
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [fallbackPassword, setFallbackPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // AES key derived once on unlock
  const [derivedKey, setDerivedKey] = useState<Uint8Array | null>(null);

  // Brute-force lockout
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockCountdown, setLockCountdown] = useState(0);

  const creds = useData(() => {
    if (!isUnlocked) return [];
    return all<VaultCredential>('SELECT * FROM vault_credentials WHERE user_id = ? ORDER BY service', [userId!]);
  });

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ service: '', username: '', password: '', url: '' });
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [showFormPw, setShowFormPw] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const avgStrength = creds.length ? Math.round(creds.reduce((s, c) => s + c.password_strength, 0) / creds.length) : 0;
  const weak = creds.filter((c) => c.password_strength < 50).length;

  // Auto-authenticate on mount if in biometric mode
  useEffect(() => {
    if (!isUnlocked && vaultLockMode === 'biometric') {
      handleBiometricUnlock();
    }
  }, [vaultLockMode]);

  // Derive AES key once when vault unlocks
  useEffect(() => {
    if (isUnlocked && masterPassword && userId) {
      deriveEncryptionKey(masterPassword, userId).then(setDerivedKey);
    }
  }, [isUnlocked, masterPassword, userId]);

  // Countdown timer during lockout
  useEffect(() => {
    if (lockedUntil === null) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        setLockCountdown(0);
        setFailedAttempts(0);
      } else {
        setLockCountdown(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const handleBiometricUnlock = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        setAuthError('Biometrics not configured on this device. Use password.');
        setAuthLoading(false);
        return;
      }

      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Secure Vault',
      });

      if (res.success) {
        setIsUnlocked(true);
        refresh();
      } else {
        setAuthError('Biometric authentication failed.');
      }
    } catch (err) {
      setAuthError('Biometrics error. Please use password.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordUnlock = async () => {
    if (!fallbackPassword) return;
    if (lockedUntil !== null && Date.now() < lockedUntil) return;

    setAuthLoading(true);
    setAuthError(null);

    const user = first<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [userId!]);
    if (!user) {
      setAuthError('User not found.');
      setAuthLoading(false);
      return;
    }

    const { ok } = await verifyPassword(fallbackPassword, user.password_hash);
    if (ok) {
      setFailedAttempts(0);
      setLockedUntil(null);
      setIsUnlocked(true);
      refresh();
    } else {
      const next = failedAttempts + 1;
      setFailedAttempts(next);
      if (next >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_SECONDS * 1000;
        setLockedUntil(until);
        setLockCountdown(LOCKOUT_SECONDS);
        setAuthError(`Too many attempts. Try again in ${LOCKOUT_SECONDS}s.`);
      } else {
        setAuthError(`Incorrect master password. ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next === 1 ? '' : 's'} remaining.`);
      }
    }
    setAuthLoading(false);
  };

  const save = () => {
    if (!form.service.trim() || !form.password) return;
    if (!derivedKey) return; // key not ready yet

    const encryptedPw = encryptWithKey(form.password, derivedKey);

    insert('vault_credentials', {
      id: newId(),
      user_id: userId!,
      category_id: null,
      service: form.service.trim(),
      username: form.username,
      password_enc: encryptedPw,
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

  // Render Lock Screen inside Vault screen
  if (!isUnlocked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.colors.background }}>
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
            <MaterialCommunityIcons name="lock-outline" size={36} color={theme.colors.primary} />
          </View>
          <Text variant="headlineSmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
            Vault is Locked
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            {vaultLockMode === 'biometric' 
              ? 'Authenticate using biometrics to view credentials'
              : 'Enter your master password to decrypt vault credentials'}
          </Text>
        </View>

        {vaultLockMode === 'biometric' ? (
          <View>
            {authLoading ? (
              <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} />
            ) : (
              <Button 
                mode="contained" 
                icon="fingerprint" 
                onPress={handleBiometricUnlock}
                style={{ borderRadius: theme.roundness, marginBottom: 12 }}
              >
                Unlock with Fingerprint
              </Button>
            )}

            <Divider style={{ marginVertical: 16 }} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 12, fontWeight: '700' }}>
              OR USE FALLBACK PASSWORD
            </Text>
          </View>
        ) : null}

        <TextInput
          label="Master Password"
          value={fallbackPassword}
          onChangeText={setFallbackPassword}
          secureTextEntry
          mode="outlined"
          style={{ marginBottom: 16 }}
          left={<TextInput.Icon icon="lock" />}
        />

        {authError ? (
          <Text style={{ color: palette.danger, fontSize: 13, textAlign: 'center', marginBottom: 16, fontWeight: '600' }}>
            {authError}
          </Text>
        ) : null}

        {authLoading && vaultLockMode === 'password' ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} />
        ) : lockedUntil !== null ? (
          <Button
            mode="outlined"
            disabled
            style={{ borderRadius: theme.roundness }}
          >
            Locked — try again in {lockCountdown}s
          </Button>
        ) : (
          <Button
            mode={vaultLockMode === 'password' ? 'contained' : 'outlined'}
            onPress={handlePasswordUnlock}
            style={{ borderRadius: theme.roundness }}
          >
            Decrypt Vault
          </Button>
        )}
      </View>
    );
  }

  return (
    <>
      <Screen>
        <Row>
          <Kpi label="Credentials" value={String(creds.length)} />
          <Kpi label="Vault Score" value={`${avgStrength}%`} subTone={avgStrength >= 70 ? 'good' : avgStrength >= 40 ? 'muted' : 'bad'} />
          <Kpi label="Weak" value={String(weak)} subTone={weak ? 'bad' : 'good'} />
        </Row>

        {creds.length === 0 ? (
          <SectionCard>
            <EmptyState icon="lock" title="Vault is empty" message="Save a credential to keep it secure and handy." />
          </SectionCard>
        ) : (
          creds.map((c) => {
            const tone = c.password_strength >= 70 ? 'good' : c.password_strength >= 40 ? 'warn' : 'bad';
            
            // Decrypt password on demand using derived AES key
            let decPassword = '[Decryption Error]';
            try {
              if (derivedKey) {
                decPassword = decryptWithKey(c.password_enc, derivedKey);
              }
            } catch { /* fallback */ }

            return (
              <SectionCard key={c.id} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="titleSmall" style={{ fontWeight: '700' }}>{c.service}</Text>
                  <IconButton icon="delete" iconColor={palette.danger} size={18} style={{ margin: 0 }} onPress={() => setConfirmId(c.id)} accessibilityLabel="Delete credential" />
                </View>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>{c.username}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 8 }}>
                  <Text variant="bodyMedium" style={{ fontFamily: 'monospace', flex: 1 }}>
                    {revealed[c.id] ? decPassword : '•'.repeat(Math.min(decPassword.length || 8, 12))}
                  </Text>
                  <IconButton
                    icon={revealed[c.id] ? 'eye-off' : 'eye'}
                    size={18}
                    style={{ margin: 0 }}
                    onPress={() => setRevealed((r) => ({ ...r, [c.id]: !r[c.id] }))}
                    accessibilityLabel={revealed[c.id] ? 'Hide password' : 'Show password'}
                  />
                </View>
                <ProgressBar pct={c.password_strength} color={statusColor(tone)} height={6} />
                {c.url ? (
                  <Pressable
                    onPress={() => Linking.openURL(c.url!.startsWith('http') ? c.url! : `https://${c.url}`)}
                    style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  >
                    <MaterialCommunityIcons name="open-in-new" size={13} color={theme.colors.primary} />
                    <Text
                      variant="labelSmall"
                      numberOfLines={1}
                      style={{ color: theme.colors.primary, textDecorationLine: 'underline', flex: 1 }}
                    >
                      {c.url}
                    </Text>
                  </Pressable>
                ) : null}
              </SectionCard>
            );
          })
        )}
      </Screen>

      <BouncePressable
        onPress={() => setAddOpen(true)}
        style={{ position: 'absolute', right: 16, bottom: 28, zIndex: 10 }}
      >
        <FAB
          icon="plus"
          label="Add"
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: 28,
            elevation: 4,
          }}
          color={theme.colors.onPrimary}
          pointerEvents="none"
        />
      </BouncePressable>

      <Portal>
        <Dialog visible={addOpen} onDismiss={() => setAddOpen(false)} style={{ borderRadius: theme.roundness }}>
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
              <IconButton icon="dice-5" onPress={() => set('password', genSecurePassword())} accessibilityLabel="Generate a strong password" />
            </View>
            {form.password ? <ProgressBar pct={strengthOf(form.password)} color={statusColor(strengthOf(form.password) >= 70 ? 'good' : strengthOf(form.password) >= 40 ? 'warn' : 'bad')} height={6} /> : null}
            <TextInput label="URL (optional)" value={form.url} onChangeText={(v) => set('url', v)} mode="outlined" dense autoCapitalize="none" style={{ marginTop: 8 }} />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={save}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={confirmId !== null} onDismiss={() => setConfirmId(null)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title>Delete Credential</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete this credential forever?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmId(null)}>Cancel</Button>
            <Button mode="contained" buttonColor={palette.danger} onPress={doDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default VaultScreen;
