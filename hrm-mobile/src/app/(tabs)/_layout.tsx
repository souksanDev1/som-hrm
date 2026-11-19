import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, router, Tabs } from 'expo-router';
import { ActivityIndicator, Pressable, useWindowDimensions, View } from 'react-native';
import { homeRouteFor, useMe } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { CheckinAutoSync } from '@/features/checkin/CheckinAutoSync';
import { useUnreadCount } from '@/features/notifications/api';
import { PushNotifications } from '@/features/notifications/PushNotifications';
import { useT } from '@/lib/i18n';
import { useHydration } from '@/lib/use-hydration';

type IconName = keyof typeof MaterialIcons.glyphMap;
const icon = (name: IconName) => ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
  <View style={{ width: 56, alignItems: 'center', paddingTop: 4, borderTopWidth: 3, borderTopColor: focused ? color : 'transparent' }}>
    <MaterialIcons name={name} color={color} size={size} />
  </View>
);

export default function TabsLayout() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const { width } = useWindowDimensions();
  const hydrated = useHydration();
  const me = useMe();
  // Keep inbox polling inside the authenticated app; the badge now lives in the home header.
  useUnreadCount(hydrated && !!token && !!user && homeRouteFor(user) === '/home');
  // Wait for SecureStore before deciding (a cold start briefly has no token in memory).
  if (!hydrated || (token && !user && me.isPending)) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#3B5BFD" />
      </View>
    );
  }
  if (!token) return <Redirect href="/login" />;
  // Re-checked on every app start from /auth/me, so restarting cannot skip the setup (FR-AUTH-03.2).
  const target = homeRouteFor(user);
  if (target !== '/home') return <Redirect href={target} />;
  return (
    <>
      {/* Signed in and past account setup: the moment to ask for push permission. */}
      <PushNotifications />
      {/* Offline check-in queue: sync on reconnect / foreground (FR-ATT-05). */}
      <CheckinAutoSync />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#3B5BFD',
          tabBarInactiveTintColor: '#64748B',
          // Tablets/landscape: label beside icon to use the extra width.
          tabBarLabelPosition: width >= 768 ? 'beside-icon' : 'below-icon',
          tabBarLabelStyle: { fontSize: 12, paddingBottom: 3 },
          tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: '#E9EDF3' },
          // No pressed highlight: drop Android's white ripple and iOS's opacity flash.
          tabBarButton: ({ ref: _ref, style, children, ...props }) => (
            <Pressable {...props} android_ripple={null} style={style}>{children}</Pressable>
          ),
        }}
      >
        <Tabs.Screen name="home" options={{ title: t('nav.dashboard'), tabBarIcon: icon('home'), tabBarButtonTestID: 'tab-home' }} />
        <Tabs.Screen
          name="leave-tab"
          options={{ title: t('nav.leave'), tabBarIcon: icon('event-busy'), tabBarButtonTestID: 'tab-leave' }}
          // Open the real /leave stack instead of the placeholder tab.
          listeners={{ tabPress: (e) => { e.preventDefault(); router.push('/leave'); } }}
        />
        {/* Org chart left the tab bar; it stays reachable from the home quick-access grid. */}
        <Tabs.Screen name="org" options={{ title: t('nav.org'), href: null }} />
        <Tabs.Screen
          name="notifications"
          options={{
            title: t('nav.notifications'),
            // The route and deep links remain intact; entry is now the top-right bell.
            href: null,
          }}
        />
        <Tabs.Screen name="checkin" options={{ title: t('nav.attendance'), tabBarIcon: icon('fingerprint'), tabBarButtonTestID: 'tab-checkin' }} />
        <Tabs.Screen name="profile" options={{ title: t('nav.profile'), tabBarIcon: icon('person-outline'), tabBarButtonTestID: 'tab-profile' }} />
      </Tabs>
    </>
  );
}
