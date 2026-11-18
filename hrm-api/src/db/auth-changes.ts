import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

/**
 * Change feed for everything the authenticate hook resolves (user state, roles, permissions, workspace status),
 * so a cached auth context can be dropped the moment it may be stale.
 *
 * Writes are detected in the Prisma client (query extension in `db/client.ts`), collected per transaction and
 * published after it commits: in-process listeners are called directly, and `pg_notify` (sent inside the
 * transaction, so PostgreSQL delivers it only on COMMIT) reaches every other API process.
 */

/** Specific users, or everyone (role / permission / workspace changes and bulk user updates). */
export type AuthChange = { all: true } | { all?: false; userIds: string[] };

export const AUTH_CHANNEL = 'hrm_auth_changed';

/** Models whose rows feed `authService.resolve`. */
const AUTH_MODELS = new Set(['User', 'UserRole', 'Role', 'RolePermission', 'Permission', 'Workspace']);
const WRITE_OPS = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'updateManyAndReturn', 'upsert', 'delete', 'deleteMany']);
/** Sign-in bookkeeping that `resolve` never reads: updating only these leaves cached contexts valid. */
const USER_BOOKKEEPING = new Set(['failedAttempts', 'lockedUntil', 'lastLoginAt', 'updatedAt']);

type Args = { where?: { id?: unknown; userId?: unknown; [field: string]: unknown }; data?: unknown; update?: unknown; create?: unknown } | undefined;

const onlyBookkeeping = (data: unknown) => !!data && typeof data === 'object' && Object.keys(data).every((k) => USER_BOOKKEEPING.has(k));

/**
 * What a write invalidates, or null when it cannot affect a resolved context. New rows (a user, a role, a
 * permission key, a workspace) are not cached by anyone yet, so their creation invalidates nothing.
 */
export const authChangeOf = (model: string | undefined, operation: string, args: Args): AuthChange | null => {
  if (!model || !AUTH_MODELS.has(model) || !WRITE_OPS.has(operation)) return null;
  const creates = operation.startsWith('create');
  switch (model) {
    case 'User': {
      if (creates) return null;
      if (operation.startsWith('update') && onlyBookkeeping(args?.data)) return null;
      if (operation === 'upsert' && onlyBookkeeping(args?.update)) return null;
      const id = args?.where?.id;
      return typeof id === 'string' && !operation.endsWith('Many') ? { userIds: [id] } : { all: true };
    }
    case 'UserRole': {
      const data = args?.data as { userId?: unknown } | undefined;
      const userId = operation === 'create' ? data?.userId : args?.where?.userId;
      return typeof userId === 'string' ? { userIds: [userId] } : { all: true };
    }
    case 'Role':
    case 'Permission':
    case 'Workspace':
      return creates ? null : { all: true };
    default:
      return { all: true };
  }
};

/** Changes collected inside one transaction. */
export class AuthChangeSet {
  all = false;
  readonly userIds = new Set<string>();

  add(change: AuthChange) {
    if (change.all) this.all = true;
    else change.userIds.forEach((id) => this.userIds.add(id));
  }

  get empty() {
    return !this.all && this.userIds.size === 0;
  }

  toChange(): AuthChange {
    return this.all ? { all: true } : { userIds: [...this.userIds] };
  }
}

/** The change set of the transaction running in the current async context. */
export const authChangeScope = new AsyncLocalStorage<AuthChangeSet>();

/** pg_notify payloads are limited to 8000 bytes; a larger change becomes "everyone". */
export const toNotifyPayload = (change: AuthChange): string => {
  const payload = JSON.stringify(change.all ? { all: true } : { userIds: change.userIds });
  return payload.length > 7_900 ? JSON.stringify({ all: true }) : payload;
};

export const parseNotifyPayload = (payload: string | undefined): AuthChange => {
  try {
    const parsed = JSON.parse(payload ?? '') as { all?: boolean; userIds?: unknown };
    if (!parsed.all && Array.isArray(parsed.userIds) && parsed.userIds.every((id) => typeof id === 'string')) return { userIds: parsed.userIds };
  } catch {
    // fall through: an unreadable message invalidates everything
  }
  return { all: true };
};

/** pg does not understand Prisma's `?schema=` parameter. */
const toPgConnectionString = (databaseUrl: string): string => {
  const url = new URL(databaseUrl);
  url.searchParams.delete('schema');
  return url.toString();
};

export interface AuthChangeListenerHooks {
  onChange(change: AuthChange): void;
  /** false while the LISTEN connection is down: changes from other processes may be missed meanwhile. */
  onReady(ready: boolean): void;
  onError?(err: unknown): void;
}

/**
 * Keep one dedicated connection LISTENing on `AUTH_CHANNEL` and reconnect with back-off when it drops.
 * Reports not-ready while disconnected so the cache can stop serving entries it cannot keep fresh.
 */
export const listenForAuthChanges = (databaseUrl: string, hooks: AuthChangeListenerHooks) => {
  let client: pg.Client | null = null;
  let stopped = false;
  let retryMs = 500;
  let timer: NodeJS.Timeout | null = null;

  const scheduleReconnect = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = null;
      void connect();
    }, retryMs);
    retryMs = Math.min(retryMs * 2, 30_000);
  };

  const connect = async () => {
    const c = new pg.Client({ connectionString: toPgConnectionString(databaseUrl), application_name: 'hrm-auth-listener' });
    client = c;
    const down = (err?: unknown) => {
      if (client !== c) return;
      client = null;
      hooks.onReady(false);
      if (err) hooks.onError?.(err);
      c.removeAllListeners();
      void c.end().catch(() => undefined);
      scheduleReconnect();
    };
    c.on('error', down);
    c.on('end', () => down());
    c.on('notification', (msg) => {
      if (msg.channel === AUTH_CHANNEL) hooks.onChange(parseNotifyPayload(msg.payload));
    });
    try {
      await c.connect();
      await c.query(`LISTEN ${AUTH_CHANNEL}`);
      if (stopped) {
        await c.end();
        return;
      }
      retryMs = 500;
      hooks.onReady(true);
    } catch (err) {
      down(err);
    }
  };

  void connect();
  return {
    async close() {
      stopped = true;
      if (timer) clearTimeout(timer);
      const c = client;
      client = null;
      hooks.onReady(false);
      if (c) {
        c.removeAllListeners();
        await c.end().catch(() => undefined);
      }
    },
  };
};
