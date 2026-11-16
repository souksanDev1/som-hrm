import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFieldCipher, normalizeIdentifier } from '../src/lib/crypto';
import { todayInTimeZone, toWorkDate } from '../src/lib/dates';

describe('blind index', () => {
  const key = randomBytes(32).toString('base64');
  const cipher = createFieldCipher(key);

  it('normalises spaces, dashes and case', () => {
    expect(normalizeIdentifier(' ab-12 34 ')).toBe('AB1234');
    expect(cipher.blindIndex('national_id', 'ab-12 34')).toBe(cipher.blindIndex('national_id', 'AB1234'));
  });

  it('is a keyed 64-hex HMAC, separated by purpose and key', () => {
    const h = cipher.blindIndex('national_id', '0123456789')!;
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(cipher.blindIndex('social_security_no', '0123456789')).not.toBe(h);
    expect(createFieldCipher(randomBytes(32).toString('base64')).blindIndex('national_id', '0123456789')).not.toBe(h);
    expect(createFieldCipher(key).blindIndex('national_id', '0123456789')).toBe(h);
  });

  it('returns null for blank input', () => {
    expect(cipher.blindIndex('national_id', null)).toBeNull();
    expect(cipher.blindIndex('national_id', ' - ')).toBeNull();
  });

  it('round-trips encryption with a random IV', () => {
    const a = cipher.encrypt('X1');
    expect(a).not.toBe(cipher.encrypt('X1'));
    expect(cipher.decrypt(a)).toBe('X1');
  });
});

describe('timezone dates', () => {
  // 2026-11-16T18:30Z is already the 17th in Vientiane (UTC+7) but still the 16th in UTC.
  const instant = new Date('2026-11-16T18:30:00Z');

  it('derives the calendar date in the given zone', () => {
    expect(toWorkDate(instant, 'Asia/Vientiane')).toBe('2026-11-17');
    expect(toWorkDate(instant, 'UTC')).toBe('2026-11-16');
    expect(toWorkDate(new Date('2026-01-01T02:00:00Z'), 'America/New_York')).toBe('2025-12-31');
  });

  it('todayInTimeZone uses the injected clock', () => {
    expect(todayInTimeZone('Asia/Vientiane', instant)).toBe('2026-11-17');
  });

  it('rejects unknown zones', () => {
    expect(() => toWorkDate(instant, 'Mars/Olympus')).toThrow(RangeError);
  });
});
