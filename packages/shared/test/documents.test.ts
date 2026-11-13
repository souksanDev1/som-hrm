import { describe, expect, it } from 'vitest';
import { documentExpiryStatus, maskSensitive } from '../src';

const now = new Date('2026-01-01T00:00:00Z');
const plus = (days: number) => new Date(now.getTime() + days * 86_400_000);

describe('documentExpiryStatus', () => {
  it.each([
    [-1, 'EXPIRED'],
    [0, 'D30'],
    [30, 'D30'],
    [31, 'D60'],
    [60, 'D60'],
    [90, 'D90'],
    [91, 'VALID'],
  ])('%i days remaining → %s', (days, expected) => {
    expect(documentExpiryStatus(plus(days), now)).toBe(expected);
  });
  it('handles missing expiry', () => {
    expect(documentExpiryStatus(null, now)).toBe('NO_EXPIRY');
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
