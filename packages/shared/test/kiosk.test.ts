import { describe, expect, it } from 'vitest';
import { createApiClient, KIOSK_PUNCH_BATCH_MAX, kioskAuthorization, kioskListQuerySchema, kioskPunchBatchSchema, parseKioskAuthorization, translate } from '../src';

describe('kiosk schemas (FR-ATT-03)', () => {
  const token = 'a'.repeat(43);

  it('builds and parses the Kiosk authorization header', () => {
    expect(kioskAuthorization(token)).toBe(`Kiosk ${token}`);
    expect(parseKioskAuthorization(`Kiosk ${token}`)).toBe(token);
    expect(parseKioskAuthorization(`Bearer ${token}`)).toBeNull();
    expect(parseKioskAuthorization('Kiosk short')).toBeNull();
    expect(parseKioskAuthorization('Kiosk a.b.c-not-base64url!!!!!!!!!!')).toBeNull();
    expect(parseKioskAuthorization(undefined)).toBeNull();
  });

  it('validates a kiosk batch: 6-digit PIN, optional kind, offline default, batch size', () => {
    const item = { clientRef: 'abcdef12', employeeCode: 'E003', pin: '482913', capturedAt: '2026-11-17T08:00:00+07:00' };
    const ok = kioskPunchBatchSchema.parse({ deviceSentAt: '2026-11-17T01:00:00.000Z', items: [item] });
    expect(ok.items[0]).toMatchObject({ offline: false });
    expect(ok.items[0]!.kind).toBeUndefined();
    expect(kioskPunchBatchSchema.safeParse({ deviceSentAt: ok.deviceSentAt, items: [{ ...item, pin: '1234' }] }).success).toBe(false);
    expect(kioskPunchBatchSchema.safeParse({ deviceSentAt: ok.deviceSentAt, items: [{ ...item, kind: 'BREAK' }] }).success).toBe(false);
    expect(kioskPunchBatchSchema.safeParse({ deviceSentAt: ok.deviceSentAt, items: Array(KIOSK_PUNCH_BATCH_MAX + 1).fill(item) }).success).toBe(false);
  });

  it('reads includeRevoked as a boolean', () => {
    expect(kioskListQuerySchema.parse({ includeRevoked: 'true' }).includeRevoked).toBe(true);
    expect(kioskListQuerySchema.parse({}).includeRevoked).toBe(false);
  });

  it('translates kiosk errors in both languages', () => {
    expect(translate('en', 'kiosk_invalid_credentials')).toBe('Wrong employee code or PIN');
    expect(translate('lo', 'kiosk_revoked')).not.toBe('kiosk_revoked');
  });

  it('lets the API client use the Kiosk auth scheme', async () => {
    let header: string | undefined;
    const client = createApiClient({
      baseUrl: 'http://x',
      authScheme: 'Kiosk',
      tokens: { getAccessToken: () => token, getRefreshToken: () => null, setTokens: () => undefined, clear: () => undefined },
      fetchImpl: (async (_url: string, init: RequestInit) => {
        header = (init.headers as Record<string, string>).authorization;
        return new Response('{}', { status: 200 });
      }) as unknown as typeof fetch,
    });
    await client('/kiosk/me');
    expect(header).toBe(`Kiosk ${token}`);
  });
});
