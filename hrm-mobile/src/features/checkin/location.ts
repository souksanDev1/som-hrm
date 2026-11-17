import * as Location from 'expo-location';

/** One GPS reading as the check-in needs it. */
export interface Fix {
  latitude: number;
  longitude: number;
  accuracyMetres: number | null;
  /** The OS reported a mock provider (Android, FR-ATT-09). */
  mocked: boolean;
  at: number;
}

export type FixState =
  | { kind: 'locating' }
  | { kind: 'denied' }
  | { kind: 'off' }
  | { kind: 'error' }
  | { kind: 'ok'; fix: Fix };

/**
 * Dev builds only: let Maestro's `setLocation` (an Android mock provider) through. Never set in release
 * builds; the API still refuses a punch flagged as mocked.
 */
export const ALLOW_MOCK_LOCATION = __DEV__ && process.env.EXPO_PUBLIC_ALLOW_MOCK_LOCATION === 'true';

const toFix = (p: Location.LocationObject): Fix => ({
  latitude: p.coords.latitude,
  longitude: p.coords.longitude,
  accuracyMetres: p.coords.accuracy ?? null,
  mocked: !!p.mocked && !ALLOW_MOCK_LOCATION,
  at: p.timestamp,
});

/** Permission + location services; `null` when both are fine. */
export const locationBlocker = async (): Promise<'denied' | 'off' | null> => {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (!perm.granted) return 'denied';
  if (!(await Location.hasServicesEnabledAsync())) return 'off';
  return null;
};

const LAST_KNOWN_MAX_AGE_MS = 2 * 60_000;

/**
 * A fresh high-accuracy reading. Phones without Google services (Huawei) can be slow to answer, so after
 * `timeoutMs` the last known position (at most 2 minutes old) is used instead; its accuracy is shown and
 * checked like any other.
 */
export const currentFix = async (timeoutMs = 15_000): Promise<Fix> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const fresh = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null), timeout]);
    if (fresh) return toFix(fresh);
  } finally {
    clearTimeout(timer);
  }
  const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
  if (!last) throw new Error('location_unavailable');
  return toFix(last);
};

/** Live readings for the distance display while the screen is open. */
export const watchFix = (onFix: (fix: Fix) => void) =>
  Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 5 }, (p) => onFix(toFix(p)));
