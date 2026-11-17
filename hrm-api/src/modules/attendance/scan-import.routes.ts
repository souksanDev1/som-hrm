import multipart from '@fastify/multipart';
import {
  errorResponseSchema,
  PERMISSIONS,
  scanImportListQuerySchema,
  scanImportListSchema,
  scanImportPreviewSchema,
  scanImportSummarySchema,
  scanTemplateQuerySchema,
} from '@hrm/shared';
import type { AppInstance } from '../../app';
import { contentDisposition } from '../files/file-type';
import { readFileWithFields } from '../files/multipart';

/** Scanner-file import (FR-ATT-02), guarded by `scan.import`. Multipart parsing is scoped to this plugin only. */
export const scanImportRoutes = async (app: AppInstance) => {
  const svc = app.services.scanImport;
  // One file plus `format`, `branchId` and, on confirm, `importToken`.
  await app.register(multipart, { limits: { fileSize: app.config.FILE_MAX_BYTES, files: 1, fields: 3, parts: 4 } });
  const canImport = app.requirePermission(PERMISSIONS.SCAN_IMPORT);
  const errors = { 400: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema, 413: errorResponseSchema, 415: errorResponseSchema };

  app.get(
    '/attendance/scan-imports/template',
    {
      preHandler: canImport,
      schema: {
        description: 'Download the generic scan import template (employee_code, date, time, type).',
        produces: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
        querystring: scanTemplateQuerySchema,
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

  app.get(
    '/attendance/scan-imports',
    { preHandler: canImport, schema: { description: 'Scanner import history, newest first.', querystring: scanImportListQuerySchema, response: { 200: scanImportListSchema } } },
    async (req) => svc.list(req.auth, req.query),
  );

  app.post(
    '/attendance/scan-imports/preview',
    {
      preHandler: canImport,
      schema: {
        description: 'Analyse a scanner file without saving anything. Multipart: `file`, `format` (ZKTECO | HIP | GENERIC), optional `branchId`.',
        consumes: ['multipart/form-data'],
        response: { 200: scanImportPreviewSchema, ...errors },
      },
    },
    async (req) => {
      const { fields, ...file } = await readFileWithFields(req);
      return svc.preview(req.auth, file, fields);
    },
  );

  app.post(
    '/attendance/scan-imports/confirm',
    {
      preHandler: canImport,
      schema: {
        description: 'Import the OK rows of a previewed scanner file as punches (one transaction). Multipart: the same `file`, `format`, `branchId` plus `importToken`.',
        consumes: ['multipart/form-data'],
        response: { 201: scanImportSummarySchema, ...errors },
      },
    },
    async (req, reply) => {
      const { fields, ...file } = await readFileWithFields(req);
      return reply.status(201).send(await svc.confirm(req.auth, file, fields));
    },
  );
};
