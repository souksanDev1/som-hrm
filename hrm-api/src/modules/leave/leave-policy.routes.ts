import {
  createLeaveTypeInputSchema,
  idParamsSchema,
  leaveAdjustInputSchema,
  leaveLedgerEntrySchema,
  leaveLedgerListSchema,
  leaveLedgerQuerySchema,
  leaveTypeSchema,
  leaveTypeUpdateRequestSchema,
  PERMISSIONS,
} from '@hrm/shared';
import type { AppInstance } from '../../app';

/**
 * Leave policy (FR-LV-01/02: `leave.manage`) and the balance ledger (FR-LV-07: read within the data scope,
 * adjust with `leave.ledger.adjust`). `GET /leave/types` lives in leave.routes.ts.
 */
export const leavePolicyRoutes = async (app: AppInstance) => {
  const manage = app.requirePermission(PERMISSIONS.LEAVE_MANAGE);
  const adjust = app.requirePermission(PERMISSIONS.LEAVE_LEDGER_ADJUST);
  const policy = app.services.leavePolicy;
  const ledger = app.services.leaveLedger;

  app.post('/leave/types', { preHandler: manage, schema: { body: createLeaveTypeInputSchema, response: { 201: leaveTypeSchema } } }, async (req, reply) =>
    reply.status(201).send(await policy.create(req.auth, req.body)),
  );
  app.put(
    '/leave/types/:id',
    { preHandler: manage, schema: { params: idParamsSchema, body: leaveTypeUpdateRequestSchema, response: { 200: leaveTypeSchema } } },
    async (req) => policy.update(req.auth, req.params.id, req.body),
  );

  app.get('/leave/ledger', { schema: { querystring: leaveLedgerQuerySchema, response: { 200: leaveLedgerListSchema } } }, async (req) =>
    ledger.list(req.auth, req.query),
  );
  app.post(
    '/leave/ledger/adjustments',
    { preHandler: adjust, schema: { body: leaveAdjustInputSchema, response: { 201: leaveLedgerEntrySchema } } },
    async (req, reply) => reply.status(201).send(await ledger.adjust(req.auth, req.body)),
  );
};
