import { MaterialIcons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '@/lib/i18n';

/** Global banner shown whenever the device has no connectivity. */
export function OfflineBanner() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const net = useNetInfo();
  // isConnected is null while unknown — only warn when definitely offline.
  if (net.isConnected !== false) return null;
  return (
    <View testID="offline-banner" style={{ paddingTop: insets.top }} className="absolute inset-x-0 top-0 z-50 bg-warning">
      <View className="flex-row items-center gap-2 px-4 py-2">
        <MaterialIcons name="wifi-off" size={18} color="#fff" />
        <Text className="flex-1 text-sm font-medium text-white">{t('state.offline.title')}</Text>
      </View>
    </View>
  );
}
