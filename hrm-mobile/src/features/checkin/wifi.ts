import type { WifiObservation } from '@hrm/shared';
import NetInfo from '@react-native-community/netinfo';

/**
 * Wi-Fi the phone is on at capture (FR-ATT-12, SHOULD), sent with the punch so the server can compare it with the
 * branch's office networks. `null` = not on Wi-Fi; `undefined` = could not be read. Android reports the SSID /
 * BSSID only with the location permission the check-in already asks for; iOS needs the "Access Wi-Fi
 * Information" entitlement, so it usually reports nothing. The server decides what that means — the app never
 * blocks a punch on Wi-Fi.
 */
export const currentWifi = async (): Promise<WifiObservation | null | undefined> => {
  try {
    const state = await NetInfo.fetch();
    if (state.type !== 'wifi') return null;
    const details = (state.details ?? {}) as { ssid?: string | null; bssid?: string | null };
    return { ssid: details.ssid?.slice(0, 64) || null, bssid: details.bssid?.slice(0, 32) || null };
  } catch {
    return undefined;
  }
};
