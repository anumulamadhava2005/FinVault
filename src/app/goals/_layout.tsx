import { Stack } from 'expo-router';
import { useApp } from '@/context/AppContext';
import { darkTheme, lightTheme } from '@/theme';

export default function GoalsLayout() {
  const { isDark } = useApp();
  const theme = isDark ? darkTheme : lightTheme;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.onSurface,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'Goal Details' }} />
      <Stack.Screen name="[id]/edit" options={{ title: 'Edit Goal', presentation: 'modal' }} />
    </Stack>
  );
}
