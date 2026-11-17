import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Keychain / Keystore key of this install's attendance device id (shared with the check-in binding). */
export const DEVICE_ID_KEY = 'hrm.attendance.deviceId';

export interface DeviceIdentity {
  deviceId: string;
  platform: 'IOS' | 'ANDROID';
  model?: string;
}

const randomId = () => `${Date.now().toString(36)}-${Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join('')}`;

/**
 * Stable id of this app install (FR-ATT-11.1): created once and kept in secure storage, so it survives restarts
 * but not a reinstall — a new install is a "new device" that goes through the change request (FR-ATT-11.2).
 */
export const getDeviceIdentity = async (): Promise<DeviceIdentity> => {
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = randomId();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  }
  const constants = Platform.constants as { Brand?: string; Model?: string };
  const model = [constants.Brand, constants.Model].filter(Boolean).join(' ') || undefined;
  return { deviceId, platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID', model };
};
