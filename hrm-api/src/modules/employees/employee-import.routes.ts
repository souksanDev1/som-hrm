import multipart from '@fastify/multipart';
import {
  employeeImportPreviewSchema,
  employeeImportResultSchema,
  employeeImportTemplateQuerySchema,
  errorResponseSchema,
  PERMISSIONS,
} from '@hrm/shared';
import type { AppInstance } from '../../app';
import { contentDisposition } from '../files/file-type';
import { readFileWithFields, readSingleFile } from '../files/multipart';

/** Bulk employee import (FR-EMP-09), guarded by `employee.import`. Multipart parsing is scoped to this plugin only. */
export const employeeImportRoutes = async (app: AppInstance) => {
  const svc = app.services.employeeImport;
  // One file plus, on confirm, the `importToken` field.
  await app.register(multipart, { limits: { fileSize: app.config.FILE_MAX_BYTES, files: 1, fields: 1, parts: 2 } });
  const canImport = app.requirePermission(PERMISSIONS.EMPLOYEE_IMPORT);
  const errors = { 400: errorResponseSchema, 409: errorResponseSchema, 413: errorResponseSchema, 415: errorResponseSchema };

  app.get(
    '/employees/import/template',
    {
      preHandler: canImport,
      schema: {
        description: 'Download the employee import template (Lao + English headers).',
        produces: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
        querystring: employeeImportTemplateQuerySchema,
      },
    },
    async (req, reply) => {
      const file = await svc.template(req.query.format);
      return reply
        .header('content-type', file.contentType)
        .header('content-disposition', contentDisposition(file.fileName))
        .header('cache-control', 'no-store')
        .send(file.data);
    },
  );

  app.post(
    '/employees/import/preview',
    {
      preHandler: canImport,
      schema: {
        description: 'Validate an employee import file (multipart field `file`, .xlsx or CSV) without saving anything.',
        consumes: ['multipart/form-data'],
        response: { 200: employeeImportPreviewSchema, ...errors },
      },
    },
    async (req) => svc.preview(req.auth, await readSingleFile(req)),
  );

  app.post(
    '/employees/import/confirm',
    {
      preHandler: canImport,
      schema: {
        description: 'Create all employees of a previewed file in one transaction. Multipart: the same `file` plus `importToken` from the preview.',
        consumes: ['multipart/form-data'],
        response: { 201: employeeImportResultSchema, ...errors },
      },
    },
    async (req, reply) => {
      const { fields, ...file } = await readFileWithFields(req);
      return reply.status(201).send(await svc.confirm(req.auth, file, fields.importToken));
    },
  );
};
