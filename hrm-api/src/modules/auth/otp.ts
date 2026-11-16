import type { OtpPurpose } from '@prisma/client';
import { translate, type Locale } from '@hrm/shared';
import { randomInt, timingSafeEqual } from 'node:crypto';
import type { Tx } from '../../db/client';
import { sha256 } from '../../lib/crypto';
import { AppError, badRequest } from '../../lib/errors';
import type { SmsSender } from '../../lib/sms';
import { parameterReader } from '../parameters/parameters.service';
import { authRepository } from './auth.repository';

/**
 * SMS one-time codes (FR-AUTH-02): first-login phone verification and self-service reset.
 *
 * Only a salted SHA-256 of the code is stored. Length, lifetime, attempt limit, resend cooldown
 * and hourly cap are system parameters (`otp.*`). Callers run these inside their transaction and
 * must commit failed-attempt counters (return errors, throw after the transaction).
 */

export const otpTooSoon = () => new AppError(429, 'otp_resend_too_soon');
export const otpHourlyLimit = () => new AppError(429, 'otp_limit_reached');

const hashCode = (userId: string, purpose: OtpPurpose, code: string) => sha256(`${userId}:${purpose}:${code}`);

const safeEqualHex = (a: string, b: string) => {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

export const generateOtpCode = (length: number) => Array.from({ length }, () => randomInt(0, 10)).join('');

/** "02055550003" → "020****0003". */
export const maskPhone = (phone: string) => (phone.length <= 7 ? '****' : `${phone.slice(0, 3)}****${phone.slice(-4)}`);

export interface OtpTarget {
  workspaceId: string;
  userId: string;
  phone: string;
  locale: string;
}

/**
 * Issue and send a new code. Throws `otp_resend_too_soon` / `otp_limit_reached` (429).
 * Returns the cooldown so clients can show a resend timer.
 */
export const issueOtp = async (tx: Tx, sms: SmsSender, target: OtpTarget, purpose: OtpPurpose) => {
  const now = new Date();
  const [length, ttlMinutes, cooldownSeconds, maxPerHour] = await Promise.all([
    parameterReader.system(tx, 'otp.length'),
    parameterReader.system(tx, 'otp.ttlMinutes'),
    parameterReader.system(tx, 'otp.resendCooldownSeconds'),
    parameterReader.system(tx, 'otp.maxPerHour'),
  ]);

  const latest = await authRepository.latestOtp(tx, target.userId, purpose);
  if (latest && now.getTime() - latest.createdAt.getTime() < cooldownSeconds * 1000) throw otpTooSoon();
  const sentLastHour = await authRepository.countOtpSince(tx, target.userId, purpose, new Date(now.getTime() - 3_600_000));
  if (sentLastHour >= maxPerHour) throw otpHourlyLimit();

  const code = generateOtpCode(length);
  await authRepository.consumeOpenOtps(tx, target.userId, purpose);
  await authRepository.createOtp(tx, {
    workspaceId: target.workspaceId,
    userId: target.userId,
    purpose,
    phone: target.phone,
    codeHash: hashCode(target.userId, purpose, code),
    expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
  });
  const locale: Locale = target.locale === 'en' ? 'en' : 'lo';
  const body = translate(locale, purpose === 'FIRST_LOGIN' ? 'authx.sms.verify' : 'authx.sms.reset')
    .replace('{code}', code)
    .replace('{minutes}', String(ttlMinutes));
  await sms.send({ to: target.phone, body });
  return { resendAfterSeconds: cooldownSeconds };
};

export type OtpCheck = { ok: true } | { ok: false; error: AppError };

/**
 * Check a code against the newest open challenge. A wrong code counts an attempt
 * (the caller must commit it); a correct one is consumed exactly once.
 */
export const verifyOtp = async (tx: Tx, userId: string, purpose: OtpPurpose, code: string): Promise<OtpCheck> => {
  const maxAttempts = await parameterReader.system(tx, 'otp.maxAttempts');
  const challenge = await authRepository.latestOtp(tx, userId, purpose);
  const expected = hashCode(userId, purpose, code);
  if (!challenge || challenge.consumedAt) return { ok: false, error: badRequest('otp_invalid') };
  if (challenge.expiresAt <= new Date()) return { ok: false, error: badRequest('otp_expired') };
  if (challenge.attempts >= maxAttempts) return { ok: false, error: badRequest('otp_too_many_attempts') };
  if (!safeEqualHex(challenge.codeHash, expected)) {
    await authRepository.incrementOtpAttempts(tx, challenge.id);
    const exhausted = challenge.attempts + 1 >= maxAttempts;
    return { ok: false, error: badRequest(exhausted ? 'otp_too_many_attempts' : 'otp_invalid') };
  }
  if (!(await authRepository.consumeOtp(tx, challenge.id))) return { ok: false, error: badRequest('otp_invalid') };
  return { ok: true };
};
