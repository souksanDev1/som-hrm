import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const VERSION = 'v1';

/** Field-level encryption for sensitive identifiers (SSN, family book). */
export interface FieldCipher {
  encrypt(plain: string): string;
  decrypt(payload: string): string;
}

export const createFieldCipher = (base64Key: string): FieldCipher => {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
  return {
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
