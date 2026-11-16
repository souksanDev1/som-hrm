import fastifyJwt from '@fastify/jwt';
import type { Permission } from '@hrm/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Env } from '../config/env';
import { forbidden, unauthorized } from '../lib/errors';
import type { AuthContext, AuthService } from '../modules/auth/auth.service';

/**
 * Access-token claims. Tenant tokens carry `ws`; SOM platform tokens carry `scope: 'platform'`
 * and no `ws` (see modules/platform). The tenant `authenticate` hook rejects platform tokens.
 */
export type AccessTokenClaims = { sub: string; ws: string; scope?: undefined } | { sub: string; scope: 'platform'; ws?: undefined };

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenClaims;
    user: AccessTokenClaims;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (...perms: Permission[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyContextConfig {
    /**
     * Route stays reachable while the user must verify their phone or replace a temporary
     * credential (FR-AUTH-02.1 / FR-AUTH-03.2). Every other authenticated route answers 403.
     */
    allowDuringAccountSetup?: boolean;
  }
}

/** Parse "15m" / "1h" / "900" into seconds. */
export const ttlToSeconds = (ttl: string): number => {
  const m = /^(\d+)([smhd]?)$/.exec(ttl.trim());
  if (!m) throw new Error(`Invalid TTL: ${ttl}`);
  const n = Number(m[1]);
  const unit = { '': 1, s: 1, m: 60, h: 3600, d: 86_400 }[m[2] as '' | 's' | 'm' | 'h' | 'd'];
  return n * unit;
};

export const authPlugin = fp<{ env: Env; authService: () => AuthService }>(async (app, opts) => {
  await app.register(fastifyJwt, { secret: opts.env.JWT_SECRET, sign: { expiresIn: opts.env.ACCESS_TOKEN_TTL } });

  app.decorateRequest('auth', null as unknown as AuthContext);

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw unauthorized('invalid_token');
    }
    if (req.user.scope === 'platform' || !req.user.ws) throw unauthorized('invalid_token');
    const resolved = await opts.authService().resolve(req.user.ws, req.user.sub);
    if (!resolved) throw unauthorized('account_disabled');
    if (!req.routeOptions.config.allowDuringAccountSetup) {
      if (resolved.me.phoneVerificationRequired) throw forbidden('phone_verification_required');
      if (resolved.me.mustChangeCredential) throw forbidden('credential_change_required');
    }
    req.auth = resolved.ctx;
  });

  app.decorate(
    'requirePermission',
    (...perms: Permission[]) =>
      async (req: FastifyRequest) => {
        if (!req.auth) throw unauthorized();
        if (!perms.every((p) => req.auth.permissions.includes(p))) throw forbidden();
      },
  );
});
