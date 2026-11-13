import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '@/features/auth/store';
import { useHydration } from '@/lib/use-hydration';

/** Entry: wait for SecureStore, then route to login or the app. */
export default function Index() {
  const hydrated = useHydration();
  const token = useAuthStore((s) => s.accessToken);
  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#1F5FD6" />
      </View>
    );
  }
  return <Redirect href={token ? '/home' : '/login'} />;
}
