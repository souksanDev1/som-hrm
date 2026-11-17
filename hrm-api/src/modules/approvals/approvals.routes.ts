import {
  absenceDelegationResultSchema,
  absenceDelegationSchema,
  approvalInboxItemSchema,
  approvalInboxQuerySchema,
  approvalRequestDetailSchema,
  approveRequestSchema,
  createDelegationSchema,
  delegateCandidateSchema,
  delegationListSchema,
  delegationSchema,
  idParamsSchema,
  paginatedSchema,
  rejectRequestSchema,
  updateDelegationSchema,
} from '@hrm/shared';
import { z } from 'zod';
import type { AppInstance } from '../../app';

/**
 * Approvals inbox and delegations (FR-ORG-02..06). No route permission: who may decide follows the
 * chain of command, delegations and `approval.hr_fallback`; the services enforce it (404 when the
 * caller may not see a request, 403 when they may see but not decide it).
 */
export const approvalsRoutes = async (app: AppInstance) => {
  const approvals = app.services.approvals;
  const delegations = app.services.delegations;

  // ── Delegations (static paths first) ──
  app.get('/approvals/delegations', { schema: { response: { 200: delegationListSchema } } }, async (req) => delegations.list(req.auth));

  app.post(
    '/approvals/delegations',
    { schema: { body: createDelegationSchema, response: { 201: delegationSchema } } },
    async (req, reply) => reply.status(201).send(await delegations.create(req.auth, req.body, { ip: req.ip })),
  );

  app.patch(
    '/approvals/delegations/:id',
    { schema: { params: idParamsSchema, body: updateDelegationSchema, response: { 200: delegationSchema } } },
    async (req) => delegations.update(req.auth, req.params.id, req.body, { ip: req.ip }),
  );

  app.post(
    '/approvals/delegations/:id/cancel',
    { schema: { params: idParamsSchema, response: { 200: delegationSchema } } },
    async (req) => delegations.cancel(req.auth, req.params.id, { ip: req.ip }),
  );

  // FR-ORG-03.2: called by the leave form (M6) when the signed-in manager files leave.
  app.post(
    '/approvals/delegations/absence',
    { schema: { body: absenceDelegationSchema, response: { 200: absenceDelegationResultSchema } } },
    async (req) => delegations.forAbsence(req.auth, req.body, { ip: req.ip }),
  );

  app.get('/approvals/delegate-candidates', { schema: { response: { 200: z.array(delegateCandidateSchema) } } }, async (req) =>
    delegations.candidates(req.auth),
  );

  // ── Inbox & decisions ──
  app.get(
    '/approvals/inbox',
    { schema: { querystring: approvalInboxQuerySchema, response: { 200: paginatedSchema(approvalInboxItemSchema) } } },
    async (req) => approvals.inbox(req.auth, req.query),
  );

  app.get('/approvals/:id', { schema: { params: idParamsSchema, response: { 200: approvalRequestDetailSchema } } }, async (req) =>
    approvals.get(req.auth, req.params.id),
  );

  app.post(
    '/approvals/:id/approve',
    { schema: { params: idParamsSchema, body: approveRequestSchema, response: { 200: approvalRequestDetailSchema } } },
    async (req) => approvals.approve(req.auth, req.params.id, req.body.note, { ip: req.ip }),
  );

  app.post(
    '/approvals/:id/reject',
    { schema: { params: idParamsSchema, body: rejectRequestSchema, response: { 200: approvalRequestDetailSchema } } },
    async (req) => approvals.reject(req.auth, req.params.id, req.body.note, { ip: req.ip }),
  );
};
