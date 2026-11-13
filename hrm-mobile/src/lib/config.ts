import { Platform } from 'react-native';

/**
 * API base URL. Set EXPO_PUBLIC_API_URL for devices/production. The Android
 * emulator reaches the host machine at 10.0.2.2 instead of localhost.
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000/api/v1' : 'http://localhost:4000/api/v1');
