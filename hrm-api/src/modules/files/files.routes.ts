import multipart from '@fastify/multipart';
import { errorResponseSchema, PERMISSIONS, storedFileSchema } from '@hrm/shared';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppInstance } from '../../app';
import { badRequest } from '../../lib/errors';
import { contentDisposition } from './file-type';
import { fileTooLarge, type UploadedFile } from './files.service';

const documentFileParams = z.object({ id: z.string(), documentId: z.string() });

/** Read the single `file` part of a multipart request into memory (bounded by FILE_MAX_BYTES). */
const readSingleFile = async (req: FastifyRequest): Promise<UploadedFile> => {
  try {
    const part = await req.file();
    if (!part) throw badRequest('file_required');
    return { fileName: part.filename, data: await part.toBuffer() };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'FST_REQ_FILE_TOO_LARGE') throw fileTooLarge();
    if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') throw badRequest('file_required');
    throw err;
  }
};

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
