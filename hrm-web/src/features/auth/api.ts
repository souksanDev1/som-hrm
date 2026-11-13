import type { LoginResponse, Me, PasswordLoginInput, PinLoginInput } from '@hrm/shared';
import { apiFetch } from '@/lib/api-client';

export const authApi = {
  loginWithPassword: (body: PasswordLoginInput) => apiFetch<LoginResponse>('/auth/login', { method: 'POST', body, auth: false }),
  loginWithPin: (body: PinLoginInput) => apiFetch<LoginResponse>('/auth/login/pin', { method: 'POST', body, auth: false }),
  logout: (refreshToken: string) => apiFetch<void>('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }),
  me: () => apiFetch<Me>('/auth/me'),
};
