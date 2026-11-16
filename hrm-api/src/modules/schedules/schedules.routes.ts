import {
  applyScheduleOverrideSchema,
  employeeWorkScheduleSchema,
  idParamsSchema,
  PERMISSIONS,
  revertScheduleOverrideSchema,
  scheduleBulkResultSchema,
  scheduleOverrideListSchema,
  setStandardScheduleSchema,
  standardScheduleViewSchema,
} from '@hrm/shared';
import type { AppInstance } from '../../app';

/**
 * Working schedules (FR-WS-03).
 * Settings (standard + overrides): `schedule.manage` (OWNER and HR_ADMIN by default).
 * Employee card: `employee.read` within the caller's data scope; own schedule: any signed-in employee.
 */
export const schedulesRoutes = async (app: AppInstance) => {
  const manage = app.requirePermission(PERMISSIONS.SCHEDULE_MANAGE);
  const svc = app.services.schedules;

  app.get(
    '/settings/work-schedule',
    { preHandler: manage, schema: { response: { 200: standardScheduleViewSchema } } },
    async (req) => svc.getStandard(req.auth),
  );

  app.post(
    '/settings/work-schedule',
    { preHandler: manage, schema: { body: setStandardScheduleSchema, response: { 201: standardScheduleViewSchema } } },
    async (req, reply) => reply.status(201).send(await svc.setStandard(req.auth, req.body, { ip: req.ip })),
  );

  app.get(
    '/settings/work-schedule/overrides',
    { preHandler: manage, schema: { response: { 200: scheduleOverrideListSchema } } },
    async (req) => svc.listOverrides(req.auth),
  );

  app.post(
    '/settings/work-schedule/overrides',
    { preHandler: manage, schema: { body: applyScheduleOverrideSchema, response: { 201: scheduleBulkResultSchema } } },
    async (req, reply) => reply.status(201).send(await svc.applyOverride(req.auth, req.body, { ip: req.ip })),
  );

  app.post(
    '/settings/work-schedule/overrides/revert',
    { preHandler: manage, schema: { body: revertScheduleOverrideSchema, response: { 200: scheduleBulkResultSchema } } },
    async (req) => svc.revertOverride(req.auth, req.body, { ip: req.ip }),
  );

  app.get(
    '/employees/:id/work-schedule',
    {
      preHandler: app.requirePermission(PERMISSIONS.EMPLOYEE_READ),
      schema: { params: idParamsSchema, response: { 200: employeeWorkScheduleSchema } },
    },
    async (req) => svc.getForEmployee(req.auth, req.params.id),
  );

  app.get('/me/work-schedule', { schema: { response: { 200: employeeWorkScheduleSchema } } }, async (req) => svc.getOwn(req.auth));
};
