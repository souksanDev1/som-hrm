import { daysBetween } from './lao-labor';

/** Alert thresholds (days before expiry) for foreign-worker documents. */
export const DOCUMENT_ALERT_DAYS = [90, 60, 30] as const;

export type ExpiryStatus = 'EXPIRED' | 'D30' | 'D60' | 'D90' | 'VALID' | 'NO_EXPIRY';

/** Classify a document expiry date relative to `now`. */
export const documentExpiryStatus = (expiresAt: Date | null | undefined, now: Date = new Date()): ExpiryStatus => {
  if (!expiresAt) return 'NO_EXPIRY';
  const remaining = daysBetween(now, expiresAt);
  if (remaining < 0) return 'EXPIRED';
  if (remaining <= 30) return 'D30';
  if (remaining <= 60) return 'D60';
  if (remaining <= 90) return 'D90';
  return 'VALID';
};

/** Days remaining until expiry (negative when already expired). */
export const daysUntilExpiry = (expiresAt: Date, now: Date = new Date()): number => daysBetween(now, expiresAt);

/** Mask a sensitive identifier, keeping only the last `visible` characters. */
export const maskSensitive = (value: string | null | undefined, visible = 4): string | null => {
  if (!value) return null;
  if (value.length <= visible) return '•'.repeat(value.length);
  return '•'.repeat(value.length - visible) + value.slice(-visible);
};
