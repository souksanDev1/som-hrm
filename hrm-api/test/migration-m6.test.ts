import { PrismaClient } from '@prisma/client';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { runPrisma } from '../scripts/prisma-cli';
import { TEST_DATABASE_URL } from './env';

/**
 * Migration 20261121090000_m6_leave applied on top of an M5 database holding a workspace with its statutory leave
 * types, a LeaveBalance counter row and an already approved leave, in a throw-away schema.
 */
const M6 = '20261121090000_m6_leave';
const prismaDir = fileURLToPath(new URL('../prisma', import.meta.url));
const schemaName = `m6mig_${Date.now()}`;
const url = (() => {
  const u = new URL(TEST_DATABASE_URL);
  u.searchParams.set('schema', schemaName);
  u.searchParams.set('connection_limit', '1');
  return u.toString();
})();
const work = mkdtempSync(join(tmpdir(), 'hrm-m6-migration-'));
const client = new PrismaClient({ datasources: { db: { url } } });

const deploy = (names: string[]) => {
  mkdirSync(join(work, 'migrations'), { recursive: true });
  cpSync(join(prismaDir, 'schema.prisma'), join(work, 'schema.prisma'));
  cpSync(join(prismaDir, 'migrations', 'migration_lock.toml'), join(work, 'migrations', 'migration_lock.toml'));
  for (const n of names) cpSync(join(prismaDir, 'migrations', n), join(work, 'migrations', n), { recursive: true });
  runPrisma(['migrate', 'deploy', '--schema', join(work, 'schema.prisma')], { ...process.env, DATABASE_URL: url });
};

const NEW_TABLES = ['LeaveCancelRequest', 'LeaveLedgerEntry'];
const TYPES: [string, string, number, number][] = [
  // code, category, days, minServiceDays
  ['ANNUAL', 'ANNUAL', 15, 365],
  ['SICK', 'SICK', 30, 0],
  ['MATERNITY', 'MATERNITY', 105, 0],
  ['PERSONAL', 'PERSONAL', 3, 0],
  ['UNPAID', 'UNPAID', 0, 0],
];

afterAll(async () => {
  await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await client.$disconnect();
  rmSync(work, { recursive: true, force: true });
});

