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
// Icon fonts load asynchronously; render plain placeholders in tests.
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  const MaterialIcons = ({ name }: { name: string }) => <Text>{name}</Text>;
  MaterialIcons.glyphMap = {};
  return { MaterialIcons };
});
