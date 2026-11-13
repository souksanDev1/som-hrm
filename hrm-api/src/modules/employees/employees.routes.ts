import {
  createDocumentSchema,
  createEmergencyContactSchema,
  createEmployeeResponseSchema,
  createEmployeeSchema,
  credentialIssuedSchema,
  employeeDetailSchema,
  employeeListQuerySchema,
  employeeSummarySchema,
  idParamsSchema,
  paginatedSchema,
  PERMISSIONS,
  updateEmployeeSchema,
} from '@hrm/shared';
import { z } from 'zod';
import type { AppInstance } from '../../app';

const documentParams = z.object({ id: z.string(), documentId: z.string() });
const contactParams = z.object({ id: z.string(), contactId: z.string() });
const credentialBody = z.object({
  method: z.enum(['PASSWORD', 'PIN']),
  roleCode: z.enum(['HR_ADMIN', 'MANAGER', 'EMPLOYEE']).default('EMPLOYEE'),
});

export const employeesRoutes = async (app: AppInstance) => {
  const read = app.requirePermission(PERMISSIONS.EMPLOYEE_READ);
  const write = app.requirePermission(PERMISSIONS.EMPLOYEE_WRITE);
  const svc = app.services.employees;

  app.get('/me/profile', { schema: { response: { 200: employeeDetailSchema } } }, async (req) => svc.getOwn(req.auth));

  app.get(
    '/employees',
    { preHandler: read, schema: { querystring: employeeListQuerySchema, response: { 200: paginatedSchema(employeeSummarySchema) } } },
    async (req) => svc.list(req.auth, req.query),
  );

  app.get(
    '/employees/:id',
    { preHandler: read, schema: { params: idParamsSchema, response: { 200: employeeDetailSchema } } },
    async (req) => svc.get(req.auth, req.params.id),
  );

  app.post(
    '/employees',
    { preHandler: write, schema: { body: createEmployeeSchema, response: { 201: createEmployeeResponseSchema } } },
    async (req, reply) => reply.status(201).send(await svc.create(req.auth, req.body)),
  );

  app.patch(
    '/employees/:id',
    { preHandler: write, schema: { params: idParamsSchema, body: updateEmployeeSchema, response: { 200: employeeDetailSchema } } },
    async (req) => svc.update(req.auth, req.params.id, req.body),
  );

  app.post(
    '/employees/:id/documents',
    { preHandler: write, schema: { params: idParamsSchema, body: createDocumentSchema, response: { 201: employeeDetailSchema } } },
    async (req, reply) => reply.status(201).send(await svc.addDocument(req.auth, req.params.id, req.body)),
  );

  app.delete(
    '/employees/:id/documents/:documentId',
    { preHandler: write, schema: { params: documentParams, response: { 200: employeeDetailSchema } } },
    async (req) => svc.removeDocument(req.auth, req.params.id, req.params.documentId),
  );

  app.post(
    '/employees/:id/emergency-contacts',
    { preHandler: write, schema: { params: idParamsSchema, body: createEmergencyContactSchema, response: { 201: employeeDetailSchema } } },
    async (req, reply) => reply.status(201).send(await svc.addContact(req.auth, req.params.id, req.body)),
  );

  app.delete(
    '/employees/:id/emergency-contacts/:contactId',
    { preHandler: write, schema: { params: contactParams, response: { 200: employeeDetailSchema } } },
    async (req) => svc.removeContact(req.auth, req.params.id, req.params.contactId),
  );

  app.post(
    '/employees/:id/credentials',
    {
      preHandler: app.requirePermission(PERMISSIONS.USER_MANAGE),
      schema: { params: idParamsSchema, body: credentialBody, response: { 200: credentialIssuedSchema } },
    },
    async (req) => svc.issueCredential(req.auth, req.params.id, req.body.method, req.body.roleCode),
  );
};
