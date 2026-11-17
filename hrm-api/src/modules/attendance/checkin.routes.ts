import { checkinStatusSchema, errorResponseSchema, myPunchesQuerySchema, myPunchSchema, punchBatchResponseSchema, punchBatchSchema } from '@hrm/shared';
import { z } from 'zod';
import type { AppInstance } from '../../app';

/**
 * Mobile check-in for the signed-in employee (FR-ATT-01/05–09/15/16.2). No extra permission: every employee
 * punches for themselves only; HR/manager views live in the attendance admin routes.
 */
export const checkinRoutes = async (app: AppInstance) => {
  const svc = app.services.checkin;

  app.post(
    '/attendance/punches',
    {
      schema: {
        description:
          'Upload a batch of punches from the mobile offline queue. Each item is created, replayed (same clientRef) or rejected with an error code; one bad item never fails the batch.',
        body: punchBatchSchema,
        response: { 200: punchBatchResponseSchema, 403: errorResponseSchema },
      },
    },
    async (req) => svc.submitPunches(req.auth, req.body, { ip: req.ip }),
  );

  app.get(
    '/attendance/me/status',
    { schema: { description: "Today's check-in context: shift, branch geofence, modes, parameters, device, off-site permission, last punch, day.", response: { 200: checkinStatusSchema } } },
    async (req) => svc.status(req.auth),
  );

  app.get(
    '/attendance/punches/me',
    { schema: { description: 'Own punches by work date (newest first), with offline flag and received time.', querystring: myPunchesQuerySchema, response: { 200: z.array(myPunchSchema) } } },
    async (req) => svc.myPunches(req.auth, req.query),
  );
};
