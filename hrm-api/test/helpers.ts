import { randomUUID } from 'node:crypto';
import type { LoginResponse } from '@hrm/shared';
import { API_PREFIX, buildApp, type AppInstance } from '../src/app';
import { bootstrapWorkspace } from '../src/db/bootstrap';
import { createDb, type Db } from '../src/db/client';
import { hashSecret } from '../src/lib/password';
import { testEnv } from './env';

export interface TestContext {
  app: AppInstance;
  db: Db;
  close(): Promise<void>;
}

/**
 * `employeePayload` sends this placeholder as `departmentId`; `createTestContext` swaps it for a "Default" department
 * of the caller's workspace (created on first use, so tests that count departments are unaffected). Together with
 * `isTopLevel` this keeps fixtures valid under the "department + line manager or top level" rule.
 */
export const DEFAULT_DEPARTMENT = '__default_department__';

const withDefaultDepartment = (app: AppInstance, db: Db) => {
  const cache = new Map<string, Promise<string>>();
  const resolve = (workspaceId: string) => {
    let id = cache.get(workspaceId);
    if (!id) {
      id = db.tenant(workspaceId, (tx) => tx.department.create({ data: { workspaceId, name: 'Default' } })).then((d) => d.id);
      cache.set(workspaceId, id);
    }
    return id;
  };
  type Opts = { headers?: { authorization?: string }; payload?: { departmentId?: string } & Record<string, unknown> };
  const inject = app.inject.bind(app) as unknown as (opts: Opts) => Promise<unknown>;
  (app as unknown as { inject: typeof inject }).inject = async (opts: Opts) => {
    const token = String(opts?.headers?.authorization ?? '').replace(/^Bearer /, '');
    if (opts?.payload?.departmentId === DEFAULT_DEPARTMENT && token) {
      const ws = (JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as { ws?: string }).ws;
      if (ws) return inject({ ...opts, payload: { ...opts.payload, departmentId: await resolve(ws) } });
    }
    return inject(opts);
  };
};

export const createTestContext = async (envOverrides: Record<string, string> = {}): Promise<TestContext> => {
  const env = testEnv(envOverrides);
  const db = createDb(env.DATABASE_URL);
  const app = await buildApp({ env, db, logger: false });
  await app.ready();
  withDefaultDepartment(app, db);
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await db.disconnect();
    },
  };
};

export const OWNER_PASSWORD = 'Owner12345';

export interface WorkspaceFixture {
  workspaceId: string;
  code: string;
  ownerEmail: string;
  roles: Record<string, string>;
}

/** A fresh, isolated workspace per test so tests never interfere with each other. */
export const createWorkspace = async (db: Db, seatLimit = 50): Promise<WorkspaceFixture> => {
  const code = `t-${randomUUID().slice(0, 8)}`;
  const ownerEmail = `owner@${code}.test`;
  const { workspace, roles } = await db.system((tx) =>
    bootstrapWorkspace(tx, { code, name: `Test ${code}`, owner: { email: ownerEmail, password: OWNER_PASSWORD, displayName: 'Owner' }, seatLimit }),
  );
  return { workspaceId: workspace.id, code, ownerEmail, roles };
};

/** Create an extra user with a given role and password, optionally linked to an employee. */
export const createUser = async (
  db: Db,
  ws: WorkspaceFixture,
  opts: { email: string; password: string; role: string; employeeId?: string },
) =>
  db.tenant(ws.workspaceId, async (tx) =>
    tx.user.create({
      data: {
        workspaceId: ws.workspaceId,
        email: opts.email,
        displayName: opts.email,
        passwordHash: await hashSecret(opts.password),
        employeeId: opts.employeeId,
        roles: { create: { workspaceId: ws.workspaceId, roleId: ws.roles[opts.role]! } },
      },
    }),
  );

export const api = (path: string) => `${API_PREFIX}${path}`;

export const loginAs = async (app: AppInstance, workspaceCode: string, identifier: string, password: string) => {
  const res = await app.inject({ method: 'POST', url: api('/auth/login'), payload: { workspaceCode, identifier, password } });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return res.json<LoginResponse>();
};

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export const employeePayload = (overrides: Record<string, unknown> = {}) => ({
  employeeCode: `E${Math.floor(Math.random() * 1e6)}`,
  firstName: 'ສົມໃຈ',
  lastName: 'ດວງດີ',
  gender: 'FEMALE',
  hireDate: '2024-01-15',
  contractType: 'INDEFINITE', payType: 'MONTHLY',
  // Fixtures are top-level employees of the workspace's default department unless a test says otherwise.
  departmentId: DEFAULT_DEPARTMENT,
  isTopLevel: !('managerId' in overrides),
  ...overrides,
});
