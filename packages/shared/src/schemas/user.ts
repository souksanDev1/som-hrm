import { z } from 'zod';

export const auditLogSchema = z.object({
  id: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
  meta: z.unknown().nullable(),
});
export type AuditLogEntry = z.infer<typeof auditLogSchema>;
