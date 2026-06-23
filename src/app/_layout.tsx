import 'react-native-gesture-handler';
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Switch, KeyboardAvoidingView, Platform, Animated, Pressable } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { PaperProvider, Avatar, Divider, SegmentedButtons, Text, TextInput, Button, HelperText, ActivityIndicator, useTheme, Portal, Dialog } from 'react-native-paper';
import { Drawer, DrawerContentScrollView, DrawerItemList } from 'expo-router/drawer';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppProvider, useApp } from '@/context/AppContext';
import { darkTheme, lightTheme, palette } from '@/theme';
import { first } from '@/db';
import BouncePressable from '@/components/BouncePressable';
import ThemeToggle from '@/components/ThemeToggle';

const paperIconSettings = {
  icon: (props: any) => <MaterialCommunityIcons {...props} />,
};

const drawerIcon =
  (name: string) =>
  ({ color, size }: { color: any; size: number }) =>
    <MaterialCommunityIcons name={name as any} color={color} size={size} />;

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0] ? parts[0][0].toUpperCase() : '?';
};

const CustomDrawer = (props: any) => {
  const { userId, themeMode, setThemeMode, isDark, logout, logoutAndReset, profiles } = useApp();
  const theme = isDark ? darkTheme : lightTheme;
  const user = userId ? first<{ full_name: string; email: string }>('SELECT full_name, email FROM users WHERE id = ?', [userId]) : null;
  
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const activeRouteName = props.state.routes[props.state.index].name;

  const vaultCount = userId ? (first<{ count: number }>('SELECT COUNT(*) as count FROM vault_credentials WHERE user_id = ?', [userId])?.count || 0) : 0;
  const policyCount = userId ? (first<{ count: number }>('SELECT COUNT(*) as count FROM insurance_policies WHERE user_id = ?', [userId])?.count || 0) : 0;

  const menuItems = [
    { section: 'FINANCES', route: 'index', label: 'Dashboard', icon: 'view-dashboard' },
    { section: 'FINANCES', route: 'insights', label: 'Insights', icon: 'lightbulb-on' },
    { section: 'FINANCES', route: 'feed', label: 'Wealth Feed', icon: 'newspaper-variant-outline' },
    { section: 'FINANCES', route: 'assets', label: 'Assets', icon: 'chart-line' },
    { section: 'FINANCES', route: 'expenses', label: 'Expenses', icon: 'cash-multiple' },
    { section: 'FINANCES', route: 'loans', label: 'Loans', icon: 'bank' },
    { section: 'FINANCES', route: 'goals', label: 'Goals', icon: 'flag-checkered' },
    { section: 'FINANCES', route: 'recap', label: 'Wealth Recap', icon: 'calendar-star' },
    { section: 'FINANCES', route: 'history', label: 'History', icon: 'history' },
    { section: 'FINANCES', route: 'retirement', label: 'Retirement', icon: 'island' },
    { section: 'FINANCES', route: 'reports', label: 'Reports', icon: 'file-chart' },
    
    { section: 'SECURITY', route: 'vault', label: 'Secure Vault', icon: 'lock', count: vaultCount > 0 ? `${vaultCount} credentials` : 'Encrypted' },
    { section: 'SECURITY', route: 'protect', label: 'Insurance', icon: 'shield-check', count: policyCount > 0 ? `${policyCount} policies` : 'No policies' },
  ];

  const actionItems = [
    { section: 'SECURITY', label: 'Lock App', icon: 'lock-outline', onPress: logout, show: true },
    { section: 'ACCOUNT', label: 'Switch Profile', icon: 'account-switch', onPress: logout, show: profiles.length > 1 },
    { section: 'ACCOUNT', label: 'Settings', icon: 'cog', onPress: () => props.navigation.navigate('settings'), show: true },
  ];

  const filteredMenuItems = menuItems.filter(item => 
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const filteredActionItems = actionItems.filter(item => 
    item.show && item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderSectionHeader = (title: string) => (
    <Text style={{
      fontSize: 10,
      fontWeight: '800',
      color: theme.colors.primary,
      letterSpacing: 1.2,
      marginHorizontal: 20,
      marginTop: 12,
      marginBottom: 4,
      opacity: 0.85,
    }}>
      {title}
    </Text>
  );

  const renderMenuItem = (routeName: string, label: string, icon: string, subtitle?: string) => {
    const isActive = activeRouteName === routeName;
    return (
      <BouncePressable
        key={routeName}
        onPress={() => props.navigation.navigate(routeName)}
        style={{ marginHorizontal: 8, marginVertical: 1.5 }}
      >
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 8,
          backgroundColor: isActive ? theme.colors.primaryContainer + '18' : 'transparent',
          borderLeftWidth: 3,
          borderLeftColor: isActive ? theme.colors.primary : 'transparent',
          gap: 10,
        }}>
          <MaterialCommunityIcons 
            name={icon as any} 
            size={20} 
            color={isActive ? theme.colors.primary : theme.colors.onSurfaceVariant} 
          />
          <View style={{ flex: 1 }}>
            <Text style={{ 
              fontWeight: isActive ? '700' : '500', 
              color: isActive ? theme.colors.primary : theme.colors.onSurface,
              fontSize: 13.5,
            }}>
              {label}
            </Text>
            {subtitle ? (
              <Text style={{
                fontSize: 10.5,
                color: theme.colors.onSurfaceVariant,
                opacity: 0.75,
                marginTop: 0.5,
              }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      </BouncePressable>
    );
  };

  const renderActionItem = (onPress: () => void, label: string, icon: string, isDestructive = false) => {
    return (
      <BouncePressable
        key={label}
        onPress={onPress}
        style={{ marginHorizontal: 8, marginVertical: 1.5 }}
      >
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 8,
          backgroundColor: isDestructive ? theme.colors.errorContainer + '0B' : 'transparent',
          gap: 10,
        }}>
          <MaterialCommunityIcons 
            name={icon as any} 
            size={20} 
            color={isDestructive ? theme.colors.error : theme.colors.onSurfaceVariant} 
          />
          <Text style={{ 
            fontWeight: '500', 
            color: isDestructive ? theme.colors.error : theme.colors.onSurface,
            fontSize: 13.5,
          }}>
            {label}
          </Text>
        </View>
      </BouncePressable>
    );
  };

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ paddingTop: 0, paddingBottom: 24 }}
      style={{ backgroundColor: theme.colors.surface }}
    >
      {/* Profile Section */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 48,
        paddingBottom: 16,
        paddingHorizontal: 20,
        backgroundColor: theme.colors.surfaceVariant,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.outline,
        gap: 14,
      }}>
        <Avatar.Text
          size={42}
          label={getInitials(user?.full_name || 'U')}
          style={{ backgroundColor: theme.colors.primary }}
          labelStyle={{ color: theme.colors.background, fontWeight: '700', fontSize: 14 }}
        />
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" numberOfLines={1} style={{ color: theme.colors.onSurface, fontWeight: '700', fontSize: 14.5 }}>
            {user?.full_name || 'FinVault'}
          </Text>
          {user?.email ? (
            <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant, fontWeight: '500', fontSize: 11.5 }}>
              {user.email}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Quick Search */}
      <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        <TextInput
          placeholder="Search menu..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          mode="outlined"
          dense
          style={{ height: 32, backgroundColor: theme.colors.surface, fontSize: 12.5 }}
          outlineStyle={{ borderRadius: 8, borderColor: theme.colors.outlineVariant }}
          left={<TextInput.Icon icon="magnify" size={16} color={theme.colors.onSurfaceVariant} />}
          right={searchQuery ? <TextInput.Icon icon="close" size={16} color={theme.colors.onSurfaceVariant} onPress={() => setSearchQuery('')} /> : null}
        />
      </View>

      {searchQuery ? (
        // Search Results View
        <View style={{ gap: 1 }}>
          {filteredMenuItems.map(item => renderMenuItem(item.route, item.label, item.icon, item.count))}
          {filteredActionItems.map(item => renderActionItem(item.onPress, item.label, item.icon))}
          {filteredMenuItems.length === 0 && filteredActionItems.length === 0 && (
            <Text style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant, marginVertical: 20, fontSize: 12.5 }}>
              No matches found
            </Text>
          )}
        </View>
      ) : (
        // Grouped IA View
        <View>
          {renderSectionHeader('FINANCES')}
          {renderMenuItem('index', 'Dashboard', 'view-dashboard')}
          {renderMenuItem('insights', 'Insights', 'lightbulb-on')}
          {renderMenuItem('feed', 'Wealth Feed', 'newspaper-variant-outline')}
          {renderMenuItem('assets', 'Assets', 'chart-line')}
          {renderMenuItem('expenses', 'Expenses', 'cash-multiple')}
          {renderMenuItem('loans', 'Loans', 'bank')}
          {renderMenuItem('goals', 'Goals', 'flag-checkered')}
          {renderMenuItem('recap', 'Wealth Recap', 'calendar-star')}
          {renderMenuItem('history', 'History', 'history')}
          {renderMenuItem('retirement', 'Retirement', 'island')}
          {renderMenuItem('reports', 'Reports', 'file-chart')}

          <Divider style={{ marginVertical: 6, marginHorizontal: 12, opacity: 0.3 }} />
          
          {renderSectionHeader('SECURITY')}
          {renderMenuItem('vault', 'Secure Vault', 'lock', vaultCount > 0 ? `${vaultCount} credentials secured` : 'Encrypted')}
          {renderMenuItem('protect', 'Insurance', 'shield-check', policyCount > 0 ? `${policyCount} policies active` : 'No policies')}
          {renderActionItem(logout, 'Lock App', 'lock-outline')}

          <Divider style={{ marginVertical: 6, marginHorizontal: 12, opacity: 0.3 }} />

          {renderSectionHeader('ACCOUNT')}
          {profiles.length > 1 && renderActionItem(logout, 'Switch Profile', 'account-switch')}
          {renderMenuItem('settings', 'Settings', 'cog')}
          
          <View style={{ marginVertical: 6 }}>
            {/* Elegant Appearance Control */}
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              paddingHorizontal: 12, 
              paddingVertical: 6,
              marginHorizontal: 12,
              borderRadius: 8,
              backgroundColor: theme.colors.surfaceVariant + '30',
              borderWidth: 1,
              borderColor: theme.colors.outlineVariant,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="theme-light-dark" size={16} color={theme.colors.onSurfaceVariant} />
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: theme.colors.onSurface }}>Appearance</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 2 }}>
                {(['light', 'dark', 'system'] as const).map((mode) => {
                  const isActive = themeMode === mode;
                  const iconName = mode === 'light' ? 'white-balance-sunny' : mode === 'dark' ? 'weather-night' : 'autorenew';
                  return (
                    <BouncePressable
                      key={mode}
                      onPress={() => setThemeMode(mode)}
                      style={{
                        padding: 5,
                        borderRadius: 6,
                        backgroundColor: isActive ? theme.colors.primary : 'transparent',
                      }}
                    >
                      <MaterialCommunityIcons 
                        name={iconName} 
                        size={12} 
                        color={isActive ? theme.colors.background : theme.colors.onSurfaceVariant} 
                      />
                    </BouncePressable>
                  );
                })}
              </View>
            </View>
          </View>

          <Divider style={{ marginVertical: 6, marginHorizontal: 12, opacity: 0.3 }} />

          {renderSectionHeader('DANGER ZONE')}
          {renderActionItem(() => setDeleteConfirmOpen(true), 'Delete Profile', 'delete', true)}
        </View>
      )}

      {/* Delete Confirmation Dialog Portal */}
      <Portal>
        <Dialog visible={deleteConfirmOpen} onDismiss={() => setDeleteConfirmOpen(false)} style={{ borderRadius: theme.roundness || 8 }}>
          <Dialog.Title style={{ fontWeight: '700' }}>Delete Profile?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Are you sure you want to delete this profile? This will permanently erase all assets, goals, loans, and settings associated with this profile. This action cannot be undone.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button 
              textColor={theme.colors.error} 
              onPress={async () => {
                setDeleteConfirmOpen(false);
                await logoutAndReset();
              }}
            >
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </DrawerContentScrollView>
  );
};

