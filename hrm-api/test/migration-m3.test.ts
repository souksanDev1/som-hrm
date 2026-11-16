import { PrismaClient } from '@prisma/client';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { runPrisma } from '../scripts/prisma-cli';
import { TEST_DATABASE_URL } from './env';

/**
 * Data migration 20261117092000_m3_employee_data: applied on top of the M2 schema holding rows with
 * the old EmploymentType, in a throw-away PostgreSQL schema of the test database.
 */
const M3 = '20261117092000_m3_employee_data';
const prismaDir = fileURLToPath(new URL('../prisma', import.meta.url));
const schemaName = `m3mig_${Date.now()}`;
const url = (() => {
  const u = new URL(TEST_DATABASE_URL);
  u.searchParams.set('schema', schemaName);
  u.searchParams.set('connection_limit', '1');
  return u.toString();
})();
const work = mkdtempSync(join(tmpdir(), 'hrm-m3-migration-'));
const client = new PrismaClient({ datasources: { db: { url } } });

/** Deploy the migrations in `names` from a temporary copy of prisma/migrations. */
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

describe(`migration ${M3}`, () => {
  it('splits EmploymentType into contractType + payType, backfills English names and drops the old column', async () => {
    const before = readdirSync(join(prismaDir, 'migrations')).filter((n) => /^\d{14}_/.test(n) && n < M3).sort();
    deploy(before);

    await client.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', false)`);
    await client.$executeRawUnsafe(`INSERT INTO "Workspace" ("id", "code", "name", "updatedAt") VALUES ('ws1', 'mig', 'Mig', now())`);
    const rows: [string, string, string, string][] = [
      ['FULL_TIME', 'ສົມໃຈ', 'ດວງດີ', 'ACTIVE'],
      ['PART_TIME', 'Somchai', 'Vong', 'ACTIVE'],
      ['DAILY', 'Nguyen', "Van An-O'Neil", 'PROBATION'],
      ['HOURLY', 'Lee', 'ລາວ', 'ACTIVE'],
      ['CONTRACT', 'A', 'B', 'RESIGNED'],
    ];
    for (const [i, [type, first, last, status]] of rows.entries()) {
      await client.$executeRawUnsafe(
        `INSERT INTO "Employee" ("id", "workspaceId", "employeeCode", "firstName", "lastName", "gender", "hireDate", "employmentType", "status", "updatedAt")
         VALUES ($1, 'ws1', $1, $2, $3, 'MALE', '2024-01-01', $4::"EmploymentType", $5::"EmploymentStatus", now())`,
        `E${i}`, first, last, type, status,
      );
    }

    deploy([...before, M3]);

    const after = await client.$queryRawUnsafe<{ id: string; contractType: string; payType: string; firstNameEn: string | null; lastNameEn: string | null }[]>(
      `SELECT "id", "contractType"::text, "payType"::text, "firstNameEn", "lastNameEn" FROM "Employee" ORDER BY "id"`,
    );
    expect(after.map((r) => [r.id, r.contractType, r.payType, r.firstNameEn, r.lastNameEn])).toEqual([
      ['E0', 'INDEFINITE', 'MONTHLY', null, null], // Lao name: no English copy
      ['E1', 'INDEFINITE', 'HOURLY', 'Somchai', 'Vong'],
      ['E2', 'INDEFINITE', 'DAILY', 'Nguyen', "Van An-O'Neil"],
      ['E3', 'INDEFINITE', 'HOURLY', null, null], // mixed script: left for HR
      ['E4', 'FIXED_TERM', 'MONTHLY', 'A', 'B'],
    ]);
    const leftovers = await client.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = 'Employee' AND column_name = 'employmentType'`,
    );
    expect(Number(leftovers[0]!.n)).toBe(0);
    const nullable = await client.$queryRawUnsafe<{ column_name: string; is_nullable: string }[]>(
      `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = 'Employee' AND column_name IN ('contractType', 'payType') ORDER BY column_name`,
    );
    expect(nullable).toEqual([{ column_name: 'contractType', is_nullable: 'NO' }, { column_name: 'payType', is_nullable: 'NO' }]);
  });
});
