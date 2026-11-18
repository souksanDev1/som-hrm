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
import type { ApprovalHandlerRegistry } from './modules/approvals/approval-handlers';
import { approvalsRoutes } from './modules/approvals/approvals.routes';
import { createApprovalsService, type ApprovalsService } from './modules/approvals/approvals.service';
import { createDelegationsService, type DelegationsService } from './modules/approvals/delegations.service';
import { defaultApprovalRegistry } from './modules/approvals/registry';
import { createAuditService, type AuditService } from './modules/audit/audit.service';
import { auditRoutes } from './modules/audit/audit.routes';
import { protectedAuthRoutes, publicAuthRoutes } from './modules/auth/auth.routes';
import { createAuthService, type AuthService, type ResolvedAuth } from './modules/auth/auth.service';
import { AuthCache } from './modules/auth/auth-cache';
import { listenForAuthChanges } from './db/auth-changes';
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
import { overtimeRoutes } from './modules/overtime/overtime.routes';
import { createOvertimeService, type OvertimeService } from './modules/overtime/overtime.service';
import { scanImportRoutes } from './modules/attendance/scan-import.routes';
import { createScanImportService, type ScanImportService } from './modules/attendance/scan-import.service';
import { authPlugin, ttlToSeconds } from './plugins/auth';
import { createAttendanceReportService, type AttendanceReportService } from './modules/shifts/attendance-report.service';
import { shiftsRoutes } from './modules/shifts/shifts.routes';
import { createShiftsService, type ShiftsService } from './modules/shifts/shifts.service';
import { registerErrorHandler } from './plugins/error-handler';
import { attendanceRequestsRoutes } from './modules/attendance/attendance-requests.routes';
import { createAttendanceRequestsService, type AttendanceRequestsService } from './modules/attendance/attendance-requests.service';
import { checkinRoutes } from './modules/attendance/checkin.routes';
import { createCheckinService, type CheckinService } from './modules/attendance/checkin.service';
import { kioskDeviceRoutes, kioskRoutes } from './modules/kiosk/kiosk.routes';
import { createKioskService, type KioskService } from './modules/kiosk/kiosk.service';
import { createLeaveService, type LeaveService } from './modules/leave/leave.service';
import { leaveRoutes } from './modules/leave/leave.routes';
import { leaveRequestsRoutes } from './modules/leave/leave-requests.routes';
import { createLeaveRequestsService, type LeaveRequestsService } from './modules/leave/leave-requests.service';

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
  approvals: ApprovalsService;
  delegations: DelegationsService;
  shifts: ShiftsService;
  attendanceReport: AttendanceReportService;
  overtime: OvertimeService;
  scanImport: ScanImportService;
  attendanceRequests: AttendanceRequestsService;
  checkin: CheckinService;
  kiosk: KioskService;
  leave: LeaveService;
  leaveRequests: LeaveRequestsService;
}

declare module 'fastify' {
  interface FastifyInstance {
    services: Services;
    config: Env;
    sms: SmsSender;
    authCache: AuthCache<ResolvedAuth>;
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
  /** Approval subject handlers; defaults to the modules wired in modules/approvals/registry.ts. Tests add their own. */
  approvalRegistry?: ApprovalHandlerRegistry;
}

export const API_PREFIX = '/api/v1';

export const buildApp = async ({ env, db, logger = true, sms, storage, approvalRegistry }: BuildAppOptions): Promise<AppInstance> => {
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

  // Auth contexts are cached between requests and dropped on every committed change to them: in this process
  // through the Db change feed, in other processes through LISTEN/NOTIFY (db/auth-changes, auth-cache).
  const authCache = new AuthCache<ResolvedAuth>({ ttlMs: env.AUTH_CACHE_TTL_MS });
  app.decorate('authCache', authCache);
  if (env.AUTH_CACHE_TTL_MS > 0) {
    const unsubscribe = db.onAuthChange((change) => authCache.invalidate(change));
    const listener = listenForAuthChanges(env.DATABASE_URL, {
      onChange: (change) => authCache.invalidate(change),
      onReady: (ready) => authCache.setReady(ready),
      onError: (err) => app.log.warn({ err }, 'auth change listener disconnected; auth cache bypassed until it reconnects'),
    });
    app.addHook('onClose', async () => {
      unsubscribe();
      await listener.close();
    });
  }

  const fileStorage = storage ?? createLocalFileStorage(env.FILE_STORAGE_DIR);
  app.decorate('config', env);
  app.decorate('sms', sms ?? createConsoleSmsSender((msg) => app.log.info(msg)));
  const employees = createEmployeesService(db, cipher, { storage: fileStorage });
  app.decorate('services', {
    auth: createAuthService(db, env, { sign: (p) => app.jwt.sign(p), accessTtlSeconds }, app.sms, { cache: authCache }),
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
    approvals: createApprovalsService(db, approvalRegistry ?? defaultApprovalRegistry),
    delegations: createDelegationsService(db),
    shifts: createShiftsService(db),
    attendanceReport: createAttendanceReportService(db),
    overtime: createOvertimeService(db, approvalRegistry ?? defaultApprovalRegistry),
    scanImport: createScanImportService(db, { secret: env.JWT_SECRET }),
    attendanceRequests: createAttendanceRequestsService(db, approvalRegistry ?? defaultApprovalRegistry),
    checkin: createCheckinService(db, approvalRegistry ?? defaultApprovalRegistry),
    kiosk: createKioskService(db, () => app.services.files),
    leave: createLeaveService(db),
    leaveRequests: createLeaveRequestsService(db, approvalRegistry ?? defaultApprovalRegistry),
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
        await secured.register(approvalsRoutes);
        await secured.register(shiftsRoutes);
        await secured.register(overtimeRoutes);
        await secured.register(scanImportRoutes);
        await secured.register(attendanceRequestsRoutes);
        await secured.register(checkinRoutes);
        await secured.register(kioskRoutes);
        await secured.register(leaveRoutes);
        await secured.register(leaveRequestsRoutes);
      });
      // Kiosk tablets (FR-ATT-03): own `Authorization: Kiosk <token>` scope, no user JWT.
      await api.register(kioskDeviceRoutes);
    },
    { prefix: API_PREFIX },
  );

  return app;
};
