/**
 * Extends app.json. Android release builds block plain HTTP, so cleartext is
 * allowed only when the build points at an http:// API (local/dev testing).
 * Production builds must use an https:// EXPO_PUBLIC_API_URL.
 */
module.exports = ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  const allowCleartext = apiUrl.startsWith('http://');
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      ['expo-build-properties', { android: { usesCleartextTraffic: allowCleartext } }],
    ],
  };
};
