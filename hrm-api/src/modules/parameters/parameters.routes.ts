import { parameterListSchema, parameterViewSchema, PERMISSIONS, setWorkspaceParameterSchema, type Permission } from '@hrm/shared';
import type { FastifyRequest } from 'fastify';
import type { AppInstance } from '../../app';
import { forbidden, unauthorized } from '../../lib/errors';

/** Passes when the caller has at least one of the permissions. */
const requireAnyPermission =
  (...perms: Permission[]) =>
  async (req: FastifyRequest) => {
    if (!req.auth) throw unauthorized();
    if (!perms.some((p) => req.auth.permissions.includes(p))) throw forbidden();
  };

/**
 * Workspace business parameters (FR-WS-08.1–08.6).
 * Read: company admins (`settings.manage`) and HR (`org.write`, which HR_ADMIN has by default).
 * Write: `settings.manage` only.
 */
export const parametersRoutes = async (app: AppInstance) => {
  app.get(
    '/settings/parameters',
    {
      preHandler: requireAnyPermission(PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.ORG_WRITE),
      schema: { response: { 200: parameterListSchema } },
    },
    async (req) => app.services.parameters.listWorkspace(req.auth.workspaceId),
  );

  app.post(
    '/settings/parameters',
    {
      preHandler: app.requirePermission(PERMISSIONS.SETTINGS_MANAGE),
      schema: { body: setWorkspaceParameterSchema, response: { 201: parameterViewSchema } },
    },
    async (req, reply) => reply.status(201).send(await app.services.parameters.setWorkspace(req.auth, req.body, { ip: req.ip })),
  );
};