describe(`migration ${M6}`, () => {
  it('moves balances to the ledger, configures the statutory types, grants the leave permissions and protects new tables', async () => {
    const before = readdirSync(join(prismaDir, 'migrations')).filter((n) => /^\d{14}_/.test(n) && n < M6).sort();
    deploy(before);

    await client.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', false)`);
    await client.$executeRawUnsafe(`INSERT INTO "Workspace" ("id", "code", "name", "updatedAt") VALUES ('ws1', 'mig6', 'Mig', now())`);
    for (const code of ['OWNER', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE']) {
      await client.$executeRawUnsafe(`INSERT INTO "Role" ("id", "workspaceId", "code", "name", "isSystem") VALUES ($1, 'ws1', $1, $1, true)`, code);
    }
    for (const [code, category, days, minService] of TYPES) {
      await client.$executeRawUnsafe(
        `INSERT INTO "LeaveType" ("id", "workspaceId", "code", "category", "nameLo", "nameEn") VALUES ($1, 'ws1', $1, $2::"LeaveCategory", $1, $1)`,
        code,
        category,
      );
      await client.$executeRawUnsafe(
        `INSERT INTO "LeavePolicy" ("id", "workspaceId", "leaveTypeId", "daysPerYear", "minServiceDays", "carryOverMax") VALUES ($1, 'ws1', $1, $2, $3, 0)`,
        code,
        days,
        minService,
      );
    }
    await client.$executeRawUnsafe(
      `INSERT INTO "Employee" ("id", "workspaceId", "employeeCode", "firstName", "lastName", "gender", "hireDate", "contractType", "payType", "updatedAt")
       VALUES ('e1', 'ws1', 'E1', 'A', 'B', 'FEMALE', '2020-01-01', 'INDEFINITE', 'MONTHLY', now())`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "LeaveBalance" ("id", "workspaceId", "employeeId", "leaveTypeId", "year", "entitled", "carried", "used") VALUES ('b1', 'ws1', 'e1', 'ANNUAL', 2026, 15, 2, 1.5)`,
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "LeaveRequest" ("id", "workspaceId", "employeeId", "leaveTypeId", "startDate", "endDate", "days", "status", "attachmentUrl", "updatedAt") VALUES
       ('r_ok', 'ws1', 'e1', 'ANNUAL', '2026-11-16', '2026-11-17', 2, 'APPROVED', NULL, now()),
       ('r_wait', 'ws1', 'e1', 'ANNUAL', '2026-12-01', '2026-12-01', 1, 'PENDING', NULL, now())`,
    );

    deploy([...before, M6]);

    const types = await client.$queryRawUnsafe<{ code: string; counting: string; quota: string; sort: number }[]>(
      `SELECT "code", "countingMethod"::text AS counting, "quotaPeriod"::text AS quota, "sortOrder" AS sort FROM "LeaveType" ORDER BY "sortOrder"`,
    );
    expect(types).toEqual([
      { code: 'ANNUAL', counting: 'WORKING_DAYS', quota: 'YEARLY', sort: 1 },
      { code: 'SICK', counting: 'WORKING_DAYS', quota: 'YEARLY', sort: 2 },
      { code: 'MATERNITY', counting: 'CALENDAR_DAYS', quota: 'PER_EVENT', sort: 3 },
      { code: 'PERSONAL', counting: 'WORKING_DAYS', quota: 'PER_EVENT', sort: 4 },
      { code: 'UNPAID', counting: 'WORKING_DAYS', quota: 'UNLIMITED', sort: 7 },
    ]);

    const policies = await client.$queryRawUnsafe<{ id: string; min: number; pay: string; birth: string | null }[]>(
      `SELECT "id", "minServiceDays" AS min, "minServicePayTypes"::text AS pay, "multipleBirthDays"::text AS birth FROM "LeavePolicy" WHERE "id" IN ('SICK', 'MATERNITY') ORDER BY "id"`,
    );
    expect(policies).toEqual([
      { id: 'MATERNITY', min: 0, pay: '{}', birth: '120.00' },
      { id: 'SICK', min: 90, pay: '{DAILY,HOURLY}', birth: null },
    ]);

    const ledger = await client.$queryRawUnsafe<{ kind: string; days: string; req: string | null }[]>(
      `SELECT "kind"::text AS kind, "days"::text AS days, "leaveRequestId" AS req FROM "LeaveLedgerEntry" ORDER BY "kind"::text`,
    );
    expect(ledger).toEqual([
      { kind: 'ADJUST', days: '-1.50', req: null },
      { kind: 'CARRY', days: '2.00', req: null },
      { kind: 'ENTITLEMENT', days: '15.00', req: null },
      { kind: 'USAGE', days: '-2.00', req: 'r_ok' },
    ]);
    const balance = await client.$queryRawUnsafe<{ total: string }[]>(`SELECT sum("days")::text AS total FROM "LeaveLedgerEntry"`);
    expect(balance[0]!.total).toBe('13.50');

    // One grant per employee/type/year; one pending cancellation per request.
    await expect(
      client.$executeRawUnsafe(
        `INSERT INTO "LeaveLedgerEntry" ("id", "workspaceId", "employeeId", "leaveTypeId", "periodYear", "kind", "days", "effectiveDate") VALUES ('dup', 'ws1', 'e1', 'ANNUAL', 2026, 'ENTITLEMENT', 1, '2026-01-01')`,
      ),
    ).rejects.toThrow();
    await client.$executeRawUnsafe(
      `INSERT INTO "LeaveCancelRequest" ("id", "workspaceId", "leaveRequestId", "reason", "updatedAt") VALUES ('c1', 'ws1', 'r_ok', 'x', now())`,
    );
    await expect(
      client.$executeRawUnsafe(`INSERT INTO "LeaveCancelRequest" ("id", "workspaceId", "leaveRequestId", "reason", "updatedAt") VALUES ('c2', 'ws1', 'r_ok', 'y', now())`),
    ).rejects.toThrow();

    const grants = await client.$queryRawUnsafe<{ role: string; n: bigint }[]>(
      `SELECT r."code" AS role, count(*) AS n FROM "RolePermission" rp
       JOIN "Role" r ON r."id" = rp."roleId" JOIN "Permission" p ON p."id" = rp."permissionId"
       WHERE p."key" IN ('leave.file_on_behalf', 'leave.ledger.adjust', 'leave.calendar.read_all')
       GROUP BY r."code" ORDER BY r."code"`,
    );
    expect(grants.map((g) => [g.role, Number(g.n)])).toEqual([
      ['HR_ADMIN', 3],
      ['OWNER', 3],
    ]);

    const rls = await client.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = '${schemaName}' AND c.relkind = 'r' AND c.relname = ANY($1) ORDER BY c.relname`,
      NEW_TABLES,
    );
    expect(rls).toEqual(NEW_TABLES.map((relname) => ({ relname, relrowsecurity: true, relforcerowsecurity: true })));

    const gone = await client.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = '${schemaName}' AND table_name = 'LeaveBalance'`,
    );
    expect(Number(gone[0]!.n)).toBe(0);
  });
});
