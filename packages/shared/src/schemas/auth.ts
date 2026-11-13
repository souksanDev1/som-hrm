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

export const changePinSchema = z
  .object({ currentPin: pinSchema, newPin: pinSchema })
  .refine((v) => v.currentPin !== v.newPin, { message: 'pin_must_differ', path: ['newPin'] })
  .refine((v) => !/^(\d)\1+$/.test(v.newPin) && !['123456', '654321'].includes(v.newPin), {
    message: 'pin_too_weak',
    path: ['newPin'],
  });
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
  locale: z.enum(['lo', 'en']),
});
export type Me = z.infer<typeof meSchema>;

export const loginResponseSchema = tokenPairSchema.extend({ user: meSchema });
export type LoginResponse = z.infer<typeof loginResponseSchema>;
