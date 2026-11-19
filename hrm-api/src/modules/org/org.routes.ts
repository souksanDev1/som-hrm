import {
  branchSchema,
  createBranchSchema,
  createDepartmentSchema,
  createPositionSchema,
  departmentSchema,
  idParamsSchema,
  orgChartNodeSchema,
  orgListQuerySchema,
  orgStructureNodeSchema,
  PERMISSIONS,
  positionSchema,
  updateBranchSchema,
  updateDepartmentSchema,
  updatePositionSchema,
} from '@hrm/shared';
import { z } from 'zod';
import type { AppInstance } from '../../app';

export const orgRoutes = async (app: AppInstance) => {
  const read = app.requirePermission(PERMISSIONS.ORG_READ);
  const write = app.requirePermission(PERMISSIONS.ORG_WRITE);
  const svc = app.services.org;

  app.get('/org/chart', { preHandler: read, schema: { response: { 200: z.array(orgChartNodeSchema) } } }, async (req) => svc.orgChart(req.auth));
  app.get('/org/structure', { preHandler: read, schema: { response: { 200: z.array(orgStructureNodeSchema) } } }, async (req) =>
    svc.orgStructure(req.auth),
  );

  // Branches
  app.get('/branches', { preHandler: read, schema: { querystring: orgListQuerySchema, response: { 200: z.array(branchSchema) } } }, async (req) =>
    svc.listBranches(req.auth, req.query),
  );
  app.post('/branches', { preHandler: write, schema: { body: createBranchSchema, response: { 201: branchSchema } } }, async (req, reply) =>
    reply.status(201).send(await svc.createBranch(req.auth, req.body)),
  );
  app.patch('/branches/:id', { preHandler: write, schema: { params: idParamsSchema, body: updateBranchSchema, response: { 200: branchSchema } } }, async (req) =>
    svc.updateBranch(req.auth, req.params.id, req.body),
  );
  // Close = deactivate (hidden from pickers, kept for history); reopen reverses it.
  app.post('/branches/:id/close', { preHandler: write, schema: { params: idParamsSchema, response: { 200: branchSchema } } }, async (req) =>
    svc.setBranchActive(req.auth, req.params.id, false),
  );
  app.post('/branches/:id/reopen', { preHandler: write, schema: { params: idParamsSchema, response: { 200: branchSchema } } }, async (req) =>
    svc.setBranchActive(req.auth, req.params.id, true),
  );
  app.delete('/branches/:id', { preHandler: write, schema: { params: idParamsSchema } }, async (req, reply) => {
    await svc.deleteBranch(req.auth, req.params.id);
    return reply.status(204).send();
  });

  // Departments
  app.get('/departments', { preHandler: read, schema: { querystring: orgListQuerySchema, response: { 200: z.array(departmentSchema) } } }, async (req) =>
    svc.listDepartments(req.auth, req.query),
  );
  app.post('/departments', { preHandler: write, schema: { body: createDepartmentSchema, response: { 201: departmentSchema } } }, async (req, reply) =>
    reply.status(201).send(await svc.createDepartment(req.auth, req.body)),
  );
  app.patch('/departments/:id', { preHandler: write, schema: { params: idParamsSchema, body: updateDepartmentSchema, response: { 200: departmentSchema } } }, async (req) =>
    svc.updateDepartment(req.auth, req.params.id, req.body),
  );
  // Close = deactivate (hidden from pickers, kept for history); reopen reverses it.
  app.post('/departments/:id/close', { preHandler: write, schema: { params: idParamsSchema, response: { 200: departmentSchema } } }, async (req) =>
    svc.setDepartmentActive(req.auth, req.params.id, false),
  );
  app.post('/departments/:id/reopen', { preHandler: write, schema: { params: idParamsSchema, response: { 200: departmentSchema } } }, async (req) =>
    svc.setDepartmentActive(req.auth, req.params.id, true),
  );
  app.delete('/departments/:id', { preHandler: write, schema: { params: idParamsSchema } }, async (req, reply) => {
    await svc.deleteDepartment(req.auth, req.params.id);
    return reply.status(204).send();
  });

  // Positions
  app.get('/positions', { preHandler: read, schema: { querystring: orgListQuerySchema, response: { 200: z.array(positionSchema) } } }, async (req) =>
    svc.listPositions(req.auth, req.query),
  );
  app.post('/positions', { preHandler: write, schema: { body: createPositionSchema, response: { 201: positionSchema } } }, async (req, reply) =>
    reply.status(201).send(await svc.createPosition(req.auth, req.body)),
  );
  app.patch('/positions/:id', { preHandler: write, schema: { params: idParamsSchema, body: updatePositionSchema, response: { 200: positionSchema } } }, async (req) =>
    svc.updatePosition(req.auth, req.params.id, req.body),
  );
  // Close = deactivate (hidden from pickers, kept for history); reopen reverses it.
  app.post('/positions/:id/close', { preHandler: write, schema: { params: idParamsSchema, response: { 200: positionSchema } } }, async (req) =>
    svc.setPositionActive(req.auth, req.params.id, false),
  );
  app.post('/positions/:id/reopen', { preHandler: write, schema: { params: idParamsSchema, response: { 200: positionSchema } } }, async (req) =>
    svc.setPositionActive(req.auth, req.params.id, true),
  );
  app.delete('/positions/:id', { preHandler: write, schema: { params: idParamsSchema } }, async (req, reply) => {
    await svc.deletePosition(req.auth, req.params.id);
    return reply.status(204).send();
  });
};
