import { Pressable } from 'react-native';
import { Stack, useNavigation } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { darkTheme, lightTheme } from '@/theme';

export default function AssetsLayout() {
  const { isDark } = useApp();
  const theme = isDark ? darkTheme : lightTheme;
  const drawerNav = useNavigation('/') as any;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
        headerTitleStyle: { fontWeight: '800' },
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
        }}
      />
      <Stack.Screen name="[id]" options={{ title: 'Asset Details' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Edit Asset', presentation: 'modal' }} />
    </Stack>
  );
}
