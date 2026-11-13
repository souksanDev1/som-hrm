/**
 * API server for Playwright E2E runs.
 *
 * Recreates the dedicated `*_e2e` database (refuses any other name), applies
 * migrations with `prisma migrate deploy`, loads the demo seed and serves the
 * API on E2E_API_PORT (default 4100).
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createDb } from '../src/db/client';
import { runPrisma, runTsx } from './prisma-cli';

const url = process.env.E2E_DATABASE_URL ?? 'postgresql://hrm:hrm@localhost:5432/hrm_e2e?schema=public';
const dbName = new URL(url).pathname.slice(1);
if (!dbName.endsWith('_e2e')) throw new Error(`Refusing to reset "${dbName}": E2E_DATABASE_URL must point to a *_e2e database`);

const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
const exists = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
if (!exists.length) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
await admin.$disconnect();

const target = new PrismaClient({ datasources: { db: { url } } });
await target.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
await target.$executeRawUnsafe('CREATE SCHEMA public');
await target.$disconnect();

const envVars = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: url,
  JWT_SECRET: randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  PORT: process.env.E2E_API_PORT ?? '4100',
  HOST: '127.0.0.1',
  CORS_ORIGINS: process.env.E2E_WEB_ORIGIN ?? 'http://localhost:3100',
  LOGIN_RATE_LIMIT: '1000',
};
runPrisma(['migrate', 'deploy'], envVars);
runTsx('prisma/seed.ts', envVars);

const env = loadEnv(envVars);
const db = createDb(env.DATABASE_URL);
const app = await buildApp({ env, db, logger: false });
await app.listen({ port: env.PORT, host: env.HOST });
console.warn(`E2E API listening on http://${env.HOST}:${env.PORT}`);
