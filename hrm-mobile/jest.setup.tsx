import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';

jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));
// Native push module: inert by default (no permission, no token); push tests drive these mocks.
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: true, status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: false, status: 'denied' })),
  getExpoPushTokenAsync: jest.fn(async () => {
    throw new Error('not available in tests');
  }),
  setNotificationHandler: jest.fn(),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  scheduleNotificationAsync: jest.fn(async () => 'local-id'),
}));
// Icon fonts load asynchronously; render plain placeholders in tests.
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const MaterialIcons = ({ name }: { name: string }) => <Text>{name}</Text>;
  MaterialIcons.glyphMap = {};
  return { MaterialIcons };
});
// Check-in native modules (M5): inert defaults; check-in tests drive these mocks.
jest.mock('expo-application', () => ({ getAndroidId: jest.fn(() => 'test-android-id'), getIosIdForVendorAsync: jest.fn(async () => 'test-ios-id') }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn(async () => { throw new Error('expo-sqlite is not available in tests'); }) }));
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'denied' })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getCurrentPositionAsync: jest.fn(async () => {
    throw new Error('no location in tests');
  }),
  getLastKnownPositionAsync: jest.fn(async () => null),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
}));
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}));
// Rooted / jailbroken check (FR-ATT-10): not rooted by default; hardening tests drive this mock.
jest.mock('expo-device', () => ({ isRootedExperimentalAsync: jest.fn(async () => false) }));
