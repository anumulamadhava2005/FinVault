/**
 * Family Management screen.
 * Links multiple FinVault profiles together (spouse, parent, child, sibling).
 * Each family member is a separate app profile stored in the users table.
 * Relationships are stored in family_relationships (primary_user_id → member_user_id).
 */
import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import {
  Button, Dialog, Divider, List, Menu, Portal,
  Text, TextInput, useTheme, ActivityIndicator,
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Screen, SectionCard, Row, Kpi } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useData } from '../hooks/useData';
import { all, first, insert, run, newId } from '../db';
import { netWorth } from '../services/finance';
import { formatINR, formatINRCompact } from '../utils/money';
import { palette } from '../theme';
import { nowISO } from '../utils/date';
import { hashPassword } from '../utils/crypto';

const RELATIONSHIPS = ['Spouse', 'Parent', 'Child', 'Sibling', 'Partner', 'Other'];

const RELATIONSHIP_ICONS: Record<string, string> = {
  Spouse: 'account-heart',
  Parent: 'account-supervisor',
  Child: 'account-child',
  Sibling: 'account-multiple',
  Partner: 'account-heart-outline',
  Other: 'account',
};

interface FamilyMember {
  relation_id: string;
  member_user_id: string;
  full_name: string;
  email: string;
  risk_profile: string;
  relationship: string;
}

