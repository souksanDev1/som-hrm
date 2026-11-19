import { Image, View } from 'react-native';
import MARK from '../../../assets/logo-mark.png';
import FULL from '../../../assets/logo-full.png';

/** Brand "S" mark on a white tile (readable in light and dark mode). */
export function BrandMark({ size = 48 }: { size?: number }) {
  return (
    <View className="items-center justify-center rounded-md bg-white shadow-sm" style={{ width: size, height: size }}>
      <Image source={MARK} style={{ width: size * 0.78, height: size * 0.78 }} resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

/** Full Tech Solutions logo (mark + wordmark) on a white plate so the dark wordmark stays legible in dark mode. */
export function BrandLogo({ height = 120 }: { height?: number }) {
  return (
    <View className="items-center">
      <View className="rounded-lg px-4 py-2 dark:bg-white">
        <Image
          source={FULL}
          style={{ height, width: (height * 600) / 537 }}
          resizeMode="contain"
          accessibilityLabel="Tech Solutions HRM"
          accessibilityIgnoresInvertColors
          testID="brand-logo"
        />
      </View>
    </View>
  );
}
