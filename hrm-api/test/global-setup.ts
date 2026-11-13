import { PrismaClient } from '@prisma/client';
import { runPrisma } from '../scripts/prisma-cli';
import { TEST_DATABASE_URL } from './env';

/**
 * Prepare the dedicated test database: wipe its `public` schema and apply all
 * migrations with `prisma migrate deploy`. Refuses to touch any database whose
 * name does not end in `_test`, so a misconfigured URL can never wipe real data.
 */
export default async function setup() {
  const dbName = new URL(TEST_DATABASE_URL).pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset "${dbName}": TEST_DATABASE_URL must point to a *_test database`);
  }
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  } finally {
    await prisma.$disconnect();
  }
  runPrisma(['migrate', 'deploy'], { ...process.env, DATABASE_URL: TEST_DATABASE_URL });
}
