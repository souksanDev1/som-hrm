import type {
  ChangePasswordInput,
  ChangePinInput,
  ForgotCredentialInput,
  LoginResponse,
  Me,
  OtpRequested,
  PasswordLoginInput,
  PinLoginInput,
  ResetPasswordInput,
  UpdateLocaleInput,
  VerifyPhoneInput,
} from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

export const authApi = {
  loginWithPassword: (body: PasswordLoginInput) => apiFetch<LoginResponse>('/auth/login', { method: 'POST', body, auth: false }),
  loginWithPin: (body: PinLoginInput) => apiFetch<LoginResponse>('/auth/login/pin', { method: 'POST', body, auth: false }),
  logout: (refreshToken: string) => apiFetch<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
  me: () => apiFetch<Me>('/auth/me'),
  changePassword: (body: ChangePasswordInput) => apiFetch<void>('/auth/change-password', { method: 'POST', body }),
  changePin: (body: ChangePinInput) => apiFetch<void>('/auth/change-pin', { method: 'POST', body }),
  setLocale: (body: UpdateLocaleInput) => apiFetch<void>('/auth/me/locale', { method: 'PATCH', body }),
  forgot: (body: ForgotCredentialInput) => apiFetch<OtpRequested>('/auth/password/forgot', { method: 'POST', body, auth: false }),
  resetPassword: (body: ResetPasswordInput) => apiFetch<void>('/auth/password/reset', { method: 'POST', body, auth: false }),
  requestPhoneOtp: () => apiFetch<OtpRequested>('/auth/phone/verify/request', { method: 'POST' }),
  confirmPhoneOtp: (body: VerifyPhoneInput) => apiFetch<void>('/auth/phone/verify/confirm', { method: 'POST', body }),
};
