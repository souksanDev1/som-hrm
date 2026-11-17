import { PrismaClient } from '@prisma/client';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { runPrisma } from '../scripts/prisma-cli';
import { TEST_DATABASE_URL } from './env';

/**
 * Migration 20261119090000_m5_attendance applied on top of an M4 database that already holds a workspace with
 * its built-in roles, a shift, a branch and two active device bindings of one user, in a throw-away schema.
 */
const M5 = '20261119090000_m5_attendance';
const prismaDir = fileURLToPath(new URL('../prisma', import.meta.url));
const schemaName = `m5mig_${Date.now()}`;
const url = (() => {
  const u = new URL(TEST_DATABASE_URL);
  u.searchParams.set('schema', schemaName);
  u.searchParams.set('connection_limit', '1');
  return u.toString();
})();
const work = mkdtempSync(join(tmpdir(), 'hrm-m5-migration-'));
const client = new PrismaClient({ datasources: { db: { url } } });

const deploy = (names: string[]) => {
  mkdirSync(join(work, 'migrations'), { recursive: true });
  cpSync(join(prismaDir, 'schema.prisma'), join(work, 'schema.prisma'));
  cpSync(join(prismaDir, 'migrations', 'migration_lock.toml'), join(work, 'migrations', 'migration_lock.toml'));
  for (const n of names) cpSync(join(prismaDir, 'migrations', n), join(work, 'migrations', n), { recursive: true });
  runPrisma(['migrate', 'deploy', '--schema', join(work, 'schema.prisma')], { ...process.env, DATABASE_URL: url });
};

const NEW_TABLES = ['AttendanceDay', 'AttendancePunch', 'DeviceChangeRequest', 'KioskDevice', 'OffsitePermission', 'OvertimeRequest', 'ShiftRoster'];

afterAll(async () => {
  await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await client.$disconnect();
  rmSync(work, { recursive: true, force: true });
});

describe(`migration ${M5}`, () => {
  it('replaces AttendanceRecord, grants the attendance permissions, keeps one active device and protects new tables with RLS', async () => {
    const before = readdirSync(join(prismaDir, 'migrations')).filter((n) => /^\d{14}_/.test(n) && n < M5).sort();
    deploy(before);

    await client.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', false)`);
    await client.$executeRawUnsafe(`INSERT INTO "Workspace" ("id", "code", "name", "updatedAt") VALUES ('ws1', 'mig5', 'Mig', now())`);
    for (const code of ['OWNER', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE']) {
      await client.$executeRawUnsafe(`INSERT INTO "Role" ("id", "workspaceId", "code", "name", "isSystem") VALUES ($1, 'ws1', $1, $1, true)`, code);
    }
    await client.$executeRawUnsafe(
      `INSERT INTO "Shift" ("id", "workspaceId", "name", "startTime", "endTime") VALUES ('sh1', 'ws1', 'Day', '08:00', '17:00')`,
    );
    await client.$executeRawUnsafe(`INSERT INTO "Branch" ("id", "workspaceId", "name", "updatedAt") VALUES ('br1', 'ws1', 'HQ', now())`);
    await client.$executeRawUnsafe(`INSERT INTO "User" ("id", "workspaceId", "displayName", "updatedAt") VALUES ('u1', 'ws1', 'U', now())`);
    await client.$executeRawUnsafe(
      `INSERT INTO "DeviceBinding" ("id", "workspaceId", "userId", "deviceId", "platform", "createdAt") VALUES
       ('d_old', 'ws1', 'u1', 'phone-a', 'ANDROID', now() - interval '1 day'), ('d_new', 'ws1', 'u1', 'phone-b', 'ANDROID', now())`,
    );

    deploy([...before, M5]);

    const grants = await client.$queryRawUnsafe<{ role: string; n: bigint }[]>(
      `SELECT r."code" AS role, count(*) AS n FROM "RolePermission" rp
       JOIN "Role" r ON r."id" = rp."roleId" JOIN "Permission" p ON p."id" = rp."permissionId"
       WHERE p."key" IN ('attendance.review', 'attendance.punch_on_behalf', 'attendance.device.manage', 'attendance.offsite.manage',
                         'scan.import', 'kiosk.manage', 'shift.manage')
       GROUP BY r."code" ORDER BY r."code"`,
    );
    expect(grants.map((g) => [g.role, Number(g.n)])).toEqual([
      ['HR_ADMIN', 7],
      ['OWNER', 7],
    ]);

    const rls = await client.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = '${schemaName}' AND c.relkind = 'r' AND c.relname = ANY($1) ORDER BY c.relname`,
      NEW_TABLES,
    );
    expect(rls).toEqual(NEW_TABLES.map((relname) => ({ relname, relrowsecurity: true, relforcerowsecurity: true })));

    const gone = await client.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = '${schemaName}' AND table_name IN ('AttendanceRecord', 'OvertimeRecord')`,
    );
    expect(Number(gone[0]!.n)).toBe(0);

    const shift = await client.$queryRawUnsafe<{ late: number | null; early: number | null }[]>(
      `SELECT "lateGraceMinutes" AS late, "earlyGraceMinutes" AS early FROM "Shift" WHERE "id" = 'sh1'`,
    );
    expect(shift).toEqual([{ late: null, early: null }]);

    const branch = await client.$queryRawUnsafe<{ modes: string }[]>(`SELECT "attendanceModes"::text AS modes FROM "Branch" WHERE "id" = 'br1'`);
    expect(branch[0]!.modes).toBe('{MOBILE}');

    const devices = await client.$queryRawUnsafe<{ id: string; isActive: boolean }[]>(
      `SELECT "id", "isActive" FROM "DeviceBinding" ORDER BY "id"`,
    );
    expect(devices).toEqual([
      { id: 'd_new', isActive: true },
      { id: 'd_old', isActive: false },
    ]);
    await expect(client.$executeRawUnsafe(`UPDATE "DeviceBinding" SET "isActive" = true WHERE "id" = 'd_old'`)).rejects.toThrow();
  });
});
