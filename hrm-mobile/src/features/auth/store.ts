import type { LoginMethod, LoginResponse, Me, TokenPair } from '@hrm/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureStorage } from '@/lib/secure-storage';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  /** Loaded from /auth/me; not persisted (SecureStore values should stay small). */
  user: Me | null;
  lastWorkspaceCode: string;
  lastLoginMethod: LoginMethod;
  setSession(res: LoginResponse, workspaceCode: string, method: LoginMethod): void;
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
      lastLoginMethod: 'PIN',
      setSession: (res, workspaceCode, method) =>
        set({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user, lastWorkspaceCode: workspaceCode, lastLoginMethod: method }),
      setTokens: (t) => set({ accessToken: t.accessToken, refreshToken: t.refreshToken }),
      setUser: (user) => set({ user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: 'hrm-auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        lastWorkspaceCode: s.lastWorkspaceCode,
        lastLoginMethod: s.lastLoginMethod,
      }),
    },
  ),
);

export const useHasPermission = (permission: string) => useAuthStore((s) => !!s.user?.permissions.includes(permission));
