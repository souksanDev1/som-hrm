import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/features/auth/store';

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('apiFetch', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'old', refreshToken: 'r1', user: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it('maps API errors to ApiError with the stable code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(409, { error: { code: 'employee_code_taken', message: 'x' } }));
    await expect(apiFetch('/employees', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 409, code: 'employee_code_taken' });
  });

  it('reports network failures as code "network"', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await apiFetch('/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('network');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(401, { error: { code: 'invalid_token', message: '' } }))
      .mockResolvedValueOnce(json(200, { accessToken: 'new', refreshToken: 'r2', expiresIn: 900 }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await expect(apiFetch<{ ok: boolean }>('/auth/me')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retryHeaders = fetchMock.mock.calls[2]![1]!.headers as Record<string, string>;
    expect(retryHeaders.authorization).toBe('Bearer new');
    expect(useAuthStore.getState().refreshToken).toBe('r2');
  });

  it('clears the session when refresh fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(401, { error: { code: 'invalid_token', message: '' } }))
      .mockResolvedValueOnce(json(401, { error: { code: 'invalid_refresh_token', message: '' } }))
      .mockResolvedValueOnce(json(401, { error: { code: 'invalid_token', message: '' } }));
    await expect(apiFetch('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
