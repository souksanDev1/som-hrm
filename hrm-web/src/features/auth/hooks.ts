'use client';
import type {
  ChangePasswordInput,
  ChangePinInput,
  ForgotCredentialInput,
  Locale,
  PasswordLoginInput,
  PinLoginInput,
  ResetPasswordInput,
  VerifyPhoneInput,
} from '@hrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { usePrefsStore } from '@/lib/i18n';
import { authApi } from './api';
import { useAuthStore } from './store';

export const useLogin = () => {
  const setSession = useAuthStore((s) => s.setSession);
  const setLocale = usePrefsStore((s) => s.setLocale);
  return useMutation({
    mutationFn: (input: ({ method: 'PASSWORD' } & PasswordLoginInput) | ({ method: 'PIN' } & PinLoginInput)) =>
      input.method === 'PIN' ? authApi.loginWithPin(input) : authApi.loginWithPassword(input),
    onSuccess: (res, input) => {
      setSession(res, input.workspaceCode);
      // The user's saved language wins over the browser default (FR-WS-07.2).
      setLocale(res.user.locale);
    },
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  return async () => {
    const { refreshToken, clear } = useAuthStore.getState();
    clear();
    qc.clear();
    if (refreshToken) await authApi.logout(refreshToken).catch(() => undefined);
  };
};

/** Keeps the cached principal fresh (roles/permissions may change server-side). */
export const useMeSync = () => {
  const token = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const query = useQuery({ queryKey: ['me'], queryFn: authApi.me, enabled: !!token, staleTime: 60_000 });
  useEffect(() => {
    if (query.data) setUser(query.data);
  }, [query.data, setUser]);
  return query;
};

/** Reload the principal right away (after a setup step changes its flags). */
const useRefreshMe = () => {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  return async () => {
    const me = await authApi.me();
    setUser(me);
    qc.setQueryData(['me'], me);
    return me;
  };
};

export const useChangePassword = () => {
  const refreshMe = useRefreshMe();
  return useMutation({ mutationFn: (b: ChangePasswordInput) => authApi.changePassword(b), onSuccess: () => refreshMe() });
};

export const useChangePin = () => {
  const refreshMe = useRefreshMe();
  return useMutation({ mutationFn: (b: ChangePinInput) => authApi.changePin(b), onSuccess: () => refreshMe() });
};

export const useRequestPhoneOtp = () => useMutation({ mutationFn: () => authApi.requestPhoneOtp() });

export const useConfirmPhoneOtp = () => {
  const refreshMe = useRefreshMe();
  return useMutation({ mutationFn: (b: VerifyPhoneInput) => authApi.confirmPhoneOtp(b), onSuccess: () => refreshMe() });
};

export const useForgotCredential = () => useMutation({ mutationFn: (b: ForgotCredentialInput) => authApi.forgot(b) });

export const useResetPassword = () => useMutation({ mutationFn: (b: ResetPasswordInput) => authApi.resetPassword(b) });

/**
 * Switch the UI language; when signed in, also save it on the account so every device uses it.
 * The local switch is immediate; a failed save is ignored (the local choice still applies).
 */
export const useChangeLocale = () => {
  const setLocale = usePrefsStore((s) => s.setLocale);
  return (locale: Locale) => {
    setLocale(locale);
    const { accessToken, user, setUser } = useAuthStore.getState();
    if (!accessToken) return;
    if (user) setUser({ ...user, locale });
    void authApi.setLocale({ locale }).catch(() => undefined);
  };
};
