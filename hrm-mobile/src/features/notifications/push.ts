import { NOTIFICATIONS_ROUTE, resolveNotificationLink, type MobileLinkRoute, type PushPlatform } from '@hrm/shared';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { LogBox, Platform } from 'react-native';
import { apiFetch } from '@/lib/api';

/**
 * Mobile push (FR-NOTI-01.1) and push deep links (FR-NOTI-04.2).
 *
 * Push needs an EAS project id in the app config (`extra.eas.projectId`, from EAS_PROJECT_ID at build
 * time) plus FCM / APNs credentials in that EAS project — see README "Push notifications". Without a
 * project id (Jest, Maestro debug builds, local dev) nothing here asks for permission or calls Expo; a
 * missing credential at runtime is logged once and ignored. Push is never required to use the app.
 */

/** EAS project id the Expo push token is issued for, or null when the build has none. */
export const easProjectId = (): string | null => {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id.length > 0 ? id : null;
};

/** Push is attempted only on a native build that carries an EAS project id. */
export const isPushConfigured = (): boolean => Platform.OS !== 'web' && easProjectId() !== null;

let loggedUnavailable = false;
const UNAVAILABLE_PREFIX = '[push] not available';
// Missing push credentials is an expected setup state: keep the console warning, but not the dev-build
// LogBox toast, which would cover the tab bar.
LogBox.ignoreLogs([UNAVAILABLE_PREFIX]);

/** Explain once per app run why push is off; never shown to the user. */
const logUnavailable = (reason: string, err?: unknown) => {
  if (loggedUnavailable) return;
  loggedUnavailable = true;
  console.warn(`${UNAVAILABLE_PREFIX} (${reason})`, err instanceof Error ? err.message : (err ?? ''));
};

/** Token registered with the API for the signed-in user on this device (removed again on sign-out). */
let registeredToken: string | null = null;

/** Test hook: forget the module state between tests. */
export const resetPushStateForTests = () => {
  loggedUnavailable = false;
  registeredToken = null;
};

export type PushRegistration =
  | { status: 'registered'; token: string }
  | { status: 'denied' }
  | { status: 'unavailable'; reason: 'not_configured' | 'token_unavailable' };

const platform = (): PushPlatform => (Platform.OS === 'ios' ? 'IOS' : 'ANDROID');

/**
 * Ask for notification permission (only if the user was never asked), get this device's Expo push
 * token and register it with `/me/push-tokens`. Called once the user is signed in and in the app.
 */
export const registerForPushAsync = async (): Promise<PushRegistration> => {
  const projectId = easProjectId();
  if (Platform.OS === 'web' || !projectId) {
    logUnavailable('no EAS projectId');
    return { status: 'unavailable', reason: 'not_configured' };
  }
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'SOM HRM', importance: Notifications.AndroidImportance.HIGH });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await apiFetch('/me/push-tokens', { method: 'POST', body: { token, platform: platform() } });
    registeredToken = token;
    return { status: 'registered', token };
  } catch (err) {
    // Typically missing FCM / APNs credentials ("Default FirebaseApp is not initialized"), a simulator, or offline.
    logUnavailable('push token', err);
    return { status: 'unavailable', reason: 'token_unavailable' };
  }
};

/**
 * Remove this device's token from the signed-in account (sign-out). Starts the request right away so it
 * still carries the current session; never throws.
 */
export const unregisterPushToken = (): Promise<void> => {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return Promise.resolve();
  return apiFetch<void>(`/me/push-tokens/${encodeURIComponent(token)}`, { method: 'DELETE' }).catch(() => undefined);
};

/** Screen a tapped push opens: its `data.link` through the shared mapping, else the notification list. */
export const routeForPushData = (data: unknown): MobileLinkRoute => {
  const link = data && typeof data === 'object' && 'link' in data && typeof data.link === 'string' ? data.link : null;
  return resolveNotificationLink(link, 'mobile') ?? NOTIFICATIONS_ROUTE;
};

/** The in-app notification id carried by a push (`data.notificationId`), if any. */
export const notificationIdOf = (data: unknown): string | null =>
  data && typeof data === 'object' && 'notificationId' in data && typeof data.notificationId === 'string' ? data.notificationId : null;
