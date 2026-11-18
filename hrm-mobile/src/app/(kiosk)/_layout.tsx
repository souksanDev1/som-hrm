import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useKioskHydration } from '@/features/kiosk/store';
import { isKioskVariant } from '@/lib/variant';

/** Kiosk route group (FR-ATT-03): only in the `APP_VARIANT=kiosk` build; the employee app never enters it. */
export default function KioskLayout() {
  const hydrated = useKioskHydration();
  if (!isKioskVariant()) return <Redirect href="/" />;
  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#1F5FD6" />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