const SignupScreen: React.FC = () => {
  const { signUp, profiles, setIsRegistering } = useApp();
  const theme = useTheme();

  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [income, setIncome] = useState('');
  const [dob, setDob] = useState('');
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const [riskProfile, setRiskProfile] = useState('moderate');
  const [vaultLockMode, setVaultLockMode] = useState<'biometric' | 'password'>('password');
  const [seedDemo, setSeedDemo] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;

  const transitionToStep = (nextStep: number) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(translateYAnim, {
        toValue: -8,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setStep(nextStep);
      translateYAnim.setValue(12);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const handleNext = () => {
    setError(null);
    if (step === 1) {
      if (!name.trim()) {
        setError('Full Name is required');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid email address');
        return;
      }
      if (!password || password.length < 4) {
        setError('Master Password must be at least 4 characters');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      transitionToStep(2);
    } else if (step === 2) {
      const parsedIncome = parseFloat(income);
      if (isNaN(parsedIncome) || parsedIncome <= 0) {
        setError('Please enter a valid monthly income');
        return;
      }
      transitionToStep(3);
    }
  };

  const handleRegister = async () => {
    setError(null);
    setLoading(true);

    const numericIncome = parseFloat(income) || 0;
    
    setTimeout(async () => {
      const success = await signUp(
        name.trim(),
        email.trim(),
        password,
        numericIncome,
        riskProfile,
        vaultLockMode,
        seedDemo,
        dob || undefined
      );
      setLoading(false);
      if (!success) {
        setError('Signup failed. Please try again.');
      }
    }, 100);
  };

  const riskProfiles = [
    { value: 'conservative', label: 'Conservative', desc: 'Focus on stability & capital preservation', icon: 'shield-outline' },
    { value: 'moderate', label: 'Moderate', desc: 'Balanced growth with controlled volatility', icon: 'scale-balance' },
    { value: 'aggressive', label: 'Aggressive', desc: 'Maximize returns with high volatility tolerance', icon: 'trending-up' },
  ];

  const lockModes = [
    { value: 'password', label: 'Master Password', icon: 'lock-outline', desc: 'Require password entry on lock' },
    { value: 'biometric', label: 'Biometrics', icon: 'fingerprint', desc: 'Quick Face ID or Fingerprint unlock' },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView contentContainerStyle={{ padding: 24, paddingVertical: 48, flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ maxWidth: 460, width: '100%', alignSelf: 'center' }}>
          
          {/* Onboarding Welcome Header */}
          <View style={{ alignItems: 'center', marginBottom: 28 }}>
            <View style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: theme.dark ? '#1a1d26' : '#ffffff',
              borderWidth: 1.5,
              borderColor: theme.colors.primary,
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 12,
              shadowColor: theme.colors.primary,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: theme.dark ? 0.3 : 0.08,
              shadowRadius: 4,
              elevation: 3,
            }}>
              <MaterialCommunityIcons name="wallet-outline" size={32} color={theme.colors.primary} />
            </View>
            <Text variant="headlineSmall" style={{ fontWeight: '900', textAlign: 'center', marginBottom: 4, color: theme.colors.primary }}>
              Create Your FinVault
            </Text>
            <Text variant="bodyMedium" style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant, paddingHorizontal: 16 }}>
              Set up your secure, offline-first wealth manager
            </Text>
          </View>

          {/* Progress Tracker bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 32, paddingHorizontal: 4 }}>
            {[1, 2, 3].map((s) => (
              <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: step === s ? theme.colors.primary : s < step ? theme.colors.primary + '55' : theme.colors.outlineVariant }} />
            ))}
          </View>

          {/* Animated Wizard Content */}
          <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: translateYAnim }] }}>
            {step === 1 ? (
              <View>
                <Text variant="titleMedium" style={{ fontWeight: '700', marginBottom: 16, color: theme.colors.primary, textAlign: 'center' }}>
                  Step 1: Security Credentials
                </Text>
                
                <TextInput
                  label="Full Name"
                  value={name}
                  onChangeText={setName}
                  mode="outlined"
                  style={{ marginBottom: 12 }}
                  left={<TextInput.Icon icon="account" />}
                />

                <TextInput
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  mode="outlined"
                  style={{ marginBottom: 12 }}
                  left={<TextInput.Icon icon="email" />}
                />

                <TextInput
                  label="Master Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  mode="outlined"
                  style={{ marginBottom: 12 }}
                  left={<TextInput.Icon icon="lock" />}
                />

                <TextInput
                  label="Confirm Master Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                  mode="outlined"
                  style={{ marginBottom: 20 }}
                  left={<TextInput.Icon icon="lock-check" />}
                />
              </View>
            ) : step === 2 ? (
              <View>
                <Text variant="titleMedium" style={{ fontWeight: '700', marginBottom: 16, color: theme.colors.primary, textAlign: 'center' }}>
                  Step 2: Financial Foundation
                </Text>

                <TextInput
                  label="Monthly Income (INR)"
                  value={income}
                  onChangeText={setIncome}
                  keyboardType="numeric"
                  mode="outlined"
                  style={{ marginBottom: 12 }}
                  left={<TextInput.Icon icon="currency-inr" />}
                />

                <Pressable onPress={() => setDobPickerOpen(true)}>
                  <TextInput
                    label="Date of Birth (optional)"
                    value={dob}
                    mode="outlined"
                    editable={false}
                    pointerEvents="none"
                    style={{ marginBottom: 20 }}
                    left={<TextInput.Icon icon="cake-variant-outline" />}
                    right={<TextInput.Icon icon="calendar" onPress={() => setDobPickerOpen(true)} />}
                    placeholder="YYYY-MM-DD"
                  />
                </Pressable>

                {dobPickerOpen && (
                  <DateTimePicker
                    value={dob ? new Date(dob + 'T00:00:00') : new Date(new Date().getFullYear() - 25, 0, 1)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    maximumDate={new Date()}
                    onChange={(_e, selected) => {
                      setDobPickerOpen(Platform.OS === 'ios');
                      if (selected) {
                        const y = selected.getFullYear();
                        const m = String(selected.getMonth() + 1).padStart(2, '0');
                        const d = String(selected.getDate()).padStart(2, '0');
                        setDob(`${y}-${m}-${d}`);
                      }
                    }}
                  />
                )}

                <Text variant="labelLarge" style={{ fontWeight: '700', marginBottom: 12, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                  Select Your Risk Profile
                </Text>

                {riskProfiles.map((p) => {
                  const isSelected = riskProfile === p.value;
                  return (
                    <BouncePressable key={p.value} onPress={() => setRiskProfile(p.value)}>
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 14,
                        borderRadius: theme.roundness || 8,
                        borderWidth: 1.5,
                        borderColor: isSelected ? theme.colors.primary : theme.colors.outlineVariant,
                        backgroundColor: isSelected ? theme.colors.primaryContainer + '0F' : theme.colors.surface,
                        marginBottom: 12,
                        gap: 12,
                      }}>
                        <MaterialCommunityIcons
                          name={p.icon as any}
                          size={24}
                          color={isSelected ? theme.colors.primary : theme.colors.onSurfaceVariant}
                        />
                        <View style={{ flex: 1 }}>
                          <Text variant="titleSmall" style={{ fontWeight: '700', color: isSelected ? theme.colors.primary : theme.colors.onSurface }}>
                            {p.label}
                          </Text>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {p.desc}
                          </Text>
                        </View>
                      </View>
                    </BouncePressable>
                  );
                })}
              </View>
            ) : (
              <View>
                <Text variant="titleMedium" style={{ fontWeight: '700', marginBottom: 16, color: theme.colors.primary, textAlign: 'center' }}>
                  Step 3: Security & Data Setup
                </Text>

                <Text variant="labelLarge" style={{ fontWeight: '700', marginBottom: 12, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                  Select Lock Mode
                </Text>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
                  {lockModes.map((lm) => {
                    const isSelected = vaultLockMode === lm.value;
                    return (
                      <BouncePressable key={lm.value} onPress={() => setVaultLockMode(lm.value as any)} style={{ flex: 1, minWidth: 0 }}>
                        <View style={{
                          paddingVertical: 14,
                          paddingHorizontal: 8,
                          borderRadius: theme.roundness || 8,
                          borderWidth: 1.5,
                          borderColor: isSelected ? theme.colors.primary : theme.colors.outlineVariant,
                          backgroundColor: isSelected ? theme.colors.primaryContainer + '0F' : theme.colors.surface,
                          alignItems: 'center',
                          gap: 6,
                          justifyContent: 'center',
                        }}>
                          <MaterialCommunityIcons
                            name={lm.icon as any}
                            size={24}
                            color={isSelected ? theme.colors.primary : theme.colors.onSurfaceVariant}
                          />
                          <Text
                            numberOfLines={2}
                            style={{
                              fontWeight: '700',
                              textAlign: 'center',
                              fontSize: 12,
                              lineHeight: 16,
                              color: isSelected ? theme.colors.primary : theme.colors.onSurface,
                            }}
                          >
                            {lm.label}
                          </Text>
                          <Text
                            numberOfLines={2}
                            style={{ textAlign: 'center', fontSize: 10, lineHeight: 13, color: theme.colors.onSurfaceVariant }}
                          >
                            {lm.desc}
                          </Text>
                        </View>
                      </BouncePressable>
                    );
                  })}
                </View>

                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: theme.colors.surface,
                  borderWidth: 1,
                  borderColor: theme.colors.outline,
                  padding: 16,
                  borderRadius: theme.roundness || 8,
                  marginBottom: 20,
                }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.primary }}>Populate Demo Portfolio?</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>Pre-fill with realistic assets, loans, goals, and policies.</Text>
                  </View>
                  <Switch value={seedDemo} onValueChange={setSeedDemo} />
                </View>
              </View>
            )}

            {error ? (
              <HelperText type="error" visible={!!error} style={{ marginBottom: 16, textAlign: 'center' }}>
                {error}
              </HelperText>
            ) : null}
          </Animated.View>

          {/* Wizard Navigation Footer */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, gap: 12 }}>
            {step > 1 ? (
              <BouncePressable onPress={() => transitionToStep(step - 1)} style={{ flex: 1 }}>
                <Button mode="outlined" style={{ borderRadius: theme.roundness || 8 }}>
                  Back
                </Button>
              </BouncePressable>
            ) : profiles.length > 0 ? (
              <BouncePressable onPress={() => setIsRegistering(false)} style={{ flex: 1 }}>
                <Button mode="outlined" style={{ borderRadius: theme.roundness || 8 }}>
                  Cancel
                </Button>
              </BouncePressable>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            {step < 3 ? (
              <BouncePressable onPress={handleNext} style={{ flex: 1 }}>
                <Button mode="contained" style={{ borderRadius: theme.roundness || 8 }}>
                  Continue
                </Button>
              </BouncePressable>
            ) : loading ? (
              <ActivityIndicator size="small" style={{ flex: 1 }} />
            ) : (
              <BouncePressable onPress={handleRegister} style={{ flex: 1 }}>
                <Button mode="contained" style={{ borderRadius: theme.roundness || 8 }}>
                  Get Started
                </Button>
              </BouncePressable>
            )}
          </View>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const LockScreen: React.FC = () => {
  const { loginWithPassword, loginWithBiometrics, userId, profiles, switchUser, setIsRegistering } = useApp();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(profiles.length > 1);

  const theme = useTheme();
  const user = userId ? first<{ full_name: string }>('SELECT full_name FROM users WHERE id = ?', [userId]) : null;

  // Stagger entry animations
  const anim0 = useRef(new Animated.Value(0)).current;
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;

  // Pulse animation for lock icon glow
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (showProfileSwitcher) return;

    // 1. Trigger auto biometrics
    const autoAuth = async () => {
      await new Promise(r => setTimeout(r, 600));
      await loginWithBiometrics();
    };
    autoAuth();

    // 2. Stagger element entrances
    Animated.stagger(75, [
      Animated.timing(anim0, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(anim1, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(anim2, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();

    // 3. Pulse shield lock icon glow
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, [showProfileSwitcher, userId]);

  const handlePasswordUnlock = async () => {
    if (!password) return;
    setLoading(true);
    setError(null);
    const success = await loginWithPassword(password);
    setLoading(false);
    if (!success) {
      setError('Incorrect Master Password');
    }
  };

  const createAnimatedStyle = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.97, 1],
        }),
      },
    ],
  });

  if (showProfileSwitcher) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center' }}>
          <View style={{ maxWidth: 460, width: '100%', alignSelf: 'center' }}>
            
            <View style={{ alignItems: 'center', marginBottom: 32 }}>
              <View style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: theme.colors.surfaceVariant,
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 16,
              }}>
                <MaterialCommunityIcons name="wallet-outline" size={36} color={theme.colors.primary} />
              </View>
              <Text variant="headlineMedium" style={{ fontWeight: '900', color: theme.colors.onBackground, textAlign: 'center' }}>
                Select Profile
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center' }}>
                Choose a profile to access your secure vault
              </Text>
            </View>

            {profiles.map((p) => {
              const isCurrent = p.id === userId;
              const initial = p.name ? p.name.trim().charAt(0).toUpperCase() : '?';
              return (
                <BouncePressable
                  key={p.id}
                  onPress={async () => {
                    await switchUser(p.id);
                    setShowProfileSwitcher(false);
                    setPassword('');
                    setError(null);
                  }}
                  style={{ marginBottom: 12 }}
                >
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 16,
                    borderRadius: theme.roundness || 12,
                    borderWidth: 1.5,
                    borderColor: isCurrent ? theme.colors.primary : theme.colors.outlineVariant,
                    backgroundColor: isCurrent ? theme.colors.primaryContainer + '0D' : theme.colors.surface,
                    gap: 16,
                  }}>
                    <View style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: theme.colors.primaryContainer,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.onPrimaryContainer }}>
                        {initial}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                        {p.name}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {p.email}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
                  </View>
                </BouncePressable>
              );
            })}

            <BouncePressable
              onPress={() => setIsRegistering(true)}
              style={{ marginTop: 8 }}
            >
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                borderRadius: theme.roundness || 12,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: theme.colors.primary,
                backgroundColor: 'transparent',
                gap: 12,
              }}>
                <MaterialCommunityIcons name="account-plus-outline" size={24} color={theme.colors.primary} />
                <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.primary }}>
                  Add New Profile
                </Text>
              </View>
            </BouncePressable>

          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: theme.colors.background }}>
      <Animated.View style={[{ alignItems: 'center', marginBottom: 40 }, createAnimatedStyle(anim0)]}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: 24 }}>
          <View style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: theme.colors.surfaceVariant,
            borderWidth: 1,
            borderColor: theme.colors.outline,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <MaterialCommunityIcons name="shield-key" size={44} color={theme.colors.primary} />
          </View>
        </Animated.View>
        <Text variant="headlineMedium" style={{ fontWeight: '700', color: theme.colors.onBackground, textAlign: 'center' }}>
          FinVault Locked
        </Text>
        <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
          Welcome back, {user?.full_name || 'User'}
        </Text>
      </Animated.View>

      <Animated.View style={createAnimatedStyle(anim1)}>
        <TextInput
          label="Master Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          mode="outlined"
          style={{ marginBottom: 12, backgroundColor: theme.colors.surface }}
          left={<TextInput.Icon icon="lock" color={theme.colors.onSurfaceVariant} />}
        />
      </Animated.View>

      <Animated.View style={createAnimatedStyle(anim2)}>
        {error ? (
          <HelperText type="error" visible={!!error} style={{ marginBottom: 12, textAlign: 'center', color: theme.colors.error }}>
            {error}
          </HelperText>
        ) : null}

        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 12 }} />
        ) : (
          <BouncePressable onPress={handlePasswordUnlock} style={{ marginBottom: 12 }}>
            <Button
              mode="contained"
              pointerEvents="none"
              buttonColor={theme.colors.primary}
              textColor={theme.colors.background}
              style={{ borderRadius: theme.roundness }}
            >
              Unlock with Password
            </Button>
          </BouncePressable>
        )}

        <BouncePressable onPress={loginWithBiometrics}>
          <Button
            mode="text"
            pointerEvents="none"
            textColor={theme.colors.primary}
            icon="fingerprint"
            style={{ marginTop: 8, borderRadius: theme.roundness }}
          >
            Use Fingerprint / Face ID
          </Button>
        </BouncePressable>

        {profiles.length > 1 ? (
          <BouncePressable onPress={() => setShowProfileSwitcher(true)} style={{ marginTop: 8 }}>
            <Button
              mode="text"
              pointerEvents="none"
              textColor={theme.colors.onSurfaceVariant}
              icon="account-switch"
              style={{ borderRadius: theme.roundness }}
            >
              Switch Profile
            </Button>
          </BouncePressable>
        ) : (
          <BouncePressable onPress={() => setIsRegistering(true)} style={{ marginTop: 8 }}>
            <Button
              mode="text"
              pointerEvents="none"
              textColor={theme.colors.onSurfaceVariant}
              icon="account-plus-outline"
              style={{ borderRadius: theme.roundness }}
            >
              Add New Profile
            </Button>
          </BouncePressable>
        )}
      </Animated.View>
    </SafeAreaView>
  );
};

