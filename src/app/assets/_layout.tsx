import { Pressable } from 'react-native';
import { Stack, useNavigation } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { darkTheme, lightTheme } from '@/theme';
import NotificationBell from '@/components/NotificationBell';

export default function AssetsLayout() {
  const { isDark } = useApp();
  const theme = isDark ? darkTheme : lightTheme;
  const drawerNav = useNavigation('/') as any;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Assets',
          headerLeft: () => (
            <Pressable onPress={() => drawerNav.openDrawer()} style={{ marginRight: 12 }}>
              <MaterialCommunityIcons name="menu" size={24} color={theme.colors.onSurface} />
            </Pressable>
          ),
          headerRight: () => (
            <NotificationBell
              color={theme.colors.onSurface}
              kinds={['sip_due', 'asset_gain', 'asset_loss', 'stale_price']}
            />
          ),
        }}
      />
      <Stack.Screen name="add" options={{ title: 'Add Asset' }} />
      <Stack.Screen name="[id]" options={{ title: 'Asset Details' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Edit Asset', presentation: 'modal' }} />
    </Stack>
  );
}
