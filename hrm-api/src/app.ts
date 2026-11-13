import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type RawServerDefault } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Env } from './config/env';
import type { Db } from './db/client';
import { createFieldCipher } from './lib/crypto';
import { createAuditService, type AuditService } from './modules/audit/audit.service';
import { auditRoutes } from './modules/audit/audit.routes';
import { protectedAuthRoutes, publicAuthRoutes } from './modules/auth/auth.routes';
import { createAuthService, type AuthService } from './modules/auth/auth.service';
import { employeesRoutes } from './modules/employees/employees.routes';
import { createEmployeesService, type EmployeesService } from './modules/employees/employees.service';
import { orgRoutes } from './modules/org/org.routes';
import { createOrgService, type OrgService } from './modules/org/org.service';
import { authPlugin, ttlToSeconds } from './plugins/auth';
import { registerErrorHandler } from './plugins/error-handler';

export interface Services {
  auth: AuthService;
  employees: EmployeesService;
  org: OrgService;
  audit: AuditService;
}

declare module 'fastify' {
  interface FastifyInstance {
    services: Services;
    config: Env;
  }
}

export type AppInstance = FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, FastifyBaseLogger, ZodTypeProvider>;

export interface BuildAppOptions {
  env: Env;
  db: Db;
  logger?: boolean;
}

export const API_PREFIX = '/api/v1';

export const buildApp = async ({ env, db, logger = true }: BuildAppOptions): Promise<AppInstance> => {
  const app = Fastify({ logger, trustProxy: true }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(helmet);
  await app.register(cors, { origin: env.CORS_ORIGINS, credentials: true });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });

  const accessTtlSeconds = ttlToSeconds(env.ACCESS_TOKEN_TTL);
  const cipher = createFieldCipher(env.ENCRYPTION_KEY);
  await app.register(authPlugin, { env, authService: () => app.services.auth });

  app.decorate('config', env);
  app.decorate('services', {
    auth: createAuthService(db, env, { sign: (p) => app.jwt.sign(p), accessTtlSeconds }),
    employees: createEmployeesService(db, cipher),
    org: createOrgService(db),
    audit: createAuditService(db),
  });

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(
    async (api) => {
      await api.register(publicAuthRoutes);
      await api.register(async (secured) => {
        secured.addHook('onRequest', secured.authenticate);
        await secured.register(protectedAuthRoutes);
        await secured.register(employeesRoutes);
        await secured.register(orgRoutes);
        await secured.register(auditRoutes);
      });
    },
    { prefix: API_PREFIX },
  );

  return app;
};
