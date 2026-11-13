import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestContext, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext({ LOGIN_RATE_LIMIT: '2' });
});
afterAll(() => t.close());

const attempt = (identifier: string) =>
  t.app.inject({ method: 'POST', url: api('/auth/login'), payload: { workspaceCode: 'any-co', identifier, password: 'x' } });

describe('login rate limit', () => {
  it('limits per identifier without blocking colleagues on the same IP', async () => {
    expect((await attempt('a@x.la')).statusCode).toBe(401);
    expect((await attempt('a@x.la')).statusCode).toBe(401);
    const limited = await attempt('a@x.la');
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('rate_limited');
    // A colleague behind the same NAT is unaffected.
    expect((await attempt('b@x.la')).statusCode).toBe(401);
  });
});
