import {
  myOvertimeSchema,
  overtimeInputSchema,
  overtimeMonthQuerySchema,
  overtimePreviewInputSchema,
  overtimePreviewSchema,
  overtimeReportQuerySchema,
  overtimeReportSchema,
  overtimeRequestSchema,
  PERMISSIONS,
} from '@hrm/shared';
import type { AppInstance } from '../../app';

/**
 * Overtime (FR-ATT-20..23). Filing and the own list need only an employee profile (any signed-in employee);
 * the monthly report needs `attendance.read_all` and is limited to the caller's data scope.
 */
export const overtimeRoutes = async (app: AppInstance) => {
  const svc = app.services.overtime;

  app.post('/overtime/preview', { schema: { body: overtimePreviewInputSchema, response: { 200: overtimePreviewSchema } } }, async (req) =>
    svc.preview(req.auth, req.body),
  );
  app.post('/overtime', { schema: { body: overtimeInputSchema, response: { 201: overtimeRequestSchema } } }, async (req, reply) =>
    reply.status(201).send(await svc.create(req.auth, req.body, { ip: req.ip })),
  );
  app.get('/overtime/me', { schema: { querystring: overtimeMonthQuerySchema, response: { 200: myOvertimeSchema } } }, async (req) =>
    svc.mine(req.auth, req.query.month),
  );
  app.get(
    '/overtime',
    {
      preHandler: app.requirePermission(PERMISSIONS.ATTENDANCE_READ_ALL),
      schema: { querystring: overtimeReportQuerySchema, response: { 200: overtimeReportSchema } },
    },
    async (req) => svc.report(req.auth, req.query),
  );
};
