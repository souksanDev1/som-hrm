import { idSchema, leaveBalanceSchema, leaveTypeSchema } from '@hrm/shared';
import { z } from 'zod';
import type { AppInstance } from '../../app';

const balancesQuerySchema = z.object({ employeeId: idSchema.optional(), year: z.coerce.number().int().min(2000).max(2100).optional() });
const balancesResponseSchema = z.object({ employeeId: z.string(), year: z.number().int(), balances: z.array(leaveBalanceSchema) });

/** Leave reads every signed-in user needs (M6 base): leave types and balances. */
export const leaveRoutes = async (app: AppInstance) => {
  const svc = app.services.leave;

  app.get('/leave/types', { schema: { response: { 200: z.array(leaveTypeSchema) } } }, async (req) => svc.types(req.auth));
  app.get('/leave/balances', { schema: { querystring: balancesQuerySchema, response: { 200: balancesResponseSchema } } }, async (req) =>
    svc.balances(req.auth, req.query),
  );
};
