import { ApiError, createApiClient, type RequestOptions } from '@hrm/shared';
import { useAuthStore } from '@/features/auth/store';

export { ApiError, type RequestOptions };

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** App-wide API client; tokens live in the persisted auth store. */
export const apiFetch = createApiClient({
  baseUrl: API_URL,
  tokens: {
    getAccessToken: () => useAuthStore.getState().accessToken,
    getRefreshToken: () => useAuthStore.getState().refreshToken,
    setTokens: (t) => useAuthStore.getState().setTokens(t),
    clear: () => useAuthStore.getState().clear(),
  },
});
