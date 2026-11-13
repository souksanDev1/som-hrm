'use client';
import type { PasswordLoginInput, PinLoginInput } from '@hrm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { authApi } from './api';
import { useAuthStore } from './store';

export const useLogin = () => {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (input: ({ method: 'PASSWORD' } & PasswordLoginInput) | ({ method: 'PIN' } & PinLoginInput)) =>
      input.method === 'PIN' ? authApi.loginWithPin(input) : authApi.loginWithPassword(input),
    onSuccess: (res, input) => setSession(res, input.workspaceCode),
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
