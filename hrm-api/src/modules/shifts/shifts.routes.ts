import {
  attendanceDayListSchema,
  attendanceDaysQuerySchema,
  attendanceSummaryQuerySchema,
  attendanceSummarySchema,
  clearRosterSchema,
  createShiftSchema,
  idParamsSchema,
  PERMISSIONS,
  rosterQuerySchema,
  rosterViewSchema,
  rosterWriteResultSchema,
  setRosterSchema,
  shiftDeleteResultSchema,
  shiftListQuerySchema,
  shiftSchema,
  updateShiftSchema,
} from '@hrm/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppInstance } from '../../app';
import { forbidden, unauthorized } from '../../lib/errors';
import { SHIFT_READ_PERMISSIONS } from './shifts.service';

/** Passes when the caller holds at least one of `perms`. */
const requireAny =
  (...perms: readonly string[]) =>
  async (req: FastifyRequest) => {
    if (!req.auth) throw unauthorized();
    if (!perms.some((p) => req.auth.permissions.includes(p))) throw forbidden();
  };

/**
 * Shifts (FR-ATT-17.1/17.2), rotating roster (FR-ATT-17.3) and attendance-day reports (FR-ATT-18).
 * - Shift writes and roster writes: `shift.manage`; shift list also for `schedule.manage` / `attendance.read_all`.
 * - Roster read: `shift.manage` or `attendance.read_all`, within the attendance scope.
 * - Attendance days: every signed-in user; scope by `attendanceScope` (own days at least).
 */
export const shiftsRoutes = async (app: AppInstance) => {
  const manage = app.requirePermission(PERMISSIONS.SHIFT_MANAGE);
  const svc = app.services.shifts;
  const report = app.services.attendanceReport;

  app.get(
    '/shifts',
    { preHandler: requireAny(...SHIFT_READ_PERMISSIONS), schema: { querystring: shiftListQuerySchema, response: { 200: z.array(shiftSchema) } } },
    async (req) => svc.list(req.auth, req.query.active === 'true'),
  );
  app.post('/shifts', { preHandler: manage, schema: { body: createShiftSchema, response: { 201: shiftSchema } } }, async (req, reply) =>
    reply.status(201).send(await svc.create(req.auth, req.body, { ip: req.ip })),
  );
  app.patch(
    '/shifts/:id',
    { preHandler: manage, schema: { params: idParamsSchema, body: updateShiftSchema, response: { 200: shiftSchema } } },
    async (req) => svc.update(req.auth, req.params.id, req.body, { ip: req.ip }),
  );
  app.delete(
    '/shifts/:id',
    { preHandler: manage, schema: { params: idParamsSchema, response: { 200: shiftDeleteResultSchema } } },
    async (req) => svc.remove(req.auth, req.params.id, { ip: req.ip }),
  );

  app.get(
    '/roster',
    {
      preHandler: requireAny(PERMISSIONS.SHIFT_MANAGE, PERMISSIONS.ATTENDANCE_READ_ALL),
      schema: { querystring: rosterQuerySchema, response: { 200: rosterViewSchema } },
    },
    async (req) => svc.roster(req.auth, req.query),
  );
  app.put('/roster', { preHandler: manage, schema: { body: setRosterSchema, response: { 200: rosterWriteResultSchema } } }, async (req) =>
    svc.setRoster(req.auth, req.body, { ip: req.ip }),
  );
  app.delete('/roster', { preHandler: manage, schema: { body: clearRosterSchema, response: { 200: rosterWriteResultSchema } } }, async (req) =>
    svc.clearRoster(req.auth, req.body, { ip: req.ip }),
  );

  app.get(
    '/attendance/days',
    { schema: { querystring: attendanceDaysQuerySchema, response: { 200: attendanceDayListSchema } } },
    async (req) => report.listDays(req.auth, req.query),
  );
  app.get(
    '/attendance/days/summary',
    { schema: { querystring: attendanceSummaryQuerySchema, response: { 200: attendanceSummarySchema } } },
    async (req) => report.summary(req.auth, req.query),
  );
};
