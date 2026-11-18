import {
  ApiError,
  createApiClient,
  KIOSK_AUTH_SCHEME,
  kioskAuthorization,
  type KioskInfo,
  type KioskPunchBatchInput,
  type KioskPunchBatchResponse,
  type StoredFileRef,
  type TokenStore,
} from '@hrm/shared';
import { API_URL } from '@/lib/config';
import { useKioskStore } from './store';

/** Token store of the kiosk client: the enrol code; a 401 (revoked / unknown) forgets the enrolment. */
const tokensFor = (token: () => string | null, onUnauthorized: () => void): TokenStore => ({
  getAccessToken: token,
  getRefreshToken: () => null,
  setTokens: () => undefined,
  clear: onUnauthorized,
});

/** Calls with this tablet's enrolment (`Authorization: Kiosk <token>`, FR-ATT-03). */
const kioskFetch = createApiClient({
  baseUrl: API_URL,
  authScheme: KIOSK_AUTH_SCHEME,
  tokens: tokensFor(
    () => useKioskStore.getState().token,
    () => useKioskStore.getState().clear(),
  ),
});

export const kioskApi = {
  /** Check an enrol code before keeping it (enrol screen). */
  meWith: (token: string) =>
    createApiClient({ baseUrl: API_URL, authScheme: KIOSK_AUTH_SCHEME, tokens: tokensFor(() => token, () => undefined) })<KioskInfo>('/kiosk/me'),
  me: () => kioskFetch<KioskInfo>('/kiosk/me'),
  submit: (body: KioskPunchBatchInput) => kioskFetch<KioskPunchBatchResponse>('/kiosk/punches', { method: 'POST', body }),

  /** Upload the punch photo (multipart, `POST /kiosk/files`); returns the file id. */
  uploadPhoto: async (uri: string): Promise<string> => {
    const token = useKioskStore.getState().token;
    const body = new FormData();
    // React Native's FormData takes a file descriptor object instead of a Blob.
    body.append('file', { uri, name: 'kiosk.jpg', type: 'image/jpeg' } as unknown as Blob);
    let res: Response;
    try {
      res = await fetch(`${API_URL}/kiosk/files`, { method: 'POST', headers: token ? { authorization: kioskAuthorization(token) } : {}, body });
    } catch {
      throw new ApiError(0, 'network', 'Network error');
    }
    const data = (await res.json().catch(() => null)) as (StoredFileRef & { error?: { code: string; message: string } }) | null;
    if (!res.ok) {
      if (res.status === 401) useKioskStore.getState().clear();
      throw new ApiError(res.status, data?.error?.code ?? 'unknown', data?.error?.message ?? res.statusText);
    }
    return data!.id;
  },
};
