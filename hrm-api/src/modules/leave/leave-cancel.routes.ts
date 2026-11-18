import { idParamsSchema, leaveCancelInputSchema, leaveRequestSchema } from '@hrm/shared';
import type { AppInstance } from '../../app';

/**
 * `POST /leave/requests/:id/cancel` (FR-LV-12): withdraw a pending leave at once, or ask to cancel an approved one
 * (approval LEAVE_CANCEL). No route permission: the service allows the employee, the filer and `leave.manage`.
 */
export const leaveCancelRoutes = async (app: AppInstance) => {
  const svc = app.services.leaveCancel;

  app.post(
    '/leave/requests/:id/cancel',
    { schema: { params: idParamsSchema, body: leaveCancelInputSchema.optional(), response: { 200: leaveRequestSchema } } },
    async (req) => svc.cancel(req.auth, req.params.id, req.body ?? {}, { ip: req.ip }),
  );
};
