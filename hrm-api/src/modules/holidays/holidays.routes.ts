import {
  createHolidaySchema,
  ensureHolidayYearResultSchema,
  ensureHolidayYearSchema,
  holidayListQuerySchema,
  holidaySchema,
  idParamsSchema,
  PERMISSIONS,
  updateHolidaySchema,
} from '@hrm/shared';
import { z } from 'zod';
import type { AppInstance } from '../../app';

/** Holiday calendar (FR-WS-04/05): same permissions as the other org settings. */
export const holidaysRoutes = async (app: AppInstance) => {
  const read = app.requirePermission(PERMISSIONS.ORG_READ);
  const write = app.requirePermission(PERMISSIONS.ORG_WRITE);
  const svc = app.services.holidays;

  app.get('/holidays', { preHandler: read, schema: { querystring: holidayListQuerySchema, response: { 200: z.array(holidaySchema) } } }, async (req) =>
    svc.list(req.auth, req.query.year),
  );
  // The signed-in employee's own days off (women-only and nationality rules applied).
  app.get(
    '/holidays/mine',
    { preHandler: read, schema: { querystring: holidayListQuerySchema, response: { 200: z.array(holidaySchema) } } },
    async (req) => svc.listMine(req.auth, req.query.year),
  );
  app.post('/holidays', { preHandler: write, schema: { body: createHolidaySchema, response: { 201: holidaySchema } } }, async (req, reply) =>
    reply.status(201).send(await svc.create(req.auth, req.body)),
  );
  app.post(
    '/holidays/ensure-year',
    { preHandler: write, schema: { body: ensureHolidayYearSchema, response: { 200: ensureHolidayYearResultSchema } } },
    async (req) => svc.ensureYear(req.auth, req.body.year),
  );
  app.patch(
    '/holidays/:id',
    { preHandler: write, schema: { params: idParamsSchema, body: updateHolidaySchema, response: { 200: holidaySchema } } },
    async (req) => svc.update(req.auth, req.params.id, req.body),
  );
  app.delete('/holidays/:id', { preHandler: write, schema: { params: idParamsSchema } }, async (req, reply) => {
    await svc.delete(req.auth, req.params.id);
    return reply.status(204).send();
  });
};
