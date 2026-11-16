import { z } from 'zod';

export const workspaceCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{2,40}$/, 'invalid_workspace_code');

/** Email/password login (office staff, HR). */
export const passwordLoginSchema = z.object({
  workspaceCode: workspaceCodeSchema,
  identifier: z.string().trim().min(1, 'required').max(120),
  password: z.string().min(1, 'required').max(200),
});
export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>;

export const PIN_LENGTH = 6;
export const pinSchema = z.string().regex(new RegExp(`^\\d{${PIN_LENGTH}}$`), 'invalid_pin');

/** Employee-code or phone + PIN login (field workers without email). */
export const pinLoginSchema = z.object({
  workspaceCode: workspaceCodeSchema,
  identifier: z.string().trim().min(1, 'required').max(40),
  pin: pinSchema,
});
export type PinLoginInput = z.infer<typeof pinLoginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshInput = z.infer<typeof refreshSchema>;

/** Rejects trivially guessable PINs (all same digit, simple runs). */
export const isWeakPin = (pin: string) => /^(\d)\1+$/.test(pin) || ['123456', '654321'].includes(pin);

/**
 * Change (or set) the PIN. `currentPin` may be omitted only when the user has no PIN yet
 * (initial PIN, `Me.hasPin === false`); the API enforces that rule.
 */
export const changePinSchema = z
  .object({ currentPin: pinSchema.optional(), newPin: pinSchema })
  .refine((v) => v.currentPin !== v.newPin, { message: 'pin_must_differ', path: ['newPin'] })
  .refine((v) => !isWeakPin(v.newPin), { message: 'pin_too_weak', path: ['newPin'] });
export type ChangePinInput = z.infer<typeof changePinSchema>;

export const PASSWORD_MIN = 8;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, 'password_too_short')
  .max(200)
  .regex(/[A-Za-z]/, 'password_needs_letter')
  .regex(/\d/, 'password_needs_digit');

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const localeSchema = z.enum(['lo', 'en']);
export const updateLocaleSchema = z.object({ locale: localeSchema });
export type UpdateLocaleInput = z.infer<typeof updateLocaleSchema>;

// ── SMS OTP (FR-AUTH-02) ──

/** Digits only; length is a system parameter (`otp.length`), so only bounds are checked here. */
export const otpCodeSchema = z.string().trim().regex(/^\d{4,8}$/, 'invalid_otp');

/** Public: request a reset code by SMS. The API always answers 202 (never reveals whether the account exists). */
export const forgotCredentialSchema = z.object({
  workspaceCode: workspaceCodeSchema,
  identifier: z.string().trim().min(1, 'required').max(120),
});
export type ForgotCredentialInput = z.infer<typeof forgotCredentialSchema>;

export const resetPasswordSchema = forgotCredentialSchema.extend({ code: otpCodeSchema, newPassword: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const resetPinSchema = forgotCredentialSchema
  .extend({ code: otpCodeSchema, newPin: pinSchema })
  .refine((v) => !isWeakPin(v.newPin), { message: 'pin_too_weak', path: ['newPin'] });
export type ResetPinInput = z.infer<typeof resetPinSchema>;

export const verifyPhoneSchema = z.object({ code: otpCodeSchema });
export type VerifyPhoneInput = z.infer<typeof verifyPhoneSchema>;

export const otpRequestedSchema = z.object({
  /** Seconds before another code may be requested. */
  resendAfterSeconds: z.number().int(),
  /** Only on authenticated requests, e.g. "020****0003". */
  maskedPhone: z.string().nullable(),
});
export type OtpRequested = z.infer<typeof otpRequestedSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

export const meSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  workspaceName: z.string(),
  displayName: z.string(),
  email: z.string().nullable(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  employeeId: z.string().nullable(),
  mustChangeCredential: z.boolean(),
  /** The user has a phone that was never confirmed by SMS OTP (FR-AUTH-02.1). */
  phoneVerificationRequired: z.boolean(),
  hasPassword: z.boolean(),
  hasPin: z.boolean(),
  locale: localeSchema,
});
export type Me = z.infer<typeof meSchema>;

/** Until this is `null`, only the account-setup endpoints are allowed (enforced by the API). */
export type PendingAccountSetup = 'VERIFY_PHONE' | 'CHANGE_CREDENTIAL';
export const pendingAccountSetup = (me: Pick<Me, 'phoneVerificationRequired' | 'mustChangeCredential'>): PendingAccountSetup | null =>
  me.phoneVerificationRequired ? 'VERIFY_PHONE' : me.mustChangeCredential ? 'CHANGE_CREDENTIAL' : null;

export const loginResponseSchema = tokenPairSchema.extend({ user: meSchema });
export type LoginResponse = z.infer<typeof loginResponseSchema>;