const FamilyManagementScreen: React.FC = () => {
  const theme = useTheme();
  const { userId, refresh, profiles, switchUser } = useApp();

  // Add member dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [relMenu, setRelMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '', relationship: 'Spouse',
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Edit relationship dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FamilyMember | null>(null);
  const [editRelMenu, setEditRelMenu] = useState(false);
  const [editRelation, setEditRelation] = useState('');

  const members = useData<FamilyMember[]>(() => {
    return all<FamilyMember>(
      `SELECT fr.id AS relation_id, fr.member_user_id, fr.relationship,
              u.full_name, u.email, u.risk_profile
       FROM family_relationships fr
       JOIN users u ON u.id = fr.member_user_id
       WHERE fr.primary_user_id = ?
       ORDER BY fr.created_at ASC`,
      [userId!],
    );
  });

  const me = useData(() =>
    first<{ full_name: string; email: string; risk_profile: string; monthly_income: number }>(
      'SELECT full_name, email, risk_profile, monthly_income FROM users WHERE id = ?', [userId!]
    )
  );

  // Combined family net worth
  const familyNetWorth = useData(() => {
    if (!userId) return 0;
    let total = netWorth(userId).net_worth;
    for (const m of (members || [])) {
      total += netWorth(m.member_user_id).net_worth;
    }
    return total;
  }, [userId, members]);

  const handleAddMember = async () => {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
      Alert.alert('Validation', 'Name, email, and a password of at least 8 characters are required.');
      return;
    }
    if (!/[a-zA-Z]/.test(form.password) || !/\d/.test(form.password)) {
      Alert.alert('Validation', 'Password must contain at least one letter and one digit.');
      return;
    }
    setSaving(true);
    try {
      const existing = first<{ id: string }>('SELECT id FROM users WHERE email = ?', [form.email.trim()]);
      let memberId: string;

      if (existing) {
        memberId = existing.id;
      } else {
        memberId = newId();
        const pwHash = await hashPassword(form.password);
        insert('users', {
          id: memberId,
          full_name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password_hash: pwHash,
          risk_profile: 'moderate',
          monthly_income: 0,
          created_at: nowISO(),
        });
        run(
          `INSERT INTO user_preferences (user_id, theme, sip_reminder_days, auto_lock_minutes, sip_reminders_enabled)
           VALUES (?, 'system', 3, 15, 1)`,
          [memberId],
        );
      }

      // Check not already linked
      const alreadyLinked = first<{ id: string }>(
        'SELECT id FROM family_relationships WHERE primary_user_id = ? AND member_user_id = ?',
        [userId!, memberId],
      );
      if (alreadyLinked) {
        Alert.alert('Already linked', 'This person is already in your family.');
        setSaving(false);
        return;
      }

      // Also create the reciprocal relationship
      insert('family_relationships', {
        id: newId(),
        primary_user_id: userId!,
        member_user_id: memberId,
        relationship: form.relationship,
        created_at: nowISO(),
      });

      setAddOpen(false);
      setForm({ name: '', email: '', password: '', relationship: 'Spouse' });
      refresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not add family member.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (member: FamilyMember) => {
    Alert.alert(
      'Remove family member',
      `Remove ${member.full_name} from your family? Their profile and data are NOT deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            run('DELETE FROM family_relationships WHERE id = ?', [member.relation_id]);
            refresh();
          },
        },
      ],
    );
  };

  const handleEditRelation = () => {
    if (!editTarget) return;
    run('UPDATE family_relationships SET relationship = ? WHERE id = ?', [editRelation, editTarget.relation_id]);
    setEditOpen(false);
    setEditTarget(null);
    refresh();
  };

  const openEdit = (m: FamilyMember) => {
    setEditTarget(m);
    setEditRelation(m.relationship);
    setEditOpen(true);
  };

  return (
    <>
      <Screen>
        {/* Combined net worth */}
        <SectionCard title="Family Net Worth" style={{ marginBottom: 12 }}>
          <Text
            variant="displaySmall"
            style={{ fontWeight: '900', color: theme.colors.onSurface, textAlign: 'center', marginVertical: 8 }}
          >
            {formatINR(familyNetWorth)}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
          >
            Combined across {1 + (members?.length ?? 0)} profile{(members?.length ?? 0) > 0 ? 's' : ''}
          </Text>
        </SectionCard>

        {/* My profile */}
        <SectionCard title="My Profile" style={{ marginBottom: 12 }}>
          {me && (
            <List.Item
              title={me.full_name}
              description={me.email}
              left={(p) => <List.Icon {...p} icon="account-circle" />}
              right={() => (
                <View style={{ justifyContent: 'center' }}>
                  <Text variant="labelSmall" style={{ color: palette.good, fontWeight: '700' }}>Active</Text>
                </View>
              )}
            />
          )}
        </SectionCard>

        {/* Family members */}
        <SectionCard
          title="Family Members"
          right={
            <Button
              mode="contained-tonal"
              compact
              icon="account-plus"
              onPress={() => setAddOpen(true)}
              style={{ borderRadius: theme.roundness }}
            >
              Add
            </Button>
          }
          style={{ marginBottom: 12 }}
        >
          {!members || members.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 12 }}>
              <MaterialCommunityIcons name="account-group-outline" size={40} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                No family members linked yet.{'\n'}Add a spouse, parent, or child to track combined wealth.
              </Text>
              <Button mode="outlined" onPress={() => setAddOpen(true)} icon="account-plus">
                Add Family Member
              </Button>
            </View>
          ) : (
            <View style={{ gap: 4 }}>
              {members.map((m, i) => {
                const memberNw = netWorth(m.member_user_id).net_worth;
                const icon = RELATIONSHIP_ICONS[m.relationship] ?? 'account';
                return (
                  <View key={m.relation_id}>
                    {i > 0 && <Divider style={{ marginVertical: 4 }} />}
                    <List.Item
                      title={m.full_name}
                      description={`${m.relationship} · ${m.email}`}
                      left={(p) => <List.Icon {...p} icon={icon} />}
                      right={() => (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontVariant: ['tabular-nums'] }}>
                            {formatINRCompact(memberNw)}
                          </Text>
                          <MaterialCommunityIcons
                            name="pencil-outline"
                            size={18}
                            color={theme.colors.onSurfaceVariant}
                            onPress={() => openEdit(m)}
                          />
                          <MaterialCommunityIcons
                            name="swap-horizontal"
                            size={18}
                            color={theme.colors.primary}
                            onPress={() => {
                              Alert.alert(
                                'Switch profile',
                                `Switch to ${m.full_name}'s profile?`,
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  { text: 'Switch', onPress: () => switchUser(m.member_user_id) },
                                ],
                              );
                            }}
                          />
                          <MaterialCommunityIcons
                            name="close"
                            size={18}
                            color={palette.danger}
                            onPress={() => handleRemove(m)}
                          />
                        </View>
                      )}
                    />
                  </View>
                );
              })}
            </View>
          )}
        </SectionCard>

        {/* How it works */}
        <SectionCard title="How it works" style={{ marginBottom: 24 }}>
          {[
            { icon: 'account-plus', text: 'Add family members to track their portfolio alongside yours.' },
            { icon: 'swap-horizontal', text: 'Switch between profiles to view and manage each person\'s finances separately.' },
            { icon: 'shield-lock-outline', text: 'Each profile has its own password and vault. Data is never shared.' },
            { icon: 'chart-donut', text: 'The combined net worth shows your family\'s total financial picture.' },
          ].map(({ icon, text }) => (
            <List.Item key={icon} title={text} titleNumberOfLines={3} left={(p) => <List.Icon {...p} icon={icon} />} />
          ))}
        </SectionCard>
      </Screen>

      {/* Add Family Member Dialog */}
      <Portal>
        <Dialog visible={addOpen} onDismiss={() => setAddOpen(false)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title style={{ fontWeight: '700' }}>Add Family Member</Dialog.Title>
          <Dialog.Content style={{ gap: 14 }}>
            <TextInput
              label="Full name"
              value={form.name}
              onChangeText={(v) => set('name', v)}
              mode="outlined"
              dense
              autoCapitalize="words"
            />
            <TextInput
              label="Email"
              value={form.email}
              onChangeText={(v) => set('email', v)}
              mode="outlined"
              dense
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              label="Password (min 8 chars, 1 letter + 1 digit)"
              value={form.password}
              onChangeText={(v) => set('password', v)}
              mode="outlined"
              dense
              secureTextEntry
            />
            <Menu
              visible={relMenu}
              onDismiss={() => setRelMenu(false)}
              anchor={
                <Button
                  mode="outlined"
                  icon={RELATIONSHIP_ICONS[form.relationship] ?? 'account'}
                  onPress={() => setRelMenu(true)}
                  style={{ borderRadius: theme.roundness }}
                >
                  {form.relationship}
                </Button>
              }
            >
              {RELATIONSHIPS.map((r) => (
                <Menu.Item
                  key={r}
                  title={r}
                  leadingIcon={RELATIONSHIP_ICONS[r]}
                  onPress={() => { set('relationship', r); setRelMenu(false); }}
                />
              ))}
            </Menu>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleAddMember} loading={saving} disabled={saving}>
              Add Member
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Edit Relationship Dialog */}
        <Dialog visible={editOpen} onDismiss={() => setEditOpen(false)} style={{ borderRadius: theme.roundness }}>
          <Dialog.Title style={{ fontWeight: '700' }}>Change Relationship</Dialog.Title>
          <Dialog.Content>
            <Menu
              visible={editRelMenu}
              onDismiss={() => setEditRelMenu(false)}
              anchor={
                <Button
                  mode="outlined"
                  icon={RELATIONSHIP_ICONS[editRelation] ?? 'account'}
                  onPress={() => setEditRelMenu(true)}
                  style={{ borderRadius: theme.roundness }}
                >
                  {editRelation}
                </Button>
              }
            >
              {RELATIONSHIPS.map((r) => (
                <Menu.Item
                  key={r}
                  title={r}
                  leadingIcon={RELATIONSHIP_ICONS[r]}
                  onPress={() => { setEditRelation(r); setEditRelMenu(false); }}
                />
              ))}
            </Menu>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditOpen(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleEditRelation}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
};

export default FamilyManagementScreen;
