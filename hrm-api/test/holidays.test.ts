import type { CreateEmployeeResponse, EnsureHolidayYearResult, Holiday } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runHolidayDefaults } from '../src/jobs';
import { api, bearer, createTestContext, createUser, createWorkspace, employeePayload, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';
const asToken = (token: string) => (method: Method, url: string, payload?: object) =>
  t.app.inject({ method, url: api(url), headers: bearer(token), payload });
const session = async (ws: WorkspaceFixture) => asToken((await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken);

const DEFAULT_DAYS = ['01-01', '03-08', '04-14', '04-15', '04-16', '05-01', '12-02'];
const THIS_YEAR = new Date().getUTCFullYear();

describe('holiday defaults (FR-WS-04.1/04.2)', () => {
  it('seeds a new workspace with the statutory holidays, 8 March women-only', async () => {
    const req = await session(await createWorkspace(t.db));
    const list = (await req('GET', `/holidays?year=${THIS_YEAR}`)).json<Holiday[]>();
    expect(list.map((h) => h.date)).toEqual(DEFAULT_DAYS.map((d) => `${THIS_YEAR}-${d}`));
    expect(list.every((h) => h.isDefault && h.kind === 'PUBLIC' && h.nationality === null)).toBe(true);
    expect(list.filter((h) => h.womenOnly).map((h) => h.date)).toEqual([`${THIS_YEAR}-03-08`]);
  });

  it('adds a new year idempotently and respects HR deleting a default', async () => {
    const ws = await createWorkspace(t.db);
    const req = await session(ws);
    const first = await req('POST', '/holidays/ensure-year', { year: 2031 });
    expect(first.json<EnsureHolidayYearResult>()).toEqual({ year: 2031, created: 7 });
    expect((await req('POST', '/holidays/ensure-year', { year: 2031 })).json<EnsureHolidayYearResult>().created).toBe(0);

    const may = (await req('GET', '/holidays?year=2031')).json<Holiday[]>().find((h) => h.date === '2031-05-01')!;
    expect((await req('DELETE', `/holidays/${may.id}`)).statusCode).toBe(204);
    expect((await req('POST', '/holidays/ensure-year', { year: 2031 })).json<EnsureHolidayYearResult>().created).toBe(0);
    expect((await req('GET', '/holidays?year=2031')).json<Holiday[]>()).toHaveLength(6);

    expect((await req('POST', '/holidays/ensure-year', { year: 1999 })).statusCode).toBe(400);
    expect((await req('GET', '/holidays')).statusCode).toBe(400);
    const audit = await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { action: 'holiday.defaults_added' } }));
    expect(audit.map((a) => a.meta)).toEqual([{ year: 2031, created: 7 }]);
  });

  it('the monthly job seeds the current year, and next year from December, once', async () => {
    const ws = await createWorkspace(t.db);
    const november = await runHolidayDefaults(t.db, ws.workspaceId, new Date('2040-11-01T00:00:00Z'));
    expect(november).toEqual({ years: [2040], created: 7 });
    // 1 Dec 00:30 Vientiane is still 30 Nov in UTC: the workspace timezone decides.
    const december = await runHolidayDefaults(t.db, ws.workspaceId, new Date('2040-11-30T17:30:00Z'));
    expect(december).toEqual({ years: [2040, 2041], created: 7 });
    expect(await runHolidayDefaults(t.db, ws.workspaceId, new Date('2040-12-15T00:00:00Z'))).toEqual({ years: [2040, 2041], created: 0 });
    const count = await t.db.tenant(ws.workspaceId, (tx) => tx.holiday.count({ where: { date: { gte: new Date('2041-01-01'), lte: new Date('2041-12-31') } } }));
    expect(count).toBe(7);
  });
});

