import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Dialog,
  List,
  Portal,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { Screen, SectionCard } from '../components/ui';
import { useApp } from '../context/AppContext';
import { exportBackup, importBackup } from '../services/backup';
import { palette } from '../theme';

const BackupScreen: React.FC = () => {
  const { userId, masterPassword, refresh } = useApp();
  const theme = useTheme();

  const [snack, setSnack] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);

  // Import confirmation dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importPassword, setImportPassword] = useState('');
  const [showImportPw, setShowImportPw] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(`@finvault_last_backup_${userId}`).then(d => setLastBackupDate(d));
  }, [userId]);

  const doExport = async () => {
    if (!userId || !masterPassword) {
      setSnack('You must be logged in to export a backup.');
      return;
    }
    setBusy(true);
    const result = await exportBackup(userId, masterPassword);
    setBusy(false);
    setSnack(result.message);
    if (result.ok) {
      await AsyncStorage.setItem(`@finvault_last_backup_${userId}`, new Date().toISOString());
      setLastBackupDate(new Date().toISOString());
    }
  };

  const doImport = async () => {
    if (!importPassword.trim()) {
      setSnack('Enter the backup password to continue.');
      return;
    }
    setImportOpen(false);
    setBusy(true);
    const result = await importBackup(importPassword.trim());
    setBusy(false);
    setImportPassword('');
    setSnack(result.message);
    if (result.ok) refresh();
  };

  return (
    <>
      <Screen>
        {/* ── What is this? ──────────────────────────────────────── */}
        <SectionCard style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            <MaterialCommunityIcons
              name="shield-lock-outline"
              size={28}
              color={palette.good}
              style={{ marginTop: 2 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700', fontSize: 15, color: theme.colors.onSurface, marginBottom: 4 }}>
                Encrypted Backup
              </Text>
              <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, lineHeight: 19 }}>
                Your entire FinVault — assets, expenses, goals, loans, insurance, and vault credentials —
                is exported as a single encrypted file. Only your master password can decrypt it.
              </Text>
              <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, lineHeight: 19, marginTop: 8 }}>
                Save the exported file to iCloud Drive, Google Drive, or any cloud storage to protect
                against device loss.
              </Text>
            </View>
          </View>
        </SectionCard>

        {/* ── Export ─────────────────────────────────────────────── */}
        <SectionCard title="Export Backup" style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, marginBottom: 16, lineHeight: 19 }}>
            Creates a <Text style={{ fontWeight: '700' }}>.finvault</Text> backup file encrypted with
            your master password and opens the share sheet so you can save it anywhere.
          </Text>

          <List.Item
            title="What's included"
            description="Assets · Expenses · Goals · Loans · Insurance · Vault · History"
            left={(p) => <List.Icon {...p} icon="check-all" color={palette.good} />}
          />
          <List.Item
            title="What's excluded"
            description="Attached images / PDFs (local file paths won't survive across devices)"
            left={(p) => <List.Icon {...p} icon="image-off-outline" color={theme.colors.onSurfaceVariant} />}
          />

          {(() => {
            if (!lastBackupDate) {
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.errorContainer, borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <MaterialCommunityIcons name="shield-alert-outline" size={18} color={theme.colors.onErrorContainer} />
                  <Text style={{ color: theme.colors.onErrorContainer, fontSize: 13, flex: 1 }}>
                    No backup found. Create a backup to protect your data.
                  </Text>
                </View>
              );
            }
            const daysSince = Math.floor((Date.now() - new Date(lastBackupDate).getTime()) / 86400000);
            if (daysSince > 7) {
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.tertiaryContainer, borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <MaterialCommunityIcons name="clock-alert-outline" size={18} color={theme.colors.onTertiaryContainer} />
                  <Text style={{ color: theme.colors.onTertiaryContainer, fontSize: 13, flex: 1 }}>
                    Last backup was {daysSince} days ago. Consider creating a new backup.
                  </Text>
                </View>
              );
            }
            return null;
          })()}

          {busy ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 16 }} />
          ) : (
            <Button
              mode="contained"
              icon="export"
              onPress={doExport}
              style={{ borderRadius: theme.roundness, marginTop: 16 }}
            >
              Export & Share Backup
            </Button>
          )}
        </SectionCard>

        {/* ── Import ─────────────────────────────────────────────── */}
        <SectionCard title="Restore from Backup" style={{ marginBottom: 12 }}>
          <View
            style={{
              backgroundColor: theme.colors.errorContainer,
              borderRadius: theme.roundness / 2,
              padding: 12,
              marginBottom: 16,
              flexDirection: 'row',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <MaterialCommunityIcons
              name="alert"
              size={18}
              color={theme.colors.error}
              style={{ marginTop: 1, flexShrink: 0 }}
            />
            <Text style={{ fontSize: 12.5, color: theme.colors.error, flex: 1, lineHeight: 18 }}>
              Restoring a backup will <Text style={{ fontWeight: '700' }}>replace all existing data</Text> for
              that profile. This cannot be undone.
            </Text>
          </View>

          <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, marginBottom: 16, lineHeight: 19 }}>
            Pick a <Text style={{ fontWeight: '700' }}>.finvault</Text> file and enter the master
            password that was used when the backup was created.
          </Text>

          {busy ? (
            <ActivityIndicator color={theme.colors.primary} />
          ) : (
            <Button
              mode="contained-tonal"
              icon="import"
              onPress={() => setImportOpen(true)}
              style={{ borderRadius: theme.roundness }}
            >
              Pick Backup File & Restore
            </Button>
          )}
        </SectionCard>

        {/* ── Tips ───────────────────────────────────────────────── */}
        <SectionCard title="Backup Tips" style={{ marginBottom: 12 }}>
          {[
            { icon: 'calendar-clock', text: 'Back up monthly, or after significant changes.' },
            { icon: 'cloud-upload', text: 'Store the backup in iCloud Drive or Google Drive, not just on this device.' },
            { icon: 'lock', text: 'The backup is useless without your master password — keep both safe.' },
            { icon: 'phone-rotate-landscape', text: 'To move to a new phone: export backup → install FinVault → restore.' },
          ].map((tip) => (
            <List.Item
              key={tip.text}
              title={tip.text}
              left={(p) => <List.Icon {...p} icon={tip.icon} color={theme.colors.onSurfaceVariant} />}
              titleNumberOfLines={3}
              titleStyle={{ fontSize: 13, color: theme.colors.onSurfaceVariant }}
            />
          ))}
        </SectionCard>
      </Screen>

      {/* Import password dialog */}
      <Portal>
        <Dialog
          visible={importOpen}
          onDismiss={() => setImportOpen(false)}
          style={{ borderRadius: theme.roundness }}
        >
          <Dialog.Title>Restore Backup</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
              Select your backup file. Enter the master password that was active when the backup was created.
            </Text>
            <TextInput
              label="Master Password (from backup)"
              value={importPassword}
              onChangeText={setImportPassword}
              secureTextEntry={!showImportPw}
              mode="outlined"
              autoCapitalize="none"
              right={
                <TextInput.Icon
                  icon={showImportPw ? 'eye-off' : 'eye'}
                  onPress={() => setShowImportPw((s) => !s)}
                />
              }
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setImportOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={doImport} disabled={!importPassword.trim()}>
              Pick File & Restore
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={3500}>
        {snack}
      </Snackbar>
    </>
  );
};

export default BackupScreen;
