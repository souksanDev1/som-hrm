import {
  correctionSchema,
  createCorrectionSchema,
  createDeviceChangeSchema,
  createOffsitePermissionSchema,
  deviceBindingSchema,
  deviceChangeRequestSchema,
  employeeDevicesQuerySchema,
  employeeDevicesSchema,
  errorResponseSchema,
  idParamsSchema,
  offsitePermissionQuerySchema,
  offsitePermissionSchema,
  onBehalfPunchSchema,
  paginatedSchema,
  PERMISSIONS,
  reviewDecisionSchema,
  reviewPunchSchema,
  reviewQueueQuerySchema,
} from '@hrm/shared';
import { z } from 'zod';
import type { AppInstance } from '../../app';

/**
 * HR attendance tools (review queue, punches on behalf, off-site permissions, device reset) and employee attendance
 * requests (device change, time correction). Data scope is enforced in the service (404 outside it).
 */
export const attendanceRequestsRoutes = async (app: AppInstance) => {
  const svc = app.services.attendanceRequests;
  const errors = { 400: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema };

  // ── Suspicious-punch review (FR-ATT-14) ──
  app.get(
    '/attendance/review',
    {
      preHandler: app.requirePermission(PERMISSIONS.ATTENDANCE_REVIEW),
      schema: { description: 'Suspicious punches waiting for review (FR-ATT-14), oldest first.', querystring: reviewQueueQuerySchema, response: { 200: paginatedSchema(reviewPunchSchema) } },
    },
    async (req) => svc.reviewQueue(req.auth, req.query),
  );

  app.post(
    '/attendance/review/:id',
    {
      preHandler: app.requirePermission(PERMISSIONS.ATTENDANCE_REVIEW),
      schema: {
        description: 'Approve or reject a suspicious punch (a rejection needs a note and drops the punch from its day).',
        params: idParamsSchema,
        body: reviewDecisionSchema,
        response: { 200: reviewPunchSchema, ...errors },
      },
    },
    async (req) => svc.decideReview(req.auth, req.params.id, req.body, { ip: req.ip }),
  );

  // ── HR on behalf (FR-ATT-04) ──
  app.post(
    '/attendance/punches/on-behalf',
    {
      preHandler: app.requirePermission(PERMISSIONS.ATTENDANCE_PUNCH_ON_BEHALF),
      schema: {
        description: 'Record a punch for an employee (source HR_ON_BEHALF). `capturedAt` is workspace-local "YYYY-MM-DDTHH:mm"; a reason is required.',
        body: onBehalfPunchSchema,
        response: { 201: reviewPunchSchema, ...errors },
      },
    },
    async (req, reply) => reply.code(201).send(await svc.punchOnBehalf(req.auth, req.body, { ip: req.ip })),
  );

  // ── Off-site permissions (FR-ATT-16.1) ──
  app.get(
    '/attendance/offsite-permissions/me',
    { schema: { description: "The caller's off-site permissions still in force or upcoming.", response: { 200: z.array(offsitePermissionSchema) } } },
    async (req) => svc.myOffsite(req.auth),
  );

  app.get(
    '/attendance/offsite-permissions',
    {
      preHandler: app.requirePermission(PERMISSIONS.ATTENDANCE_OFFSITE_MANAGE),
      schema: { querystring: offsitePermissionQuerySchema, response: { 200: paginatedSchema(offsitePermissionSchema) } },
    },
    async (req) => svc.listOffsite(req.auth, req.query),
  );

  app.post(
    '/attendance/offsite-permissions',
    {
      preHandler: app.requirePermission(PERMISSIONS.ATTENDANCE_OFFSITE_MANAGE),
      schema: { body: createOffsitePermissionSchema, response: { 201: offsitePermissionSchema, ...errors } },
    },
    async (req, reply) => reply.code(201).send(await svc.createOffsite(req.auth, req.body, { ip: req.ip })),
  );

  app.post(
    '/attendance/offsite-permissions/:id/revoke',
    {
      preHandler: app.requirePermission(PERMISSIONS.ATTENDANCE_OFFSITE_MANAGE),
      schema: { params: idParamsSchema, response: { 200: offsitePermissionSchema, ...errors } },
    },
    async (req) => svc.revokeOffsite(req.auth, req.params.id, { ip: req.ip }),
  );

  // ── Devices (FR-ATT-11) ──
  app.get(
    '/attendance/devices',
    {
      preHandler: app.requirePermission(PERMISSIONS.ATTENDANCE_DEVICE_MANAGE),
      schema: { description: "An employee's bound phones and device change requests.", querystring: employeeDevicesQuerySchema, response: { 200: employeeDevicesSchema, ...errors } },
    },
    async (req) => svc.employeeDevices(req.auth, req.query.employeeId),
  );

  app.post(
    '/attendance/devices/:id/reset',
    {
      preHandler: app.requirePermission(PERMISSIONS.ATTENDANCE_DEVICE_MANAGE),
      schema: { description: 'Unbind a phone; the employee binds a new one at the next sign-in.', params: idParamsSchema, response: { 200: deviceBindingSchema, ...errors } },
    },
    async (req) => svc.resetBinding(req.auth, req.params.id, { ip: req.ip }),
  );

  app.post(
    '/attendance/device-change-requests',
    {
      schema: {
        description: 'Ask HR to bind this phone instead of the current one (FR-ATT-11.2); decided through the DEVICE_CHANGE approval.',
        body: createDeviceChangeSchema,
        response: { 201: deviceChangeRequestSchema, ...errors },
      },
    },
    async (req, reply) => reply.code(201).send(await svc.requestDeviceChange(req.auth, req.body, { ip: req.ip })),
  );

  app.get('/attendance/device-change-requests/me', { schema: { response: { 200: z.array(deviceChangeRequestSchema) } } }, async (req) =>
    svc.myDeviceRequests(req.auth),
  );

  // ── Time corrections (FR-ATT-19) ──
  app.post(
    '/attendance/corrections',
    {
      schema: {
        description:
          'Request a correction of one of your work dates. Times are workspace-local "HH:mm"; an attachment comes from POST /files?purpose=ATTACHMENT.',
        body: createCorrectionSchema,
        response: { 201: correctionSchema, ...errors },
      },
    },
    async (req, reply) => reply.code(201).send(await svc.createCorrection(req.auth, req.body, { ip: req.ip })),
  );

  app.get('/attendance/corrections/me', { schema: { response: { 200: z.array(correctionSchema) } } }, async (req) => svc.myCorrections(req.auth));
};
