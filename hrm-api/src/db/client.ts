import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

/**
 * Database access gateway.
 *
 * All tenant data is protected by PostgreSQL row-level security. Every query
 * must run inside `tenant()` (scoped to one workspace) or, for the few
 * cross-tenant operations such as sign-in and seeding, inside `system()`.
 * Queries outside these helpers see no tenant rows (fail-closed).
 */
export interface Db {
  readonly client: PrismaClient;
  tenant<T>(workspaceId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  system<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  disconnect(): Promise<void>;
}

const TENANT_TX = { maxWait: 5_000, timeout: 10_000 };
/** System work (seeding, bootstrap) may hash many secrets. */
const SYSTEM_TX = { maxWait: 5_000, timeout: 60_000 };

export const createDb = (url: string): Db => {
  const client = new PrismaClient({ datasources: { db: { url } } });
  return {
    client,
    tenant: (workspaceId, fn) =>
      client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`;
        return fn(tx);
      }, TENANT_TX),
    system: (fn) =>
      client.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
        return fn(tx);
      }, SYSTEM_TX),
    disconnect: () => client.$disconnect(),
  };
};

/** True when a Prisma error is a unique-constraint violation. */
export const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
