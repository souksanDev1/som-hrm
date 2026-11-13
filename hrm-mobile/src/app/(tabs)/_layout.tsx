import { MaterialIcons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useMe } from '@/features/auth/hooks';
import { useAuthStore } from '@/features/auth/store';
import { useT } from '@/lib/i18n';

type IconName = keyof typeof MaterialIcons.glyphMap;
const icon = (name: IconName) => ({ color, size }: { color: string; size: number }) => <MaterialIcons name={name} color={color} size={size} />;

export default function TabsLayout() {
  const t = useT();
  const token = useAuthStore((s) => s.accessToken);
  const { width } = useWindowDimensions();
  useMe();
  if (!token) return <Redirect href="/login" />;
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
