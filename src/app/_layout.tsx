import 'react-native-gesture-handler';
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider, Avatar, Divider, SegmentedButtons, Text } from 'react-native-paper';
import { Drawer, DrawerContentScrollView, DrawerItemList } from 'expo-router/drawer';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppProvider, useApp } from '@/context/AppContext';
import { darkTheme, lightTheme, palette } from '@/theme';
import { first } from '@/db';

const paperIconSettings = {
  icon: (props: any) => <MaterialCommunityIcons {...props} />,
};

const drawerIcon =
  (name: string) =>
  ({ color, size }: { color: any; size: number }) =>
    <MaterialCommunityIcons name={name as any} color={color} size={size} />;

const CustomDrawer = (props: any) => {
  const { userId, themeMode, setThemeMode, isDark } = useApp();
  const theme = isDark ? darkTheme : lightTheme;
  const user = first<{ full_name: string; email: string }>('SELECT full_name, email FROM users WHERE id = ?', [userId]);
  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 0 }}>
      <View style={[styles.header, { backgroundColor: theme.colors.primary }]}>
        <Avatar.Text size={48} label={(user?.full_name || 'U').slice(0, 1)} />
        <Text variant="titleMedium" style={{ color: theme.colors.onPrimary, marginTop: 8, fontWeight: '800' }}>
          {user?.full_name || 'FinVault'}
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onPrimary, opacity: 0.85 }}>
          {user?.email || ''}
        </Text>
      </View>
      <View style={{ paddingTop: 8 }}>
        <DrawerItemList {...props} />
      </View>
      <Divider style={{ marginVertical: 8 }} />
      <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
          APPEARANCE
        </Text>
        <SegmentedButtons
          value={themeMode}
          onValueChange={(v) => setThemeMode(v as any)}
          density="small"
          buttons={[
            { value: 'light', label: 'Light', icon: 'white-balance-sunny' },
            { value: 'dark', label: 'Dark', icon: 'weather-night' },
            { value: 'system', label: 'Auto', icon: 'theme-light-dark' },
          ]}
        />
      </View>
    </DrawerContentScrollView>
  );
};

const Navigator: React.FC = () => {
  const { isDark } = useApp();
  const theme = isDark ? darkTheme : lightTheme;
  return (
    <PaperProvider theme={theme} settings={paperIconSettings}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Drawer
        drawerContent={(p) => <CustomDrawer {...p} />}
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
          headerTitleStyle: { fontWeight: '800' },
          drawerActiveTintColor: palette.good,
          drawerInactiveTintColor: theme.colors.onSurfaceVariant,
          sceneStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Drawer.Screen name="index" options={{ title: 'Dashboard', drawerIcon: drawerIcon('view-dashboard') }} />
        <Drawer.Screen name="assets" options={{ title: 'Assets', drawerIcon: drawerIcon('chart-line') }} />
        <Drawer.Screen name="expenses" options={{ title: 'Expenses', drawerIcon: drawerIcon('cash-multiple') }} />
        <Drawer.Screen name="loans" options={{ title: 'Loans', drawerIcon: drawerIcon('bank') }} />
        <Drawer.Screen name="protect" options={{ title: 'Protect', drawerIcon: drawerIcon('shield-check') }} />
        <Drawer.Screen name="goals" options={{ title: 'Goals', drawerIcon: drawerIcon('flag-checkered') }} />
        <Drawer.Screen name="vault" options={{ title: 'Vault', drawerIcon: drawerIcon('lock') }} />
        <Drawer.Screen name="reports" options={{ title: 'Reports', drawerIcon: drawerIcon('file-chart') }} />
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
