'use client';
import type { LoginResponse, Me, TokenPair } from '@hrm/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: Me | null;
  /** Remembered so field staff don't retype the company code. */
  lastWorkspaceCode: string;
  setSession(res: LoginResponse, workspaceCode: string): void;
  setTokens(tokens: TokenPair): void;
  setUser(user: Me): void;
  clear(): void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      lastWorkspaceCode: '',
      setSession: (res, workspaceCode) =>
        set({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user, lastWorkspaceCode: workspaceCode }),
      setTokens: (t) => set({ accessToken: t.accessToken, refreshToken: t.refreshToken }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'hrm-auth', storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);

export const useHasPermission = (permission: string) =>
  useAuthStore((s) => !!s.user?.permissions.includes(permission));
