import {
  pendingAccountSetup,
  type ChangePasswordInput,
  type ChangePinInput,
  type ForgotCredentialInput,
  type Locale,
  type Me,
  type PasswordLoginInput,
  type PinLoginInput,
  type ResetPasswordInput,
  type ResetPinInput,
  type VerifyPhoneInput,
} from '@hrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { usePrefsStore } from '@/lib/i18n';
import { authApi } from './api';
import { useAuthStore } from './store';

export type LoginInput = ({ method: 'PASSWORD' } & PasswordLoginInput) | ({ method: 'PIN' } & PinLoginInput);

/** Where a signed-in user belongs: an account-setup screen while the API gate applies, else home. */
export const homeRouteFor = (user: Pick<Me, 'phoneVerificationRequired' | 'mustChangeCredential'> | null) => {
  const pending = user ? pendingAccountSetup(user) : null;
  if (pending === 'VERIFY_PHONE') return '/verify-phone' as const;
  if (pending === 'CHANGE_CREDENTIAL') return '/change-pin' as const;
  return '/home' as const;
};

export const useLogin = () => {
  const setSession = useAuthStore((s) => s.setSession);
  const setLocale = usePrefsStore((s) => s.setLocale);
  return useMutation({
    mutationFn: (input: LoginInput) => (input.method === 'PIN' ? authApi.loginWithPin(input) : authApi.loginWithPassword(input)),
    onSuccess: (res, input) => {
      setSession(res, input.workspaceCode, input.method);
      // The account's saved language wins over the device default (FR-WS-07.2).
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

/** Loads the principal after app start (tokens are persisted, the profile is not). */
export const useMe = () => {
  const token = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const query = useQuery({ queryKey: ['me'], queryFn: authApi.me, enabled: !!token, staleTime: 60_000 });
  useEffect(() => {
    if (query.data) setUser(query.data);
  }, [query.data, setUser]);
  return query;
};

/** Reload the principal right away so the account-setup gate sees the new flags. */
const useRefreshMe = () => {
  const qc = useQueryClient();
  return async () => {
    const me = await authApi.me();
    useAuthStore.getState().setUser(me);
    qc.setQueryData(['me'], me);
    return me;
  };
};

export const useChangePin = () => {
  const refreshMe = useRefreshMe();
  return useMutation({ mutationFn: (b: ChangePinInput) => authApi.changePin(b), onSuccess: () => refreshMe() });
};

export const useChangePassword = () => {
  const refreshMe = useRefreshMe();
  return useMutation({ mutationFn: (b: ChangePasswordInput) => authApi.changePassword(b), onSuccess: () => refreshMe() });
};

export const useRequestPhoneOtp = () => useMutation({ mutationFn: () => authApi.requestPhoneOtp() });

export const useConfirmPhoneOtp = () => {
  const refreshMe = useRefreshMe();
  return useMutation({ mutationFn: (b: VerifyPhoneInput) => authApi.confirmPhoneOtp(b), onSuccess: () => refreshMe() });
};

export const useForgotCredential = () => useMutation({ mutationFn: (b: ForgotCredentialInput) => authApi.forgot(b) });

export const useResetCredential = () =>
  useMutation({
    mutationFn: (b: ({ kind: 'PIN' } & ResetPinInput) | ({ kind: 'PASSWORD' } & ResetPasswordInput)) => {
      if (b.kind === 'PIN') {
        const { kind: _kind, ...body } = b;
        return authApi.resetPin(body);
      }
      const { kind: _kind, ...body } = b;
      return authApi.resetPassword(body);
    },
  });

/** Switch language locally and, when signed in, save it on the account (best effort). */
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

/** Seconds left on a resend timer. */
export const useCountdown = () => {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until, now]);
  return {
    secondsLeft: Math.max(0, Math.ceil((until - now) / 1000)),
    start: (seconds: number) => {
      const t = Date.now();
      setNow(t);
      setUntil(t + seconds * 1000);
    },
  };
};
