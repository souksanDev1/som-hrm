import { Prisma } from '@prisma/client';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { createDb } from '../src/db/client';
import { registerErrorHandler } from '../src/plugins/error-handler';
import { apiDocsEnabled } from '../src/plugins/openapi';
import { testEnv } from './env';
import { createTestContext, type TestContext } from './helpers';

let t: TestContext;
beforeAll(async () => {
  t = await createTestContext();
});
afterAll(() => t.close());

describe('OpenAPI', () => {
  it('serves an OpenAPI 3 document listing the API routes with their schemas', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const doc = res.json<{ openapi: string; paths: Record<string, Record<string, { requestBody?: unknown; parameters?: unknown[] }>> }>();
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.paths['/api/v1/auth/login']?.post?.requestBody).toBeDefined();
    expect(doc.paths['/api/v1/employees']?.get?.parameters?.length).toBeGreaterThan(0);
    expect(doc.paths['/api/v1/notifications']?.get).toBeDefined();
    expect(doc.paths['/api/v1/employees/{id}/documents/{documentId}/file']?.put).toBeDefined();
    expect(Object.keys(doc.paths).some((p) => p.startsWith('/docs'))).toBe(false);
  });

  it('serves the Swagger UI', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/docs/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('is on by default outside production and can be switched with API_DOCS', () => {
    expect(apiDocsEnabled({ NODE_ENV: 'development', API_DOCS: undefined })).toBe(true);
    expect(apiDocsEnabled({ NODE_ENV: 'production', API_DOCS: undefined })).toBe(false);
    expect(apiDocsEnabled({ NODE_ENV: 'production', API_DOCS: 'true' })).toBe(true);
    expect(apiDocsEnabled({ NODE_ENV: 'test', API_DOCS: 'false' })).toBe(false);
  });

  it('is not served when disabled', async () => {
    const ctx = await createTestContext({ API_DOCS: 'false' });
    try {
      expect((await ctx.app.inject({ method: 'GET', url: '/docs/json' })).statusCode).toBe(404);
    } finally {
      await ctx.close();
    }
  });
});

describe('/health', () => {
  it('reports ok when the database answers', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', db: 'ok' });
  });

  it('returns 503 when the database is unreachable', async () => {
    const env = testEnv({ DATABASE_URL: 'postgresql://hrm:hrm@127.0.0.1:1/nowhere_test?schema=public&connect_timeout=2' });
    const db = createDb(env.DATABASE_URL);
    const app = await buildApp({ env, db, logger: false });
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ status: 'error', db: 'unavailable' });
    } finally {
      await app.close();
      await db.disconnect();
    }
  });
});

describe('error handler', () => {
  it('never returns Prisma meta for unique violations, only safe field names', async () => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    app.get('/dup', async () => {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002', clientVersion: 'test', meta: { target: ['workspaceId', 'employeeCode', 'idCardNoHash'], modelName: 'Employee' },
      });
    });
    const res = await app.inject({ method: 'GET', url: '/dup' });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: { code: 'conflict', message: 'Duplicate value', details: { fields: ['employeeCode'] } } });
    await app.close();
  });
});

describe('CORS', () => {
  it('lets the web app preflight every method the API uses and read download file names', async () => {
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const res = await t.app.inject({
        method: 'OPTIONS',
        url: '/api/v1/employees/x',
        headers: { origin: 'http://localhost:3000', 'access-control-request-method': method },
      });
      expect(res.statusCode).toBe(204);
      expect(String(res.headers['access-control-allow-methods'])).toContain(method);
    }
    const res = await t.app.inject({ method: 'GET', url: '/health', headers: { origin: 'http://localhost:3000' } });
    expect(String(res.headers['access-control-expose-headers'])).toContain('Content-Disposition');
  });
});

describe('global rate limit', () => {
  it('is configurable with RATE_LIMIT_MAX', async () => {
    const limited = await createTestContext({ RATE_LIMIT_MAX: '2' });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 3; i += 1) codes.push((await limited.app.inject({ method: 'GET', url: '/docs/json' })).statusCode);
      expect(codes).toEqual([200, 200, 429]);
    } finally {
      await limited.close();
    }
  });
});
