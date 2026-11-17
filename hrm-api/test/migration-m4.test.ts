import { PrismaClient } from '@prisma/client';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { runPrisma } from '../scripts/prisma-cli';
import { TEST_DATABASE_URL } from './env';

/**
 * Migration 20261118090000_m4_approvals applied on top of an M3 database that already holds a
 * workspace with its built-in roles, in a throw-away PostgreSQL schema of the test database.
 */
const M4 = '20261118090000_m4_approvals';
const prismaDir = fileURLToPath(new URL('../prisma', import.meta.url));
const schemaName = `m4mig_${Date.now()}`;
const url = (() => {
  const u = new URL(TEST_DATABASE_URL);
  u.searchParams.set('schema', schemaName);
  u.searchParams.set('connection_limit', '1');
  return u.toString();
})();
const work = mkdtempSync(join(tmpdir(), 'hrm-m4-migration-'));
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

describe(`migration ${M4}`, () => {
  it('grants the approval permissions to existing OWNER/HR_ADMIN roles and protects the new tables with RLS', async () => {
    const before = readdirSync(join(prismaDir, 'migrations')).filter((n) => /^\d{14}_/.test(n) && n < M4).sort();
    deploy(before);

    await client.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', false)`);
    await client.$executeRawUnsafe(`INSERT INTO "Workspace" ("id", "code", "name", "updatedAt") VALUES ('ws1', 'mig4', 'Mig', now())`);
    for (const code of ['OWNER', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE']) {
      await client.$executeRawUnsafe(`INSERT INTO "Role" ("id", "workspaceId", "code", "name", "isSystem") VALUES ($1, 'ws1', $1, $1, true)`, code);
    }
    await client.$executeRawUnsafe(`INSERT INTO "Role" ("id", "workspaceId", "code", "name", "isSystem") VALUES ('custom', 'ws1', 'OWNER_LIKE', 'Custom', false)`);

    deploy([...before, M4]);

    const grants = await client.$queryRawUnsafe<{ role: string; key: string }[]>(
      `SELECT r."code" AS role, p."key" AS key FROM "RolePermission" rp
       JOIN "Role" r ON r."id" = rp."roleId" JOIN "Permission" p ON p."id" = rp."permissionId"
       WHERE p."key" LIKE 'approval.%' ORDER BY r."code", p."key"`,
    );
    expect(grants).toEqual([
      { role: 'HR_ADMIN', key: 'approval.delegate.manage' },
      { role: 'HR_ADMIN', key: 'approval.hr_fallback' },
      { role: 'OWNER', key: 'approval.delegate.manage' },
      { role: 'OWNER', key: 'approval.hr_fallback' },
    ]);

    const rls = await client.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = '${schemaName}' AND c.relname IN ('ApprovalRequest', 'ApprovalStep') ORDER BY c.relname`,
    );
    expect(rls).toEqual([
      { relname: 'ApprovalRequest', relrowsecurity: true, relforcerowsecurity: true },
      { relname: 'ApprovalStep', relrowsecurity: true, relforcerowsecurity: true },
    ]);
    const leftovers = await client.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = '${schemaName}' AND table_name = 'LeaveApproval'`,
    );
    expect(Number(leftovers[0]!.n)).toBe(0);
  });
});
