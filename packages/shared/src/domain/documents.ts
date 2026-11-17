/**
 * Document expiry classification (FR-EMP-05.4).
 *
 * The API computes this with the workspace's `document.expiryAlertDays` parameter and
 * "today" in the workspace timezone; clients only render the result.
 */
export const EXPIRY_STATES = ['EXPIRED', 'EXPIRING', 'VALID', 'NO_EXPIRY'] as const;
export type ExpiryState = (typeof EXPIRY_STATES)[number];

export interface DocumentExpiry {
  status: ExpiryState;
  /** Calendar days from today until the expiry date (negative once expired); null without an expiry date. */
  daysUntilExpiry: number | null;
  /** For EXPIRING: the smallest configured alert threshold the document falls within (e.g. 7, 30, 60, 90). */
  thresholdDays: number | null;
}

const MS_PER_DAY = 86_400_000;
const isoDayNumber = (iso: string): number => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / MS_PER_DAY;

/** Whole calendar days between two ISO dates (YYYY-MM-DD), `to - from`. */
export const daysBetweenIsoDates = (from: string, to: string): number => Math.round(isoDayNumber(to) - isoDayNumber(from));

/**
 * Smallest alert threshold (days) that `remainingDays` falls within, or null when it is beyond every
 * threshold or already past. Shared by date-driven alerts (document expiry, probation end).
 */
export const alertThreshold = (remainingDays: number, alertDays: readonly number[]): number | null =>
  remainingDays < 0 ? null : ([...alertDays].sort((a, b) => a - b).find((d) => remainingDays <= d) ?? null);

/**
 * Classify a document expiry date.
 * @param expiresAt ISO date (YYYY-MM-DD) or null
 * @param today ISO date of "today" in the workspace timezone
 * @param alertDays configured alert thresholds in days (any order)
 */
export const documentExpiry = (expiresAt: string | null | undefined, today: string, alertDays: readonly number[]): DocumentExpiry => {
  if (!expiresAt) return { status: 'NO_EXPIRY', daysUntilExpiry: null, thresholdDays: null };
  const remaining = daysBetweenIsoDates(today, expiresAt);
  if (remaining < 0) return { status: 'EXPIRED', daysUntilExpiry: remaining, thresholdDays: null };
  const threshold = alertThreshold(remaining, alertDays);
  return threshold === null
    ? { status: 'VALID', daysUntilExpiry: remaining, thresholdDays: null }
    : { status: 'EXPIRING', daysUntilExpiry: remaining, thresholdDays: threshold };
};

/** Mask a sensitive identifier, keeping only the last `visible` characters. */
export const maskSensitive = (value: string | null | undefined, visible = 4): string | null => {
  if (!value) return null;
  if (value.length <= visible) return '•'.repeat(value.length);
  return '•'.repeat(value.length - visible) + value.slice(-visible);
};
