import type { TokenPair } from '../schemas/auth';

/** Error carrying the API's stable error code (translatable via `translate(locale, code)`). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** Attach the bearer token (default true). */
  auth?: boolean;
}

/** Token storage adapter so web (localStorage) and mobile (SecureStore) share one client. */
export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(tokens: TokenPair): void;
  clear(): void;
}

export interface ApiClientOptions {
  baseUrl: string | (() => string);
  tokens: TokenStore;
  fetchImpl?: typeof fetch;
}

export type ApiFetch = <T>(path: string, opts?: RequestOptions) => Promise<T>;

/**
 * Fetch wrapper: JSON in/out, bearer auth, single-flight refresh-token rotation
 * on 401, and uniform `ApiError`s (status 0 + code "network" when offline).
 */
export const createApiClient = ({ baseUrl, tokens, fetchImpl }: ApiClientOptions): ApiFetch => {
  const doFetch: typeof fetch = (...args) => (fetchImpl ?? globalThis.fetch)(...args);
  const base = () => (typeof baseUrl === 'function' ? baseUrl() : baseUrl);
  const buildUrl = (path: string, query?: Query) => {
    const qs = Object.entries(query ?? {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    return `${base()}${path}${qs ? `?${qs}` : ''}`;
  };

  let refreshing: Promise<boolean> | null = null;
  const refreshSession = (): Promise<boolean> => {
    refreshing ??= (async () => {
      const refreshToken = tokens.getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await doFetch(buildUrl('/auth/refresh'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          tokens.clear();
          return false;
        }
        tokens.setTokens((await res.json()) as TokenPair);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  };

  const request = async <T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> => {
    const { method = 'GET', body, query, auth = true } = opts;
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const token = tokens.getAccessToken();
    if (auth && token) headers.authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await doFetch(buildUrl(path, query), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError(0, 'network', 'Network error');
    }

    if (res.status === 401 && auth && !retried && (await refreshSession())) return request<T>(path, opts, true);
    if (res.status === 204) return undefined as T;

    const data = (await res.json().catch(() => null)) as { error?: { code: string; message: string; details?: unknown } } | null;
    if (!res.ok) {
      if (res.status === 401 && auth) tokens.clear();
      throw new ApiError(res.status, data?.error?.code ?? 'unknown', data?.error?.message ?? res.statusText, data?.error?.details);
    }
    return data as T;
  };

  return request;
};
