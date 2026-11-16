import multipart from '@fastify/multipart';
import { errorResponseSchema, PERMISSIONS, storedFileSchema } from '@hrm/shared';
import { z } from 'zod';
import type { AppInstance } from '../../app';
import { contentDisposition } from './file-type';
import { readSingleFile } from './multipart';

const documentFileParams = z.object({ id: z.string(), documentId: z.string() });

/** Employee document files (FR-EMP-07). Multipart parsing is scoped to this plugin only. */
export const filesRoutes = async (app: AppInstance) => {
  const svc = app.services.files;
  await app.register(multipart, { limits: { fileSize: svc.maxBytes, files: 1, fields: 0, parts: 1 } });

  app.put(
    '/employees/:id/documents/:documentId/file',
    {
      preHandler: app.requirePermission(PERMISSIONS.EMPLOYEE_WRITE),
      schema: {
        description: 'Upload or replace the file of an employee document (multipart field `file`; PDF, JPEG or PNG).',
        consumes: ['multipart/form-data'],
        params: documentFileParams,
        response: { 200: storedFileSchema, 413: errorResponseSchema, 415: errorResponseSchema },
      },
    },
    async (req) => svc.uploadEmployeeDocumentFile(req.auth, req.params.id, req.params.documentId, await readSingleFile(req)),
  );

  app.get(
    '/employees/:id/documents/:documentId/file',
    {
      schema: {
        description: 'Download the file of an employee document (employee.read, or the employee themself).',
        produces: ['application/pdf', 'image/jpeg', 'image/png'],
        params: documentFileParams,
      },
    },
    async (req, reply) => {
      const { file, stream } = await svc.downloadEmployeeDocumentFile(req.auth, req.params.id, req.params.documentId);
      return reply
        .header('content-type', file.mimeType)
        .header('content-length', file.sizeBytes)
        .header('content-disposition', contentDisposition(file.originalName))
        .header('cache-control', 'private, no-store')
        .send(stream);
    },
  );
};
