import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';

/** Identifiers that get a blind index (searchable keyed hash) next to their ciphertext. */
export type BlindIndexPurpose = 'national_id' | 'social_security_no';

/** Field-level encryption for sensitive identifiers (national ID, SSN, family book). */
export interface FieldCipher {
  encrypt(plain: string): string;
  decrypt(payload: string): string;
  /**
   * Deterministic HMAC-SHA256 of the normalised value, used for uniqueness checks (FR-EMP-10.2/10.3)
   * without storing the plaintext. Returns null for blank input.
   */
  blindIndex(purpose: BlindIndexPurpose, value: string | null | undefined): string | null;
}

/** Normalise an identifier before hashing: trim, drop spaces and dashes, uppercase. */
export const normalizeIdentifier = (value: string): string => value.trim().replace(/[\s-]+/g, '').toUpperCase();

/**
 * Derive the blind-index key from the encryption key with HKDF so the two keys are independent
 * (a leaked index key reveals nothing about the ciphertexts and vice versa).
 */
const deriveBlindIndexKey = (key: Buffer): Buffer => Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), 'hrm/blind-index/v1', 32));

export const createFieldCipher = (base64Key: string): FieldCipher => {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
  const indexKey = deriveBlindIndexKey(key);
  return {
    blindIndex(purpose, value) {
      const normalized = value ? normalizeIdentifier(value) : '';
      if (!normalized) return null;
      return createHmac('sha256', indexKey).update(`${purpose}:${normalized}`).digest('hex');
    },
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv(ALGO, key, iv);
      const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [VERSION, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
    },
    decrypt(payload) {
      const [version, iv, tag, data] = payload.split(':');
      if (version !== VERSION || !iv || !tag || !data) throw new Error('Unsupported cipher payload');
      const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
    },
  };
};

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const randomToken = (bytes = 48): string => randomBytes(bytes).toString('base64url');

/** Random numeric PIN that avoids trivially weak patterns. */
export const generatePin = (length = 6): string => {
  for (;;) {
    const pin = Array.from({ length }, () => randomInt(0, 10)).join('');
    if (!/^(\d)\1+$/.test(pin) && pin !== '123456' && pin !== '654321') return pin;
  }
};

/** Temporary password with letters + digits (satisfies passwordSchema). */
export const generateTempPassword = (): string => {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (set: string, n: number) => Array.from({ length: n }, () => set[randomInt(0, set.length)]).join('');
  return `${pick(letters, 6)}${pick(digits, 4)}`;
};
