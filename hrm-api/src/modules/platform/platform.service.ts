import type {
  CreateWorkspaceInput,
  Paginated,
  PlatformAuditLogEntry,
  PlatformLoginInput,
  PlatformLoginResponse,
  PlatformMe,
  PlatformWorkspace,
  PlatformWorkspaceListQuery,
  TokenPair,
  UpdateWorkspaceInput,
} from '@hrm/shared';
import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env';
import { bootstrapWorkspace } from '../../db/bootstrap';
import { isUniqueViolation, type Db, type Tx } from '../../db/client';
import { randomToken, sha256 } from '../../lib/crypto';
import { AppError, conflict, locked, notFound, unauthorized } from '../../lib/errors';
import { verifySecret } from '../../lib/password';
import { parameterReader } from '../parameters/parameters.service';
import {
  platformAuditRepository,
  platformUserRepository,
  platformWorkspaceRepository,
  type WorkspaceRow,
} from './platform.repository';

/** Authenticated SOM staff member (set on the request by the platform auth hook). */
export interface PlatformAuthContext {
  platformUserId: string;
}

export interface PlatformTokenSigner {
  sign(payload: { sub: string; scope: 'platform' }): string;
  accessTtlSeconds: number;
}

export interface RequestMeta {
  ip?: string;
}

type Outcome<T> = { value: T } | { error: AppError };
/** Throw after the transaction so failure bookkeeping (attempt counters, audit) is committed. */
const unwrap = <T>(o: Outcome<T>): T => {
  if ('error' in o) throw o.error;
  return o.value;
};

const toMe = (u: { id: string; email: string; displayName: string }): PlatformMe => ({ id: u.id, email: u.email, displayName: u.displayName });

const toWorkspace = (w: WorkspaceRow, employeeCount: number): PlatformWorkspace => ({
  id: w.id,
  code: w.code,
  name: w.name,
  timezone: w.timezone,
  status: w.status,
  seatLimit: w.subscription?.seatLimit ?? 0,
  employeeCount,
  userCount: w._count.users,
  createdAt: w.createdAt.toISOString(),
});

