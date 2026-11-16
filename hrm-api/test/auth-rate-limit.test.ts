import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';
import { api, bearer, createTestContext, createUser, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext({ LOGIN_RATE_LIMIT: '2' });
});
afterAll(() => t.close());

describe('credential change rate limit (B9)', () => {
  it('is keyed by the signed-in user, not the shared IP', async () => {
    const ws = await createWorkspace(t.db);
    await createUser(t.db, ws, { email: 'b@x.test', password: 'Bravo12345', role: 'EMPLOYEE' });
    const a = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
    const b = (await loginAs(t.app, ws.code, 'b@x.test', 'Bravo12345')).accessToken;
    const change = (token: string) =>
      t.app.inject({
        method: 'POST', url: api('/auth/change-password'), headers: bearer(token),
        payload: { currentPassword: 'wrong-pass1', newPassword: 'Another123' },
      });

    expect((await change(a)).statusCode).toBe(400);
    expect((await change(a)).statusCode).toBe(400);
    const limited = await change(a);
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('rate_limited');
    // Colleague on the same IP has an independent budget.
    expect((await change(b)).statusCode).toBe(400);
  });
});

describe('TRUST_PROXY', () => {
  const base = {
    DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
    JWT_SECRET: 'x'.repeat(32),
    ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  };
  it.each([
    [undefined, false],
    ['false', false],
    ['true', true],
    ['1', 1],
    ['10.0.0.1, 10.0.0.0/8', ['10.0.0.1', '10.0.0.0/8']],
  ])('parses %s', (value, expected) => {
    expect(loadEnv({ ...base, ...(value === undefined ? {} : { TRUST_PROXY: value }) }).TRUST_PROXY).toEqual(expected);
  });
});
