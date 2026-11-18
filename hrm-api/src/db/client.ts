import { Prisma, PrismaClient } from '@prisma/client';
import { AUTH_CHANNEL, authChangeOf, authChangeScope, AuthChangeSet, toNotifyPayload, type AuthChange } from './auth-changes';

export type Tx = Prisma.TransactionClient;

/**
 * Database access gateway.
 *
 * All tenant data is protected by PostgreSQL row-level security. Every query
 * must run inside `tenant()` (scoped to one workspace) or, for the few
 * cross-tenant operations such as sign-in and seeding, inside `system()`.
 * Queries outside these helpers see no tenant rows (fail-closed).
 */
export interface TxOptions {
  /** Overrides the default transaction timeout for known long-running work (e.g. a bulk import). */
  timeoutMs?: number;
}

export interface Db {
  readonly client: PrismaClient;
  tenant<T>(workspaceId: string, fn: (tx: Tx) => Promise<T>, opts?: TxOptions): Promise<T>;
  system<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /**
   * Called after a committed transaction changed users, roles, permissions or workspaces (see db/auth-changes).
   * Returns an unsubscribe function.
   */
  onAuthChange(listener: (change: AuthChange) => void): () => void;
  disconnect(): Promise<void>;
}

const TENANT_TX = { maxWait: 5_000, timeout: 10_000 };
/** System work (seeding, bootstrap) may hash many secrets. */
const SYSTEM_TX = { maxWait: 5_000, timeout: 60_000 };

export const createDb = (url: string): Db => {
  const listeners = new Set<(change: AuthChange) => void>();
  const publish = (change: AuthChange) => listeners.forEach((l) => l(change));

  const client = new PrismaClient({ datasources: { db: { url } } }).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          const change = authChangeOf(model, operation, args as Parameters<typeof authChangeOf>[2]);
          if (change) {
            const scope = authChangeScope.getStore();
            if (scope) scope.add(change);
            else publish(change); // autocommit write outside tenant()/system()
          }
          return result;
        },
      },
    },
  }) as unknown as PrismaClient;

  /** Run `fn` in a transaction; announce its auth-relevant writes once it commits (pg_notify is transactional). */
  const transaction = async <T>(setup: (tx: Tx) => Promise<unknown>, fn: (tx: Tx) => Promise<T>, options: { maxWait: number; timeout: number }) => {
    const changes = new AuthChangeSet();
    const result = await authChangeScope.run(changes, () =>
      client.$transaction(async (tx) => {
        await setup(tx);
        const value = await fn(tx);
        if (!changes.empty) await tx.$executeRaw`SELECT pg_notify(${AUTH_CHANNEL}, ${toNotifyPayload(changes.toChange())})`;
        return value;
      }, options),
    );
    if (!changes.empty) publish(changes.toChange());
    return result;
  };

  return {
    client,
    tenant: (workspaceId, fn, opts) =>
      transaction(
        (tx) => tx.$executeRaw`SELECT set_config('app.workspace_id', ${workspaceId}, true)`,
        fn,
        { ...TENANT_TX, ...(opts?.timeoutMs ? { timeout: opts.timeoutMs } : {}) },
      ),
    system: (fn) => transaction((tx) => tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`, fn, SYSTEM_TX),
    onAuthChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    disconnect: () => client.$disconnect(),
  };
};

/** True when a Prisma error is a unique-constraint violation. */
export const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
