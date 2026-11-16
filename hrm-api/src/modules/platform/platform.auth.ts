import type { FastifyRequest } from 'fastify';
import { unauthorized } from '../../lib/errors';
import type { PlatformAuthContext, PlatformService } from './platform.service';

declare module 'fastify' {
  interface FastifyRequest {
    platformAuth: PlatformAuthContext;
  }
}

/**
 * onRequest hook for SOM platform routes: accepts only `scope: 'platform'` access tokens
 * (tenant tokens are rejected) and loads an active PlatformUser.
 */
export const authenticatePlatform =
  (service: () => PlatformService) =>
  async (req: FastifyRequest): Promise<void> => {
    try {
      await req.jwtVerify();
    } catch {
      throw unauthorized('invalid_token');
    }
    if (req.user.scope !== 'platform') throw unauthorized('invalid_token');
    const me = await service().resolve(req.user.sub);
    if (!me) throw unauthorized('account_disabled');
    req.platformAuth = { platformUserId: me.id };
  };
