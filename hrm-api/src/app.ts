import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type RawServerDefault } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Env } from './config/env';
import type { Db } from './db/client';
import { createFieldCipher } from './lib/crypto';
import { createConsoleSmsSender, type SmsSender } from './lib/sms';
import { createLocalFileStorage, type FileStorage } from './lib/storage';
import { filesRoutes } from './modules/files/files.routes';
import { createFilesService, type FilesService } from './modules/files/files.service';
import { notificationsRoutes } from './modules/notifications/notifications.routes';
import { createNotificationsService, type NotificationsService } from './modules/notifications/notifications.service';
import { apiDocsEnabled, registerOpenApi } from './plugins/openapi';
import { createAuditService, type AuditService } from './modules/audit/audit.service';
import { auditRoutes } from './modules/audit/audit.routes';
import { protectedAuthRoutes, publicAuthRoutes } from './modules/auth/auth.routes';
import { createAuthService, type AuthService } from './modules/auth/auth.service';
import { employeeImportRoutes } from './modules/employees/employee-import.routes';
import { createEmployeeImportService, type EmployeeImportService } from './modules/employees/employee-import.service';
import { employeesRoutes } from './modules/employees/employees.routes';
import { holidaysRoutes } from './modules/holidays/holidays.routes';
import { createHolidaysService, type HolidaysService } from './modules/holidays/holidays.service';
import { createEmployeesService, type EmployeesService } from './modules/employees/employees.service';
import { orgRoutes } from './modules/org/org.routes';
import { createOrgService, type OrgService } from './modules/org/org.service';
import { createParameterAdminService, type ParameterAdminService } from './modules/parameters/parameter-admin.service';
import { parametersRoutes } from './modules/parameters/parameters.routes';
import { platformRoutes } from './modules/platform/platform.routes';
import { createPlatformService, type PlatformService } from './modules/platform/platform.service';
import { schedulesRoutes } from './modules/schedules/schedules.routes';
import { createSchedulesService, type SchedulesService } from './modules/schedules/schedules.service';
import { authPlugin, ttlToSeconds } from './plugins/auth';
import { registerErrorHandler } from './plugins/error-handler';

export interface Services {
  auth: AuthService;
  employees: EmployeesService;
  employeeImport: EmployeeImportService;
  org: OrgService;
  holidays: HolidaysService;
  audit: AuditService;
  platform: PlatformService;
  parameters: ParameterAdminService;
  files: FilesService;
  notifications: NotificationsService;
  schedules: SchedulesService;
}

declare module 'fastify' {
  interface FastifyInstance {
    services: Services;
    config: Env;
    sms: SmsSender;
  }
}

export type AppInstance = FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, FastifyBaseLogger, ZodTypeProvider>;

export interface BuildAppOptions {
  env: Env;
  db: Db;
  logger?: boolean;
  /** Outbound SMS; defaults to the console sender (no real gateway chosen yet). Tests inject their own. */
  sms?: SmsSender;
  /** Binary file storage; defaults to the local-disk driver at FILE_STORAGE_DIR. */
  storage?: FileStorage;
}

export const API_PREFIX = '/api/v1';

export const buildApp = async ({ env, db, logger = true, sms, storage }: BuildAppOptions): Promise<AppInstance> => {
  const app = Fastify({ logger, trustProxy: env.TRUST_PROXY }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(helmet);
  // @fastify/cors only allows GET/HEAD/POST by default; the API also uses PUT/PATCH/DELETE.
  // Content-Disposition is exposed so browsers can read the original file name of downloads.
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    exposedHeaders: ['Content-Disposition'],
  });
  await app.register(rateLimit, { global: true, max: env.RATE_LIMIT_MAX, timeWindow: '1 minute' });
  // OpenAPI must be registered before any route so every route is collected.
  if (apiDocsEnabled(env)) await registerOpenApi(app);

  const accessTtlSeconds = ttlToSeconds(env.ACCESS_TOKEN_TTL);
  const cipher = createFieldCipher(env.ENCRYPTION_KEY);
  await app.register(authPlugin, { env, authService: () => app.services.auth });

  const fileStorage = storage ?? createLocalFileStorage(env.FILE_STORAGE_DIR);
  app.decorate('config', env);
  app.decorate('sms', sms ?? createConsoleSmsSender((msg) => app.log.info(msg)));
  const employees = createEmployeesService(db, cipher, { storage: fileStorage });
  app.decorate('services', {
    auth: createAuthService(db, env, { sign: (p) => app.jwt.sign(p), accessTtlSeconds }, app.sms),
    employees,
    employeeImport: createEmployeeImportService(db, employees, { secret: env.JWT_SECRET }),
    org: createOrgService(db),
    holidays: createHolidaysService(db),
    audit: createAuditService(db),
    platform: createPlatformService(db, env, { sign: (p) => app.jwt.sign(p), accessTtlSeconds }),
    parameters: createParameterAdminService(db),
    files: createFilesService(db, fileStorage, { maxBytes: env.FILE_MAX_BYTES }),
    notifications: createNotificationsService(db),
    schedules: createSchedulesService(db),
  });

  app.get('/health', { schema: { hide: true } }, async (req, reply) => {
    try {
      await db.system((tx) => tx.$queryRaw`SELECT 1`);
      return { status: 'ok', db: 'ok' };
    } catch (err) {
      req.log.error({ err }, 'health check: database unavailable');
      return reply.status(503).send({ status: 'error', db: 'unavailable' });
    }
  });

  await app.register(
    async (api) => {
      await api.register(publicAuthRoutes);
      await api.register(platformRoutes, { prefix: '/platform' });
      await api.register(async (secured) => {
        secured.addHook('onRequest', secured.authenticate);
        await secured.register(protectedAuthRoutes);
        await secured.register(employeesRoutes);
        await secured.register(employeeImportRoutes);
        await secured.register(orgRoutes);
        await secured.register(holidaysRoutes);
        await secured.register(auditRoutes);
        await secured.register(parametersRoutes);
        await secured.register(filesRoutes);
        await secured.register(notificationsRoutes);
        await secured.register(schedulesRoutes);
      });
    },
    { prefix: API_PREFIX },
  );

  return app;
};
