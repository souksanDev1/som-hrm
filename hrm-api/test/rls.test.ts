import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, createWorkspace, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

const addEmployee = (workspaceId: string, code: string) =>
  t.db.tenant(workspaceId, (tx) =>
    tx.employee.create({
      data: { workspaceId, employeeCode: code, firstName: 'x', lastName: 'y', gender: 'MALE', hireDate: new Date('2024-01-01'), employmentType: 'FULL_TIME' },
    }),
  );

describe('PostgreSQL row-level security', () => {
  it('isolates tenants even when the query forgets a workspace filter', async () => {
    const a = await createWorkspace(t.db);
    const b = await createWorkspace(t.db);
    await addEmployee(a.workspaceId, 'A1');
    await addEmployee(b.workspaceId, 'B1');

    const seenByA = await t.db.tenant(a.workspaceId, (tx) => tx.employee.findMany({ select: { employeeCode: true } }));
    expect(seenByA.map((e) => e.employeeCode)).toEqual(['A1']);
  });

  it('returns nothing outside a tenant/system scope (fail closed)', async () => {
    const a = await createWorkspace(t.db);
    await addEmployee(a.workspaceId, 'A1');
    expect(await t.db.client.employee.count()).toBe(0);
  });

  it('blocks writes into another workspace', async () => {
    const a = await createWorkspace(t.db);
    const b = await createWorkspace(t.db);
    await expect(
      t.db.tenant(a.workspaceId, (tx) =>
        tx.employee.create({
          data: { workspaceId: b.workspaceId, employeeCode: 'X', firstName: 'x', lastName: 'y', gender: 'MALE', hireDate: new Date(), employmentType: 'FULL_TIME' },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
