import {
  changePasswordSchema,
  changePinSchema,
  forgotCredentialSchema,
  loginResponseSchema,
  meSchema,
  otpRequestedSchema,
  passwordLoginSchema,
  pinLoginSchema,
  refreshSchema,
  resetPasswordSchema,
  resetPinSchema,
  tokenPairSchema,
  updateLocaleSchema,
  verifyPhoneSchema,
} from '@hrm/shared';
import type { FastifyRequest } from 'fastify';
import type { AppInstance } from '../../app';

const meta = (req: FastifyRequest) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

/**
 * Stricter rate limit for public credential endpoints. Keyed by IP + company + identifier
 * so many field workers behind one branch NAT don't block each other; per-account
 * lockout (system parameter `auth.lockout.*`) covers distributed guessing.
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

/** Authenticated credential endpoints: keyed by the signed-in user, independent of IP/NAT. */
const userRateLimit = (max: number) => ({
  rateLimit: {
    max,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    keyGenerator: (req: FastifyRequest) => (req.auth ? `user|${req.auth.userId}` : req.ip),
  },
});

/** Routes a user may call while account setup (phone verification / credential change) is pending. */
const setupAllowed = { allowDuringAccountSetup: true } as const;

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

  // ── Self-service reset by SMS OTP (FR-AUTH-02) ──
  app.post(
    '/auth/password/forgot',
    { config: loginRateLimit, schema: { body: forgotCredentialSchema, response: { 202: otpRequestedSchema } } },
    async (req, reply) => reply.status(202).send(await app.services.auth.forgotCredential(req.body)),
  );

  app.post('/auth/password/reset', { config: loginRateLimit, schema: { body: resetPasswordSchema } }, async (req, reply) => {
    await app.services.auth.resetPassword(req.body, meta(req));
    return reply.status(204).send();
  });

  app.post('/auth/pin/reset', { config: loginRateLimit, schema: { body: resetPinSchema } }, async (req, reply) => {
    await app.services.auth.resetPin(req.body, meta(req));
    return reply.status(204).send();
  });
};

export const protectedAuthRoutes = async (app: AppInstance) => {
  const credentialLimit = { ...userRateLimit(app.config.LOGIN_RATE_LIMIT), ...setupAllowed };

  app.get('/auth/me', { config: setupAllowed, schema: { response: { 200: meSchema } } }, async (req) => {
    const resolved = await app.services.auth.resolve(req.auth.workspaceId, req.auth.userId);
    return resolved!.me;
  });

  app.patch('/auth/me/locale', { config: setupAllowed, schema: { body: updateLocaleSchema } }, async (req, reply) => {
    await app.services.auth.setLocale(req.auth, req.body);
    return reply.status(204).send();
  });

  app.post('/auth/change-pin', { config: credentialLimit, schema: { body: changePinSchema } }, async (req, reply) => {
    await app.services.auth.changePin(req.auth, req.body);
    return reply.status(204).send();
  });

  app.post('/auth/change-password', { config: credentialLimit, schema: { body: changePasswordSchema } }, async (req, reply) => {
    await app.services.auth.changePassword(req.auth, req.body);
    return reply.status(204).send();
  });

  app.post(
    '/auth/phone/verify/request',
    { config: credentialLimit, schema: { response: { 202: otpRequestedSchema } } },
    async (req, reply) => reply.status(202).send(await app.services.auth.requestPhoneVerification(req.auth)),
  );

  app.post('/auth/phone/verify/confirm', { config: credentialLimit, schema: { body: verifyPhoneSchema } }, async (req, reply) => {
    await app.services.auth.confirmPhoneVerification(req.auth, req.body.code);
    return reply.status(204).send();
  });
};
