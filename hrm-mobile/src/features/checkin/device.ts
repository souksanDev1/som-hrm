import type { DeviceInfo } from '@hrm/shared';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** SecureStore key of the install's device id (same key as the device-change request screens). */
export const DEVICE_ID_KEY = 'hrm.attendance.deviceId';

/** Random RFC 4122 v4-style id (Hermes has no crypto.randomUUID). Used for clientRefs and the fallback device id. */
export const newId = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

let cached: DeviceInfo | null = null;

/** Test hook. */
export const resetDeviceInfoForTests = () => {
  cached = null;
};

/** OS install id (Android ID / iOS identifierForVendor), if the platform gives one. */
const osInstallId = async (): Promise<string | null> => {
  try {
    return (Platform.OS === 'android' ? Application.getAndroidId() : await Application.getIosIdForVendorAsync()) || null;
  } catch {
    return null;
  }
};

/**
 * This phone's identity for the attendance device binding (FR-ATT-11.1), used for the mobile login and every
 * punch batch. Generated once per install (from the OS install id, else random) and kept in SecureStore under
 * `DEVICE_ID_KEY`, shared with the device-change request screens. `null` on the web (no binding there).
 */
export const getDeviceInfo = async (): Promise<DeviceInfo | null> => {
  if (cached) return cached;
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = (await osInstallId()) ?? newId();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  }
  const model = Platform.OS === 'android' ? (Platform.constants as { Model?: string }).Model : undefined;
  cached = { deviceId, platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID', ...(model ? { model: model.slice(0, 120) } : {}) };
  return cached;
};
