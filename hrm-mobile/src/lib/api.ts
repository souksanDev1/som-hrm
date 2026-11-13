import { ApiError, createApiClient } from '@hrm/shared';
import { useAuthStore } from '@/features/auth/store';
import { API_URL } from './config';

export { ApiError };

export const apiFetch = createApiClient({
  baseUrl: API_URL,
  tokens: {
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
    setTokens: (t) => useAuthStore.getState().setTokens(t),
    clear: () => useAuthStore.getState().clear(),
  },
});

/** Map any thrown error to a translatable code. */
export const errorCode = (err: unknown): string => (err instanceof ApiError ? err.code : 'unknown');
