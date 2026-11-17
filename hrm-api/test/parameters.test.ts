import { isoDateInTimeZone, type ParameterList, type ParameterView } from '@hrm/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parameterReader } from '../src/modules/parameters/parameters.service';
import { parseIsoDate } from '../src/lib/dates';
import { api, bearer, createTestContext, createUser, createWorkspace, loginAs, OWNER_PASSWORD, type TestContext, type WorkspaceFixture } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const ownerToken = async (ws: WorkspaceFixture) => (await loginAs(t.app, ws.code, ws.ownerEmail, OWNER_PASSWORD)).accessToken;
const list = (token: string) => t.app.inject({ method: 'GET', url: api('/settings/parameters'), headers: bearer(token) });
const post = (token: string, payload: Record<string, unknown>) =>
  t.app.inject({ method: 'POST', url: api('/settings/parameters'), headers: bearer(token), payload });
const today = () => isoDateInTimeZone('Asia/Vientiane');
const FUTURE = '2099-01-01';

describe('GET /settings/parameters', () => {
  it('lists workspace keys with defaults, units and no system keys', async () => {
    const ws = await createWorkspace(t.db);
    const res = await list(await ownerToken(ws));
    expect(res.statusCode).toBe(200);
    const body = res.json<ParameterList>();
    expect(body.asOf).toBe(today());
    const keys = body.items.map((i) => i.key);
    expect(keys).toContain('approval.escalationWorkingDays');
    expect(keys).not.toContain('otp.length');
    const alert = body.items.find((i) => i.key === 'document.expiryAlertDays')!;
    expect(alert).toMatchObject({ currentValue: [90, 60, 30, 7], source: 'default', unit: 'days', labelKey: 'param.document.expiryAlertDays', history: [], scheduled: [] });
  });

  it('lets HR read, change only the document-alert days (FR-EMP-05.3); employees can do neither', async () => {
    const ws = await createWorkspace(t.db);
    await createUser(t.db, ws, { email: 'hr@x.test', password: 'Hr12345678', role: 'HR_ADMIN' });
    await createUser(t.db, ws, { email: 'emp@x.test', password: 'Emp12345678', role: 'EMPLOYEE' });
    const hr = (await loginAs(t.app, ws.code, 'hr@x.test', 'Hr12345678')).accessToken;
    const emp = (await loginAs(t.app, ws.code, 'emp@x.test', 'Emp12345678')).accessToken;
    const change = { key: 'approval.escalationWorkingDays', value: 3, effectiveFrom: FUTURE, reason: 'x' };

    expect((await list(hr)).statusCode).toBe(200);
    expect((await post(hr, change)).statusCode).toBe(403);
    const alertDays = { key: 'document.expiryAlertDays', value: [60, 14], effectiveFrom: FUTURE, reason: 'HR policy' };
    expect((await post(hr, alertDays)).statusCode).toBe(201);
    expect((await list(emp)).statusCode).toBe(403);
    expect((await post(emp, change)).statusCode).toBe(403);
    expect((await post(emp, alertDays)).statusCode).toBe(403);
  });
});

