import type { Branch } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, createTestContext, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const session = async (ws: WorkspaceFixture) => {
  const token = (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
  return (method: 'POST' | 'PATCH' | 'GET', url: string, payload?: object) => t.app.inject({ method, url: api(url), headers: bearer(token), payload });
};

describe('branch attendance modes (FR-WS-06)', () => {
  it('defaults to the mobile app and enables several modes at once', async () => {
    const ws = await createWorkspace(t.db);
    const req = await session(ws);
    const b = (await req('POST', '/branches', { name: 'Plant' })).json<Branch>();
    expect(b.attendanceModes).toEqual(['MOBILE']);

    const all = await req('PATCH', `/branches/${b.id}`, { attendanceModes: ['MOBILE', 'SCANNER', 'KIOSK', 'SCANNER'] });
    expect(all.statusCode).toBe(200);
    expect(all.json<Branch>().attendanceModes).toEqual(['MOBILE', 'SCANNER', 'KIOSK']);

    const scannerOnly = await req('POST', '/branches', { name: 'Warehouse', attendanceModes: ['SCANNER'] });
    expect(scannerOnly.json<Branch>().attendanceModes).toEqual(['SCANNER']);

    const listed = (await req('GET', '/branches')).json<Branch[]>();
    expect(listed.find((x) => x.id === b.id)!.attendanceModes).toEqual(['MOBILE', 'SCANNER', 'KIOSK']);
  });

  it('refuses an empty or unknown mode list', async () => {
    const req = await session(await createWorkspace(t.db));
    const b = (await req('POST', '/branches', { name: 'Site' })).json<Branch>();
    expect((await req('PATCH', `/branches/${b.id}`, { attendanceModes: [] })).statusCode).toBe(400);
    expect((await req('PATCH', `/branches/${b.id}`, { attendanceModes: ['FACE'] })).statusCode).toBe(400);
  });
});
