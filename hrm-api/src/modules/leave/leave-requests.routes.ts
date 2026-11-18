import {
  idSchema,
  leaveCertificateInputSchema,
  leavePreviewInputSchema,
  leavePreviewSchema,
  leaveRequestInputSchema,
  leaveRequestListQuerySchema,
  leaveRequestSchema,
} from '@hrm/shared';
import { z } from 'zod';
import type { AppInstance } from '../../app';

const idParams = z.object({ id: idSchema });

/**
 * Leave filing (FR-LV-03/05/06/09/10, FR-ORG-03.2). Every signed-in employee files for themselves; HR
 * (`leave.file_on_behalf`) and managers (their reporting line) may file on behalf — checked in the service.
 */
export const leaveRequestsRoutes = async (app: AppInstance) => {
  const svc = app.services.leaveRequests;

  app.post('/leave/requests/preview', { schema: { body: leavePreviewInputSchema, response: { 200: leavePreviewSchema } } }, async (req) =>
    svc.preview(req.auth, req.body),
  );
  app.post('/leave/requests', { schema: { body: leaveRequestInputSchema, response: { 201: leaveRequestSchema } } }, async (req, reply) =>
    reply.status(201).send(await svc.create(req.auth, req.body, { ip: req.ip })),
  );
  app.get('/leave/requests', { schema: { querystring: leaveRequestListQuerySchema, response: { 200: z.array(leaveRequestSchema) } } }, async (req) =>
    svc.list(req.auth, req.query),
  );
  app.get('/leave/requests/:id', { schema: { params: idParams, response: { 200: leaveRequestSchema } } }, async (req) => svc.get(req.auth, req.params.id));
  app.put(
    '/leave/requests/:id/certificate',
    { schema: { params: idParams, body: leaveCertificateInputSchema, response: { 200: leaveRequestSchema } } },
    async (req) => svc.attachCertificate(req.auth, req.params.id, req.body.fileId, { ip: req.ip }),
  );
};
