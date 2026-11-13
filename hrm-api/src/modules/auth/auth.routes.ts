import {
  changePasswordSchema,
  changePinSchema,
  loginResponseSchema,
  meSchema,
  passwordLoginSchema,
  pinLoginSchema,
  refreshSchema,
  tokenPairSchema,
} from '@hrm/shared';
import type { FastifyRequest } from 'fastify';
import type { AppInstance } from '../../app';

const meta = (req: FastifyRequest) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

/**
 * Stricter rate limit for credential endpoints. Keyed by IP + company + identifier
 * so many field workers behind one branch NAT don't block each other; per-account
 * lockout (LOGIN_MAX_ATTEMPTS) covers distributed guessing.
 */
const credentialRateLimit = (max: number) => ({
  rateLimit: {
    max,
    timeWindow: '1 minute',
    // Run after body parsing so the key can include the identifier.
    hook: 'preHandler' as const,
    keyGenerator: (req: FastifyRequest) => {
      const body = (req.body ?? {}) as { workspaceCode?: unknown; identifier?: unknown };
      return `${req.ip}|${String(body.workspaceCode ?? '')}|${String(body.identifier ?? '').toLowerCase()}`;
    },
  },
});

export const publicAuthRoutes = async (app: AppInstance) => {
  const loginRateLimit = credentialRateLimit(app.config.LOGIN_RATE_LIMIT);
  app.post(
    '/auth/login',
    { config: loginRateLimit, schema: { body: passwordLoginSchema, response: { 200: loginResponseSchema } } },
    async (req) => app.services.auth.loginWithPassword(req.body, meta(req)),
  );

  app.post(
    '/auth/login/pin',
    { config: loginRateLimit, schema: { body: pinLoginSchema, response: { 200: loginResponseSchema } } },
    async (req) => app.services.auth.loginWithPin(req.body, meta(req)),
  );

  app.post(
    '/auth/refresh',
    { config: loginRateLimit, schema: { body: refreshSchema, response: { 200: tokenPairSchema } } },
    async (req) => app.services.auth.refresh(req.body.refreshToken, meta(req)),
  );

  app.post('/auth/logout', { schema: { body: refreshSchema } }, async (req, reply) => {
    await app.services.auth.logout(req.body.refreshToken);
    return reply.status(204).send();
  });
};

export const protectedAuthRoutes = async (app: AppInstance) => {
  const loginRateLimit = credentialRateLimit(app.config.LOGIN_RATE_LIMIT);
  app.get('/auth/me', { schema: { response: { 200: meSchema } } }, async (req) => {
    const resolved = await app.services.auth.resolve(req.auth.workspaceId, req.auth.userId);
    return resolved!.me;
  });

  app.post('/auth/change-pin', { config: loginRateLimit, schema: { body: changePinSchema } }, async (req, reply) => {
    await app.services.auth.changePin(req.auth, req.body);
    return reply.status(204).send();
  });

  app.post('/auth/change-password', { config: loginRateLimit, schema: { body: changePasswordSchema } }, async (req, reply) => {
    await app.services.auth.changePassword(req.auth, req.body);
    return reply.status(204).send();
  });
};
