/**
 * Local PostgreSQL for development and tests, without a system install.
 *
 *   pnpm db:start            # runs until Ctrl+C
 *
 * Starts PostgreSQL 16 (embedded-postgres binaries) on port 5432 with data in
 * hrm-api/.pgdata, then ensures a NON-superuser role `hrm` (password `hrm`)
 * owning the `hrm` and `hrm_test` databases. A non-superuser is required so
 * row-level security is enforced. If you already run PostgreSQL elsewhere,
 * skip this script and point DATABASE_URL / TEST_DATABASE_URL at it.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.LOCAL_PG_PORT ?? 5432);
const databaseDir = fileURLToPath(new URL('../.pgdata', import.meta.url));

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  onLog: () => undefined,
});

const main = async () => {
  if (!existsSync(databaseDir)) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  const role = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'hrm'`);
  if (!role.rowCount) await client.query(`CREATE ROLE hrm LOGIN PASSWORD 'hrm' NOSUPERUSER CREATEDB NOBYPASSRLS`);
  for (const db of ['hrm', 'hrm_test']) {
    const exists = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [db]);
    if (!exists.rowCount) await client.query(`CREATE DATABASE ${db} OWNER hrm`);
  }
  await client.end();
  console.warn(`PostgreSQL ready on postgresql://hrm:hrm@localhost:${port}/hrm (Ctrl+C to stop)`);
};

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());

main().catch(async (err) => {
  console.error(err);
  await pg.stop().catch(() => undefined);
  process.exit(1);
});
