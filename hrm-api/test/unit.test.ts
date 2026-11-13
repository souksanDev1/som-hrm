import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFieldCipher, generatePin, generateTempPassword } from '../src/lib/crypto';
import { ttlToSeconds } from '../src/plugins/auth';
import { passwordSchema } from '@hrm/shared';

describe('field cipher', () => {
  const cipher = createFieldCipher(randomBytes(32).toString('base64'));
  it('round-trips and uses a random IV', () => {
    const a = cipher.encrypt('SS123456');
    const b = cipher.encrypt('SS123456');
    expect(a).not.toBe(b);
    expect(cipher.decrypt(a)).toBe('SS123456');
  });
  it('detects tampering', () => {
    const parts = cipher.encrypt('secret').split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => cipher.decrypt(parts.join(':'))).toThrow();
  });
});

describe('secret generators', () => {
  it('generates non-trivial 6-digit PINs', () => {
    for (let i = 0; i < 200; i++) {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{6}$/);
      expect(pin).not.toMatch(/^(\d)\1+$/);
    }
  });
  it('generates temp passwords that satisfy the password policy', () => {
    expect(passwordSchema.safeParse(generateTempPassword()).success).toBe(true);
  });
});

describe('ttlToSeconds', () => {
  it.each([['15m', 900], ['1h', 3600], ['30', 30], ['2d', 172800]])('%s → %i', (ttl, s) => {
    expect(ttlToSeconds(ttl)).toBe(s);
  });
});
