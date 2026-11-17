import { PrismaClient } from '@prisma/client';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { runPrisma } from '../scripts/prisma-cli';
import { TEST_DATABASE_URL } from './env';

/**
 * Migration 20261118092000_employee_import_permission: every role holding `employee.write` (built-in or
 * custom) keeps the ability to import; roles without it get nothing.
 */
const MIG = '20261118092000_employee_import_permission';
const prismaDir = fileURLToPath(new URL('../prisma', import.meta.url));
const schemaName = `impmig_${Date.now()}`;
const url = (() => {
  const u = new URL(TEST_DATABASE_URL);
  u.searchParams.set('schema', schemaName);
  u.searchParams.set('connection_limit', '1');
  return u.toString();
})();
const work = mkdtempSync(join(tmpdir(), 'hrm-import-perm-migration-'));
const client = new PrismaClient({ datasources: { db: { url } } });

const deploy = (names: string[]) => {
  mkdirSync(join(work, 'migrations'), { recursive: true });
  cpSync(join(prismaDir, 'schema.prisma'), join(work, 'schema.prisma'));
  cpSync(join(prismaDir, 'migrations', 'migration_lock.toml'), join(work, 'migrations', 'migration_lock.toml'));
  for (const n of names) cpSync(join(prismaDir, 'migrations', n), join(work, 'migrations', n), { recursive: true });
  runPrisma(['migrate', 'deploy', '--schema', join(work, 'schema.prisma')], { ...process.env, DATABASE_URL: url });
};

afterAll(async () => {
  await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await client.$disconnect();
  rmSync(work, { recursive: true, force: true });
});

describe(`migration ${MIG}`, () => {
  it('grants employee.import to exactly the roles that hold employee.write', async () => {
    const before = readdirSync(join(prismaDir, 'migrations')).filter((n) => /^\d{14}_/.test(n) && n < MIG).sort();
    deploy(before);

    await client.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', false)`);
    await client.$executeRawUnsafe(`INSERT INTO "Workspace" ("id", "code", "name", "updatedAt") VALUES ('ws1', 'impmig', 'Mig', now())`);
    await client.$executeRawUnsafe(`INSERT INTO "Permission" ("id", "key") VALUES ('pw', 'employee.write'), ('pr', 'employee.read') ON CONFLICT ("key") DO NOTHING`);
    const roles: [string, boolean, string | null][] = [['OWNER', true, 'employee.write'], ['HR_ADMIN', true, 'employee.write'], ['MANAGER', true, 'employee.read'], ['CLERK', false, 'employee.write'], ['EMPLOYEE', true, null]];
    for (const [code, isSystem, perm] of roles) {
      await client.$executeRawUnsafe(`INSERT INTO "Role" ("id", "workspaceId", "code", "name", "isSystem") VALUES ($1, 'ws1', $1, $1, $2)`, code, isSystem);
      if (perm) {
        await client.$executeRawUnsafe(
          `INSERT INTO "RolePermission" ("workspaceId", "roleId", "permissionId") SELECT 'ws1', $1, "id" FROM "Permission" WHERE "key" = $2`, code, perm,
        );
      }
    }

    deploy([...before, MIG]);

    const grants = await client.$queryRawUnsafe<{ role: string }[]>(
      `SELECT r."code" AS role FROM "RolePermission" rp JOIN "Role" r ON r."id" = rp."roleId" JOIN "Permission" p ON p."id" = rp."permissionId"
       WHERE p."key" = 'employee.import' ORDER BY r."code"`,
    );
    expect(grants.map((g) => g.role)).toEqual(['CLERK', 'HR_ADMIN', 'OWNER']);
  });
});
