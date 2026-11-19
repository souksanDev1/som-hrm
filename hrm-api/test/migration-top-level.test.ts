import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { runPrisma, runTsx } from '../scripts/prisma-cli';
import { TEST_DATABASE_URL } from './env';

/** Migration 20261122090000_employee_is_top_level and the demo seed, in a throw-away schema. */
const MIG = '20261122090000_employee_is_top_level';
const prismaDir = fileURLToPath(new URL('../prisma', import.meta.url));
const schemaName = `toplevel_${Date.now()}`;
const url = (() => {
  const u = new URL(TEST_DATABASE_URL);
  u.searchParams.set('schema', schemaName);
  u.searchParams.set('connection_limit', '1');
  return u.toString();
})();
const work = mkdtempSync(join(tmpdir(), 'hrm-toplevel-migration-'));
const client = new PrismaClient({ datasources: { db: { url } } });

const env = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: url,
  JWT_SECRET: randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
};

afterAll(async () => {
  await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await client.$disconnect();
  rmSync(work, { recursive: true, force: true });
});

describe(`migration ${MIG}`, () => {
  it('adds Employee.isTopLevel (default false) and the seed makes E001 the top of the organisation', async () => {
    mkdirSync(join(work, 'migrations'), { recursive: true });
    cpSync(join(prismaDir, 'schema.prisma'), join(work, 'schema.prisma'));
    cpSync(join(prismaDir, 'migrations', 'migration_lock.toml'), join(work, 'migrations', 'migration_lock.toml'));
    for (const n of readdirSync(join(prismaDir, 'migrations')).filter((d) => /^\d{14}_/.test(d))) {
      cpSync(join(prismaDir, 'migrations', n), join(work, 'migrations', n), { recursive: true });
    }
    runPrisma(['migrate', 'deploy', '--schema', join(work, 'schema.prisma')], env);

    await client.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', false)`);
    await client.$executeRawUnsafe(`INSERT INTO "Workspace" ("id", "code", "name", "updatedAt") VALUES ('ws1', 'toplevel', 'Top', now())`);
    await client.$executeRawUnsafe(
      `INSERT INTO "Employee" ("id", "workspaceId", "employeeCode", "firstName", "lastName", "gender", "hireDate", "contractType", "payType", "updatedAt")
       VALUES ('e1', 'ws1', 'E1', 'A', 'B', 'FEMALE', '2020-01-01', 'INDEFINITE', 'MONTHLY', now())`,
    );
    const [plain] = await client.$queryRawUnsafe<{ isTopLevel: boolean }[]>(`SELECT "isTopLevel" FROM "Employee" WHERE "id" = 'e1'`);
    expect(plain!.isTopLevel).toBe(false);

    runTsx('prisma/seed.ts', env);

    const seeded = await client.$queryRawUnsafe<{ employeeCode: string; isTopLevel: boolean; managerId: string | null; departmentId: string | null }[]>(
      `SELECT e."employeeCode", e."isTopLevel", e."managerId", e."departmentId" FROM "Employee" e JOIN "Workspace" w ON w."id" = e."workspaceId" WHERE w."code" = 'som-demo' ORDER BY e."employeeCode"`,
    );
    expect(seeded.length).toBeGreaterThanOrEqual(4);
    const boss = seeded.find((e) => e.employeeCode === 'E001')!;
    expect(boss.isTopLevel).toBe(true);
    expect(boss.managerId).toBeNull();
    for (const e of seeded) expect(e.departmentId, e.employeeCode).not.toBeNull();
  }, 120_000);
});
