import {
  createWorkspaceSchema,
  idParamsSchema,
  paginatedSchema,
  parameterListSchema,
  parameterViewSchema,
  platformAuditLogQuerySchema,
  platformAuditLogSchema,
  platformLoginResponseSchema,
  platformLoginSchema,
  platformMeSchema,
  platformWorkspaceListQuerySchema,
  platformWorkspaceSchema,
  refreshSchema,
  setSystemParameterSchema,
  tokenPairSchema,
  updateWorkspaceSchema,
} from '@hrm/shared';
import type { FastifyRequest } from 'fastify';
import type { AppInstance } from '../../app';
import { authenticatePlatform } from './platform.auth';

const meta = (req: FastifyRequest) => ({ ip: req.ip });

/** Credential endpoints: per (IP + email) so one office NAT does not block every SOM operator. */
const credentialRateLimit = (max: number) => ({
  rateLimit: {
    max,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    keyGenerator: (req: FastifyRequest) => `platform|${req.ip}|${String((req.body as { email?: unknown } | undefined)?.email ?? '').toLowerCase()}`,
  },
});

/** SOM platform console API, mounted at /platform (outside the tenant `authenticate` scope). */
export const platformRoutes = async (app: AppInstance) => {
  const svc = () => app.services.platform;
  const loginRateLimit = credentialRateLimit(app.config.LOGIN_RATE_LIMIT);

  app.post(
    '/auth/login',
    { config: loginRateLimit, schema: { body: platformLoginSchema, response: { 200: platformLoginResponseSchema } } },
    async (req) => svc().login(req.body, meta(req)),
  );
  app.post(
    '/auth/refresh',
    { config: loginRateLimit, schema: { body: refreshSchema, response: { 200: tokenPairSchema } } },
    async (req) => svc().refresh(req.body.refreshToken, meta(req)),
  );
  app.post('/auth/logout', { schema: { body: refreshSchema } }, async (req, reply) => {
    await svc().logout(req.body.refreshToken, meta(req));
    return reply.status(204).send();
  });

  await app.register(securedPlatformRoutes);
};

/** Routes that require a platform access token (`scope: 'platform'`). */
const securedPlatformRoutes = async (secured: AppInstance) => {
  const svc = () => secured.services.platform;
  secured.decorateRequest('platformAuth', null as unknown as FastifyRequest['platformAuth']);
  secured.addHook('onRequest', authenticatePlatform(svc));

  secured.get('/auth/me', { schema: { response: { 200: platformMeSchema } } }, async (req) => (await svc().resolve(req.platformAuth.platformUserId))!);

  secured.get(
    '/workspaces',
    { schema: { querystring: platformWorkspaceListQuerySchema, response: { 200: paginatedSchema(platformWorkspaceSchema) } } },
    async (req) => svc().listWorkspaces(req.query),
  );
  secured.post(
    '/workspaces',
    { schema: { body: createWorkspaceSchema, response: { 201: platformWorkspaceSchema } } },
    async (req, reply) => reply.status(201).send(await svc().createWorkspace(req.platformAuth, req.body, meta(req))),
  );
  secured.get(
    '/workspaces/:id',
    { schema: { params: idParamsSchema, response: { 200: platformWorkspaceSchema } } },
    async (req) => svc().getWorkspace(req.params.id),
  );
  secured.patch(
    '/workspaces/:id',
    { schema: { params: idParamsSchema, body: updateWorkspaceSchema, response: { 200: platformWorkspaceSchema } } },
    async (req) => svc().updateWorkspace(req.platformAuth, req.params.id, req.body, meta(req)),
  );

  secured.get('/parameters', { schema: { response: { 200: parameterListSchema } } }, async () => secured.services.parameters.listSystem());
  secured.post(
    '/parameters',
    { schema: { body: setSystemParameterSchema, response: { 201: parameterViewSchema } } },
    async (req, reply) => reply.status(201).send(await secured.services.parameters.setSystem(req.platformAuth.platformUserId, req.body, meta(req))),
  );

  secured.get(
    '/audit-logs',
    { schema: { querystring: platformAuditLogQuerySchema, response: { 200: paginatedSchema(platformAuditLogSchema) } } },
    async (req) => svc().listAuditLogs(req.query.page, req.query.pageSize, req.query.entity),
  );
};
