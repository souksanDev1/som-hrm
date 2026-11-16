import { describe, expect, it } from 'vitest';
import { documentExpiry, maskSensitive } from '../src';

describe('documentExpiry', () => {
  const today = '2026-01-01';
  const thresholds = [90, 60, 30, 7];
  it.each([
    ['2025-12-31', 'EXPIRED', -1, null],
    ['2026-01-01', 'EXPIRING', 0, 7],
    ['2026-01-08', 'EXPIRING', 7, 7],
    ['2026-01-09', 'EXPIRING', 8, 30],
    ['2026-03-02', 'EXPIRING', 60, 60],
    ['2026-04-01', 'EXPIRING', 90, 90],
    ['2026-04-02', 'VALID', 91, null],
  ])('%s → %s', (expiresAt, status, days, threshold) => {
    expect(documentExpiry(expiresAt, today, thresholds)).toEqual({ status, daysUntilExpiry: days, thresholdDays: threshold });
  });
  it('handles missing expiry and custom thresholds in any order', () => {
    expect(documentExpiry(null, today, thresholds)).toEqual({ status: 'NO_EXPIRY', daysUntilExpiry: null, thresholdDays: null });
    expect(documentExpiry('2026-01-15', today, [14, 120])).toMatchObject({ status: 'EXPIRING', thresholdDays: 14 });
    expect(documentExpiry('2026-01-15', today, [10])).toMatchObject({ status: 'VALID' });
  });
});

describe('maskSensitive', () => {
  it('keeps last 4 characters', () => {
    expect(maskSensitive('1234567890')).toBe('••••••7890');
  });
  it('fully masks short values and passes null through', () => {
    expect(maskSensitive('12')).toBe('••');
    expect(maskSensitive(null)).toBeNull();
  });
});
