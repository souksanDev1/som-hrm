import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';
import { homeRouteFor, useMe } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { useT } from '@/lib/i18n';
import { useHydration } from '@/lib/use-hydration';

type IconName = keyof typeof MaterialIcons.glyphMap;
const icon = (name: IconName) => ({ color, size }: { color: string; size: number }) => <MaterialIcons name={name} color={color} size={size} />;

export default function TabsLayout() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const { width } = useWindowDimensions();
  const hydrated = useHydration();
  const me = useMe();
  // Wait for SecureStore before deciding (a cold start briefly has no token in memory).
  if (!hydrated || (token && !user && me.isPending)) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#1F5FD6" />
      </View>
    );
  }
  if (!token) return <Redirect href="/login" />;
  // Re-checked on every app start from /auth/me, so restarting cannot skip the setup (FR-AUTH-03.2).
  const target = homeRouteFor(user);
  if (target !== '/home') return <Redirect href={target} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1F5FD6',
        tabBarInactiveTintColor: '#667085',
        // Tablets/landscape: label beside icon to use the extra width.
        tabBarLabelPosition: width >= 768 ? 'beside-icon' : 'below-icon',
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('nav.dashboard'), tabBarIcon: icon('home'), tabBarButtonTestID: 'tab-home' }} />
      <Tabs.Screen name="org" options={{ title: t('nav.org'), tabBarIcon: icon('account-tree'), tabBarButtonTestID: 'tab-org' }} />
      <Tabs.Screen name="notifications" options={{ title: t('nav.notifications'), tabBarIcon: icon('notifications-none'), tabBarButtonTestID: 'tab-notifications' }} />
      <Tabs.Screen name="profile" options={{ title: t('nav.profile'), tabBarIcon: icon('person-outline'), tabBarButtonTestID: 'tab-profile' }} />
    </Tabs>
  );
}
