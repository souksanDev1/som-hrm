import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '@/features/auth/store';
import { useHydration } from '@/lib/use-hydration';
import { isKioskVariant } from '@/lib/variant';

/** Entry: wait for SecureStore, then route to login or the app (the kiosk build goes to its own screens). */
export default function Index() {
  const hydrated = useHydration();
  const token = useAuthStore((s) => s.accessToken);
  if (isKioskVariant()) return <Redirect href="/kiosk" />;
  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#3B5BFD" />
      </View>
    );
  }
  return <Redirect href={token ? '/home' : '/login'} />;
}
