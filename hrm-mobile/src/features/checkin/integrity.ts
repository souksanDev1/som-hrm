import * as Device from 'expo-device';

/**
 * Rooted / jailbroken phone check (FR-ATT-10.1, SHOULD). Uses `expo-device` (`isRootedExperimentalAsync`: `su`
 * binaries on Android, known jailbreak traces on iOS). The answer only flags punches for HR review (FR-ATT-10.2,
 * reason ROOTED) — it never blocks — and fails open: an error or an unsupported platform counts as not rooted.
 * Checked once per app session (it reads the file system).
 */
let cached: Promise<boolean> | null = null;

export const isDeviceRooted = (): Promise<boolean> => {
  cached ??= Device.isRootedExperimentalAsync().then(
    (rooted) => rooted === true,
    () => false,
  );
  return cached;
};

/** Test hook. */
export const resetDeviceIntegrityForTests = () => {
  cached = null;
};