export const createPlatformService = (db: Db, env: Env, signer: PlatformTokenSigner) => {
  const issueTokens = async (tx: Tx, userId: string, familyId: string = randomUUID()): Promise<TokenPair> => {
    const refreshToken = randomToken();
    await platformUserRepository.createRefreshToken(tx, {
      userId,
      tokenHash: sha256(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000),
    });
    return { accessToken: signer.sign({ sub: userId, scope: 'platform' }), refreshToken, expiresIn: signer.accessTtlSeconds };
  };

  const loadWorkspace = async (tx: Tx, id: string): Promise<PlatformWorkspace> => {
    const row = await platformWorkspaceRepository.findById(tx, id);
    if (!row) throw notFound();
    const counts = await platformWorkspaceRepository.seatCounts(tx, [id]);
    return toWorkspace(row, counts.get(id) ?? 0);
  };

  return {
    /** SOM staff sign-in with lockout driven by the system parameters auth.lockout.* (FR-AUTH-05). */
    login: async (input: PlatformLoginInput, meta: RequestMeta): Promise<PlatformLoginResponse> =>
      unwrap(
        await db.system(async (tx): Promise<Outcome<PlatformLoginResponse>> => {
          const user = await platformUserRepository.findByEmail(tx, input.email);
          if (!user) {
            await verifySecret(input.password, null); // equalise timing
            return { error: unauthorized('invalid_credentials') };
          }
          if (user.lockedUntil && user.lockedUntil > new Date()) return { error: locked() };
          if (!user.isActive) return { error: new AppError(403, 'account_disabled') };

          if (!(await verifySecret(input.password, user.passwordHash))) {
            const maxAttempts = await parameterReader.system(tx, 'auth.lockout.maxAttempts');
            const lockMinutes = await parameterReader.system(tx, 'auth.lockout.minutes');
            const nowLocked = await platformUserRepository.recordFailedAttempt(tx, user.id, maxAttempts, lockMinutes);
            await platformAuditRepository.create(tx, {
              actorId: user.id, action: nowLocked ? 'platform.auth.locked' : 'platform.auth.login_failed', entity: 'PlatformUser', entityId: user.id, ip: meta.ip,
            });
            return { error: nowLocked ? locked() : unauthorized('invalid_credentials') };
          }

          await platformUserRepository.recordSuccessfulLogin(tx, user.id);
          await platformAuditRepository.create(tx, { actorId: user.id, action: 'platform.auth.login', entity: 'PlatformUser', entityId: user.id, ip: meta.ip });
          return { value: { ...(await issueTokens(tx, user.id)), user: toMe(user) } };
        }),
      ),

    /** Rotate a refresh token; re-use of a rotated token revokes every session of that user. */
    refresh: async (refreshToken: string, meta: RequestMeta): Promise<TokenPair> =>
      unwrap(
        await db.system(async (tx): Promise<Outcome<TokenPair>> => {
          const stored = await platformUserRepository.findRefreshToken(tx, sha256(refreshToken));
          if (!stored) return { error: unauthorized('invalid_refresh_token') };
          if (stored.revokedAt) {
            await platformUserRepository.revokeAllForUser(tx, stored.userId);
            await platformAuditRepository.create(tx, {
              actorId: stored.userId, action: 'platform.auth.refresh_reuse', entity: 'PlatformUser', entityId: stored.userId, meta: { familyId: stored.familyId }, ip: meta.ip,
            });
            return { error: unauthorized('invalid_refresh_token') };
          }
          if (stored.expiresAt < new Date()) return { error: unauthorized('invalid_refresh_token') };
          const user = await platformUserRepository.findById(tx, stored.userId);
          if (!user?.isActive) return { error: unauthorized('account_disabled') };
          await platformUserRepository.revokeRefreshToken(tx, stored.id);
          return { value: await issueTokens(tx, user.id, stored.familyId) };
        }),
      ),

    logout: (refreshToken: string, meta: RequestMeta) =>
      db.system(async (tx) => {
        const stored = await platformUserRepository.findRefreshToken(tx, sha256(refreshToken));
        if (!stored || stored.revokedAt) return;
        await platformUserRepository.revokeRefreshToken(tx, stored.id);
        await platformAuditRepository.create(tx, { actorId: stored.userId, action: 'platform.auth.logout', entity: 'PlatformUser', entityId: stored.userId, ip: meta.ip });
      }),

    /** Load an active SOM staff member for an access token (used by the platform auth hook). */
    resolve: (platformUserId: string): Promise<PlatformMe | null> =>
      db.system(async (tx) => {
        const user = await platformUserRepository.findById(tx, platformUserId);
        return user?.isActive ? toMe(user) : null;
      }),

    listWorkspaces: (q: PlatformWorkspaceListQuery): Promise<Paginated<PlatformWorkspace>> =>
      db.system(async (tx) => {
        const { items, total, employeeCounts } = await platformWorkspaceRepository.list(tx, q);
        return { items: items.map((w) => toWorkspace(w, employeeCounts.get(w.id) ?? 0)), total, page: q.page, pageSize: q.pageSize };
      }),

    getWorkspace: (id: string) => db.system((tx) => loadWorkspace(tx, id)),

    /**
     * Create a customer workspace (FR-WS-01.1). It starts from the registry parameter defaults
     * (FR-WS-08.4), so no parameter rows are written.
     */
    createWorkspace: async (ctx: PlatformAuthContext, input: CreateWorkspaceInput, meta: RequestMeta): Promise<PlatformWorkspace> => {
      try {
        return await db.system(async (tx) => {
          if (await platformWorkspaceRepository.findByCode(tx, input.code)) throw conflict('workspace_code_taken');
          const { workspace, owner } = await bootstrapWorkspace(tx, {
            code: input.code,
            name: input.name,
            timezone: input.timezone,
            seatLimit: input.seatLimit,
            owner: input.owner,
          });
          await platformAuditRepository.create(tx, {
            actorId: ctx.platformUserId,
            action: 'platform.workspace.create',
            entity: 'Workspace',
            entityId: workspace.id,
            meta: { code: workspace.code, name: workspace.name, timezone: workspace.timezone, seatLimit: input.seatLimit ?? null, ownerUserId: owner.id },
            ip: meta.ip,
          });
          return loadWorkspace(tx, workspace.id);
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('workspace_code_taken');
        throw err;
      }
    },

    /** Rename, change the seat limit, or suspend/activate a workspace. Suspending signs its users out. */
    updateWorkspace: (ctx: PlatformAuthContext, id: string, input: UpdateWorkspaceInput, meta: RequestMeta) =>
      db.system(async (tx) => {
        const before = await loadWorkspace(tx, id);
        await platformWorkspaceRepository.update(tx, id, input);
        if (input.status === 'SUSPENDED' && before.status !== 'SUSPENDED') await platformWorkspaceRepository.revokeTenantSessions(tx, id);
        const after = await loadWorkspace(tx, id);
        const changes = (['name', 'seatLimit', 'status'] as const)
          .filter((f) => input[f] !== undefined && before[f] !== after[f])
          .map((f) => ({ field: f, old: before[f], new: after[f] }));
        if (changes.length) {
          const action = input.status && input.status !== before.status
            ? (input.status === 'SUSPENDED' ? 'platform.workspace.suspend' : 'platform.workspace.activate')
            : 'platform.workspace.update';
          await platformAuditRepository.create(tx, { actorId: ctx.platformUserId, action, entity: 'Workspace', entityId: id, meta: { changes }, ip: meta.ip });
        }
        return after;
      }),

    listAuditLogs: (page: number, pageSize: number, entity?: string): Promise<Paginated<PlatformAuditLogEntry>> =>
      db.system(async (tx) => {
        const { items, total, actorNames } = await platformAuditRepository.list(tx, page, pageSize, entity);
        return {
          items: items.map((i) => ({
            id: i.id,
            action: i.action,
            entity: i.entity,
            entityId: i.entityId,
            actorName: i.actorId ? (actorNames.get(i.actorId) ?? null) : null,
            ip: i.ip,
            createdAt: i.createdAt.toISOString(),
            meta: i.meta ?? null,
          })),
          total,
          page,
          pageSize,
        };
      }),
  };
};
export type PlatformService = ReturnType<typeof createPlatformService>;
