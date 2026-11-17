/**
 * Extends app.json. Android release builds block plain HTTP, so cleartext is
 * allowed only when the build points at an http:// API (local/dev testing).
 * Production builds must use an https:// EXPO_PUBLIC_API_URL.
 *
 * Push notifications (FR-NOTI-01.1, see README "Push notifications") are configured from the build
 * environment, never committed: EAS_PROJECT_ID → `extra.eas.projectId` (the app enables push only when
 * it is set) and GOOGLE_SERVICES_FILE → the Firebase `google-services.json` path for Android.
 */
module.exports = ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  const allowCleartext = apiUrl.startsWith('http://');
  const easProjectId = process.env.EAS_PROJECT_ID;
  const googleServicesFile = process.env.GOOGLE_SERVICES_FILE;
  return {
    ...config,
    ...(easProjectId ? { extra: { ...config.extra, eas: { ...config.extra?.eas, projectId: easProjectId } } } : {}),
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
    plugins: [
      ...(config.plugins ?? []),
      ['expo-build-properties', { android: { usesCleartextTraffic: allowCleartext } }],
    ],
  };
};