describe('holiday CRUD (FR-WS-04.3/04.4, FR-WS-05)', () => {
  it('adds traditional, substitute and national days; validates and audits', async () => {
    const ws = await createWorkspace(t.db);
    const req = await session(ws);
    const boun = await req('POST', '/holidays', { date: '2030-10-21', nameLo: 'ບຸນອອກພັນສາ', nameEn: 'Boun Ok Phansa', kind: 'TRADITIONAL' });
    expect(boun.statusCode).toBe(201);
    expect(boun.json<Holiday>()).toMatchObject({ date: '2030-10-21', kind: 'TRADITIONAL', womenOnly: false, nationality: null, isDefault: false });
    const sub = (await req('POST', '/holidays', { date: '2030-12-03', nameLo: 'ພັກຊົດເຊີຍ', nameEn: 'Substitute day', kind: 'SUBSTITUTE' })).json<Holiday>();
    expect(sub.kind).toBe('SUBSTITUTE');

    const dup = await req('POST', '/holidays', { date: '2030-10-21', nameLo: 'x', nameEn: 'x' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('date_taken');
    expect((await req('POST', '/holidays', { date: '2030-09-02', nameLo: 'x', nameEn: 'x', kind: 'NATIONAL_DAY' })).statusCode).toBe(400);
    expect((await req('POST', '/holidays', { date: '2030-13-02', nameLo: 'x', nameEn: 'x' })).statusCode).toBe(400);

    const vn = (await req('POST', '/holidays', { date: '2030-09-02', nameLo: 'ວັນຊາດຫວຽດນາມ', nameEn: 'Vietnam National Day', kind: 'NATIONAL_DAY', nationality: 'Vietnamese' })).json<Holiday>();
    expect(vn.nationality).toBe('Vietnamese');
    const clear = await req('PATCH', `/holidays/${vn.id}`, { nationality: '' });
    expect(clear.statusCode).toBe(400);
    expect(clear.json().error.code).toBe('nationality_required');
    const moved = await req('PATCH', `/holidays/${sub.id}`, { date: '2030-12-04', nameEn: 'Substitute for National Day' });
    expect(moved.json<Holiday>()).toMatchObject({ date: '2030-12-04', nameEn: 'Substitute for National Day' });
    expect((await req('PATCH', `/holidays/${sub.id}`, { date: '2030-10-21' })).json().error.code).toBe('date_taken');

    expect((await req('GET', '/holidays?year=2030')).json<Holiday[]>().map((h) => h.date)).toEqual(['2030-09-02', '2030-10-21', '2030-12-04']);
    const audit = await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findMany({ where: { entityId: sub.id }, orderBy: { createdAt: 'asc' } }));
    expect(audit.map((a) => a.action)).toEqual(['holiday.created', 'holiday.updated']);
    expect(audit[1]!.meta).toEqual({
      changes: { date: { from: '2030-12-03', to: '2030-12-04' }, nameEn: { from: 'Substitute day', to: 'Substitute for National Day' } },
    });
  });

  it('lets employees read but not change the calendar', async () => {
    const ws = await createWorkspace(t.db);
    await createUser(t.db, ws, { email: 'e@x.test', password: 'Employee123', role: 'EMPLOYEE' });
    const emp = asToken((await loginAs(t.app, ws.code, 'e@x.test', 'Employee123')).accessToken);
    expect((await emp('GET', `/holidays?year=${THIS_YEAR}`)).statusCode).toBe(200);
    expect((await emp('POST', '/holidays', { date: '2030-01-02', nameLo: 'x', nameEn: 'x' })).statusCode).toBe(403);
    expect((await emp('POST', '/holidays/ensure-year', { year: 2030 })).statusCode).toBe(403);
  });

  it('applies the women-only and nationality rules to each employee (/holidays/mine)', async () => {
    const ws = await createWorkspace(t.db);
    const req = await session(ws);
    await req('POST', '/holidays/ensure-year', { year: 2032 });
    await req('POST', '/holidays', { date: '2032-09-02', nameLo: 'ວັນຊາດຫວຽດນາມ', nameEn: 'Vietnam National Day', kind: 'NATIONAL_DAY', nationality: 'Vietnamese' });

    const make = async (key: string, extra: Record<string, unknown>) => {
      const e = (await req('POST', '/employees', employeePayload(extra))).json<CreateEmployeeResponse>().employee;
      await createUser(t.db, ws, { email: `${key}@x.test`, password: 'Employee123', role: 'EMPLOYEE', employeeId: e.id });
      const mine = await asToken((await loginAs(t.app, ws.code, `${key}@x.test`, 'Employee123')).accessToken)('GET', '/holidays/mine?year=2032');
      return mine.json<Holiday[]>().map((h) => h.date.slice(5));
    };
    const laoWoman = await make('lw', { gender: 'FEMALE' });
    const laoMan = await make('lm', { gender: 'MALE' });
    const vnMan = await make('vm', { gender: 'MALE', nationalityType: 'FOREIGN', nationality: 'vietnamese' });
    const thWoman = await make('tw', { gender: 'FEMALE', nationalityType: 'FOREIGN', nationality: 'Thai' });

    expect(laoWoman).toEqual(DEFAULT_DAYS);
    expect(laoMan).toEqual(DEFAULT_DAYS.filter((d) => d !== '03-08'));
    expect(vnMan).toEqual(['01-01', '04-14', '04-15', '04-16', '05-01', '09-02', '12-02']);
    expect(thWoman).toEqual(DEFAULT_DAYS);
  });

  it('isolates holiday calendars between workspaces', async () => {
    const a = await createWorkspace(t.db);
    const b = await createWorkspace(t.db);
    const reqA = await session(a);
    const reqB = await session(b);
    const own = (await reqA('POST', '/holidays', { date: '2033-02-10', nameLo: 'A', nameEn: 'A only' })).json<Holiday>();

    expect((await reqB('GET', '/holidays?year=2033')).json<Holiday[]>()).toEqual([]);
    expect((await reqB('PATCH', `/holidays/${own.id}`, { nameEn: 'hijack' })).statusCode).toBe(404);
    expect((await reqB('DELETE', `/holidays/${own.id}`)).statusCode).toBe(404);
    expect(await t.db.tenant(b.workspaceId, (tx) => tx.holiday.count({ where: { id: own.id } }))).toBe(0);
    await expect(
      t.db.tenant(b.workspaceId, (tx) => tx.holiday.create({ data: { workspaceId: a.workspaceId, date: new Date('2033-03-01'), nameLo: 'x', nameEn: 'x' } })),
    ).rejects.toThrow();
    expect((await reqA('GET', '/holidays?year=2033')).json<Holiday[]>().map((h) => h.nameEn)).toEqual(['A only']);
  });
});
