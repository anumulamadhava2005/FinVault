import { Pressable } from 'react-native';
import { Stack, useNavigation } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';
import { darkTheme, lightTheme } from '@/theme';
import NotificationBell from '@/components/NotificationBell';

export default function GoalsLayout() {
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
          title: 'Goals',
          headerLeft: () => (
            <Pressable onPress={() => drawerNav.openDrawer()} style={{ marginRight: 12 }}>
              <MaterialCommunityIcons name="menu" size={24} color={theme.colors.onSurface} />
            </Pressable>
          ),
          headerRight: () => (
            <NotificationBell
              color={theme.colors.onSurface}
              kinds={['goal_completed', 'goal_deadline', 'goal_behind', 'goal_overdue']}
            />
          ),
        }}
      />
      <Stack.Screen name="[id]" options={{ title: 'Goal Details' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Edit Goal', presentation: 'modal' }} />
    </Stack>
  );
}