const Navigator: React.FC = () => {
  const { isDark, isRegistered, isRegistering, isAuthenticated, ready } = useApp();
  const theme = isDark ? darkTheme : lightTheme;

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // Intercept if not registered or actively registering a new profile
  if (!isRegistered || isRegistering) {
    return (
      <PaperProvider theme={theme} settings={paperIconSettings}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SignupScreen />
      </PaperProvider>
    );
  }

  // Intercept if registered but not logged in
  if (!isAuthenticated) {
    return (
      <PaperProvider theme={theme} settings={paperIconSettings}>
        <StatusBar style="light" />
        <LockScreen />
      </PaperProvider>
    );
  }

  return (
    <PaperProvider theme={theme} settings={paperIconSettings}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Drawer
        drawerContent={(p) => <CustomDrawer {...p} />}
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerTitleStyle: { fontWeight: '700', fontSize: 18 },
          drawerActiveTintColor: theme.colors.primary,
          drawerActiveBackgroundColor: theme.colors.surfaceVariant,
          drawerInactiveTintColor: theme.colors.onSurfaceVariant,
          drawerStyle: { backgroundColor: theme.colors.surface, width: 280 },
          sceneStyle: { backgroundColor: theme.colors.background },
          // Default quick-access theme toggle for screens that don't set their
          // own headerRight (Reports, Vault, Settings). Screens with a
          // NotificationBell add the toggle to the left of the bell themselves.
          headerRight: () => <ThemeToggle color={theme.colors.onSurface} />,
        }}
      >
        <Drawer.Screen name="index" options={{ title: 'Dashboard', drawerIcon: drawerIcon('view-dashboard') }} />
        <Drawer.Screen name="insights" options={{ title: 'Insights', drawerIcon: drawerIcon('lightbulb-on') }} />
        <Drawer.Screen name="feed" options={{ title: 'Wealth Feed', drawerIcon: drawerIcon('newspaper-variant-outline') }} />
        <Drawer.Screen name="assets" options={{ title: 'Assets', drawerIcon: drawerIcon('chart-line'), headerShown: false }} />
        <Drawer.Screen name="expenses" options={{ title: 'Expenses', drawerIcon: drawerIcon('cash-multiple') }} />
        <Drawer.Screen name="loans" options={{ title: 'Loans', drawerIcon: drawerIcon('bank') }} />
        <Drawer.Screen name="protect" options={{ title: 'Protect', drawerIcon: drawerIcon('shield-check') }} />
        <Drawer.Screen name="goals" options={{ title: 'Goals', drawerIcon: drawerIcon('flag-checkered'), headerShown: false }} />
        <Drawer.Screen name="vault" options={{ title: 'Vault', drawerIcon: drawerIcon('lock') }} />
        <Drawer.Screen name="reports" options={{ title: 'Reports', drawerIcon: drawerIcon('file-chart') }} />
        <Drawer.Screen name="recap" options={{ title: 'Wealth Recap', drawerIcon: drawerIcon('calendar-star') }} />
        <Drawer.Screen name="history" options={{ title: 'History', drawerIcon: drawerIcon('history') }} />
        <Drawer.Screen name="retirement" options={{ title: 'Retirement', drawerIcon: drawerIcon('island') }} />
        <Drawer.Screen name="settings" options={{ title: 'Settings', drawerIcon: drawerIcon('cog') }} />
      </Drawer>
    </PaperProvider>
  );
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <Navigator />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 16, paddingTop: 24, alignItems: 'flex-start' },
});
