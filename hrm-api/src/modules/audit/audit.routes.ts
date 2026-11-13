import { auditLogSchema, paginatedSchema, paginationQuerySchema, PERMISSIONS } from '@hrm/shared';
import { z } from 'zod';
import type { AppInstance } from '../../app';

export const auditRoutes = async (app: AppInstance) => {
  app.get(
    '/audit-logs',
    {
      preHandler: app.requirePermission(PERMISSIONS.AUDIT_READ),
      schema: {
        querystring: paginationQuerySchema.extend({ entity: z.string().optional() }),
        response: { 200: paginatedSchema(auditLogSchema) },
      },
    },
    async (req) => app.services.audit.list(req.auth.workspaceId, req.query.page, req.query.pageSize, req.query.entity),
  );
};