describe('POST /settings/parameters', () => {
  it('applies a change from today: reader, view, history and audit (old/new/who)', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const res = await post(token, { key: 'approval.escalationWorkingDays', value: 3, effectiveFrom: today(), reason: 'Policy 2026' });
    expect(res.statusCode).toBe(201);
    const view = res.json<ParameterView>();
    expect(view).toMatchObject({ currentValue: 3, source: 'configured' });
    expect(view.history[0]).toMatchObject({ value: 3, effectiveFrom: today(), reason: 'Policy 2026', createdByName: 'Owner' });

    const effective = await t.db.tenant(ws.workspaceId, (tx) =>
      parameterReader.workspace(tx, ws.workspaceId, 'approval.escalationWorkingDays', parseIsoDate(today())),
    );
    expect(effective).toBe(3);

    const audit = await t.db.tenant(ws.workspaceId, (tx) => tx.auditLog.findFirst({ where: { workspaceId: ws.workspaceId, action: 'parameter.change' } }));
    expect(audit?.actorUserId).toBeTruthy();
    expect(audit?.meta).toMatchObject({ key: 'approval.escalationWorkingDays', oldValue: 2, newValue: 3, reason: 'Policy 2026' });

    // A value already effective today cannot be overwritten (it may have been used).
    const again = await post(token, { key: 'approval.escalationWorkingDays', value: 4, effectiveFrom: today(), reason: 'oops' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('parameter_already_changed_today');
  });

  it('schedules future changes without touching today, and can replace a scheduled one', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const first = await post(token, { key: 'document.expiryAlertDays', value: [60, 30], effectiveFrom: FUTURE, reason: 'plan' });
    expect(first.statusCode).toBe(201);
    expect(first.json<ParameterView>()).toMatchObject({ currentValue: [90, 60, 30, 7], source: 'default' });
    const second = await post(token, { key: 'document.expiryAlertDays', value: [45], effectiveFrom: FUTURE, reason: 'replan' });
    const view = second.json<ParameterView>();
    expect(view.scheduled).toHaveLength(1);
    expect(view.scheduled[0]).toMatchObject({ value: [45], effectiveFrom: FUTURE, reason: 'replan' });
    const actions = await t.db.tenant(ws.workspaceId, (tx) =>
      tx.auditLog.findMany({ where: { workspaceId: ws.workspaceId, entity: 'WorkspaceParameter' }, orderBy: { createdAt: 'asc' }, select: { action: true } }),
    );
    expect(actions.map((a) => a.action)).toEqual(['parameter.change', 'parameter.reschedule']);
  });

  it('rejects invalid values with the registry code (FR-WS-08.3)', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const base = { key: 'approval.escalationWorkingDays', effectiveFrom: FUTURE, reason: 'x' };
    const range = await post(token, { ...base, value: 99 });
    expect(range.statusCode).toBe(400);
    expect(range.json().error).toMatchObject({ code: 'out_of_range', details: { field: 'value' } });
    expect((await post(token, { ...base, value: true })).json().error.code).toBe('invalid_type');
    expect((await post(token, { ...base, key: 'document.expiryAlertDays', value: [1, 2, 3, 4, 5, 6, 7] })).json().error.code).toBe('too_many_items');
    expect((await post(token, { ...base, key: 'no.such.key', value: 1 })).json().error.code).toBe('unknown_parameter');
    expect((await post(token, { ...base, value: 3, reason: '' })).statusCode).toBe(400);
  });

  it('rejects system keys with 403 and past dates with 400', async () => {
    const ws = await createWorkspace(t.db);
    const token = await ownerToken(ws);
    const sys = await post(token, { key: 'auth.lockout.maxAttempts', value: 10, effectiveFrom: FUTURE, reason: 'x' });
    expect(sys.statusCode).toBe(403);
    expect(sys.json().error.code).toBe('system_parameter_forbidden');
    const past = await post(token, { key: 'approval.escalationWorkingDays', value: 3, effectiveFrom: '2020-01-01', reason: 'x' });
    expect(past.statusCode).toBe(400);
    expect(past.json().error.code).toBe('effective_date_in_past');
  });

  it('isolates parameters between workspaces', async () => {
    const a = await createWorkspace(t.db);
    const b = await createWorkspace(t.db);
    expect((await post(await ownerToken(a), { key: 'notification.smsEnabled', value: true, effectiveFrom: today(), reason: 'x' })).statusCode).toBe(201);

    const bView = (await list(await ownerToken(b))).json<ParameterList>().items.find((i) => i.key === 'notification.smsEnabled')!;
    expect(bView).toMatchObject({ currentValue: false, source: 'default' });
    // RLS: workspace B's transaction cannot see A's rows, even when asking for them explicitly.
    const leaked = await t.db.tenant(b.workspaceId, (tx) => tx.workspaceParameter.findMany({ where: { workspaceId: a.workspaceId } }));
    expect(leaked).toHaveLength(0);
  });
});
