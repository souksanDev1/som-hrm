import Constants from 'expo-constants';

/**
 * Build variant (app.config.js, `APP_VARIANT`): the employee app, or `kiosk` — a shared branch tablet with its own
 * app name and bundle id (FR-ATT-03). The normal app never shows the kiosk screens.
 */
export const appVariant = (): 'app' | 'kiosk' => ((Constants.expoConfig?.extra as { appVariant?: string } | undefined)?.appVariant === 'kiosk' ? 'kiosk' : 'app');

export const isKioskVariant = () => appVariant() === 'kiosk';
