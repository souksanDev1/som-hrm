import { PrismaClient } from '@prisma/client';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { runPrisma } from '../scripts/prisma-cli';
import { TEST_DATABASE_URL } from './env';

/** Migration 20261120090000_branch_wifi_networks applied on top of an M5 database holding a branch, in a throw-away schema. */
const WIFI = '20261120090000_branch_wifi_networks';
const prismaDir = fileURLToPath(new URL('../prisma', import.meta.url));
const schemaName = `wifimig_${Date.now()}`;
const url = (() => {
  const u = new URL(TEST_DATABASE_URL);
  u.searchParams.set('schema', schemaName);
  u.searchParams.set('connection_limit', '1');
  return u.toString();
})();
const work = mkdtempSync(join(tmpdir(), 'hrm-wifi-migration-'));
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

describe(`migration ${WIFI}`, () => {
  it('adds an empty Wi-Fi list to existing branches (feature off) and keeps Branch under RLS', async () => {
    const all = readdirSync(join(prismaDir, 'migrations')).filter((n) => /^\d{14}_/.test(n)).sort();
    deploy(all.filter((n) => n < WIFI));

    await client.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', false)`);
    await client.$executeRawUnsafe(`INSERT INTO "Workspace" ("id", "code", "name", "updatedAt") VALUES ('ws1', 'wifi', 'Wifi', now())`);
    await client.$executeRawUnsafe(`INSERT INTO "Branch" ("id", "workspaceId", "name", "updatedAt") VALUES ('br1', 'ws1', 'HQ', now())`);

    deploy(all.filter((n) => n <= WIFI));

    const [row] = await client.$queryRawUnsafe<{ wifiNetworks: string[] }[]>(`SELECT "wifiNetworks" FROM "Branch" WHERE id = 'br1'`);
    expect(row!.wifiNetworks).toEqual([]);
    await client.$executeRawUnsafe(`UPDATE "Branch" SET "wifiNetworks" = ARRAY['SOM-Office', 'aa:bb:cc:dd:ee:ff'] WHERE id = 'br1'`);
    const [updated] = await client.$queryRawUnsafe<{ wifiNetworks: string[] }[]>(`SELECT "wifiNetworks" FROM "Branch" WHERE id = 'br1'`);
    expect(updated!.wifiNetworks).toEqual(['SOM-Office', 'aa:bb:cc:dd:ee:ff']);

    const [rls] = await client.$queryRawUnsafe<{ relrowsecurity: boolean; relforcerowsecurity: boolean }[]>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = '"${schemaName}"."Branch"'::regclass`,
    );
    expect(rls).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });
});
