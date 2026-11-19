/**
 * Extends app.json. Android release builds block plain HTTP, so cleartext is
 * allowed only when the build points at an http:// API (local/dev testing).
 * Production builds must use an https:// EXPO_PUBLIC_API_URL.
 *
 * Push notifications (FR-NOTI-01.1, see README "Push notifications") are configured from the build
 * environment, never committed: EAS_PROJECT_ID → `extra.eas.projectId` (the app enables push only when
 * it is set) and GOOGLE_SERVICES_FILE → the Firebase `google-services.json` path for Android.
 *
 * APP_VARIANT=kiosk builds the shared branch tablet app (FR-ATT-03): its own name, scheme and bundle/package id
 * (suffix `.kiosk`, so it installs beside the employee app); `extra.appVariant` routes it to the kiosk screens.
 */
module.exports = ({ config }) => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  const allowCleartext = apiUrl.startsWith('http://');
  const easProjectId = process.env.EAS_PROJECT_ID;
  const googleServicesFile = process.env.GOOGLE_SERVICES_FILE;
  const kiosk = process.env.APP_VARIANT === 'kiosk';
  const extra = {
    ...config.extra,
    appVariant: kiosk ? 'kiosk' : 'app',
    ...(easProjectId ? { eas: { ...config.extra?.eas, projectId: easProjectId } } : {}),
  };
  return {
    ...config,
    ...(kiosk
      ? {
          name: 'Tech Solutions Kiosk',
          scheme: 'somhrmkiosk',
          ios: { ...config.ios, bundleIdentifier: `${config.ios.bundleIdentifier}.kiosk` },
        }
      : {}),
    extra,
    android: {
      ...config.android,
      ...(kiosk ? { package: `${config.android.package}.kiosk` } : {}),
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      ['expo-build-properties', { android: { usesCleartextTraffic: allowCleartext } }],
    ],
  };
};
