import type { FastifyRequest } from 'fastify';
import { badRequest } from '../../lib/errors';
import { fileTooLarge, type UploadedFile } from './files.service';

/** Map @fastify/multipart errors onto the API's stable codes. */
const mapMultipartError = (err: unknown): unknown => {
  const code = (err as { code?: string }).code;
  if (code === 'FST_REQ_FILE_TOO_LARGE') return fileTooLarge();
  if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') return badRequest('file_required');
  return err;
};

/**
 * Read the single `file` part of a multipart request into memory (bounded by the `fileSize` limit
 * of the plugin's @fastify/multipart registration).
 */
export const readSingleFile = async (req: FastifyRequest): Promise<UploadedFile> => {
  try {
    const part = await req.file();
    if (!part) throw badRequest('file_required');
    return { fileName: part.filename, data: await part.toBuffer() };
  } catch (err) {
    throw mapMultipartError(err);
  }
};

/** Like `readSingleFile`, plus the request's text fields (in any order relative to the file). */
export const readFileWithFields = async (req: FastifyRequest): Promise<UploadedFile & { fields: Record<string, string> }> => {
  try {
    let file: UploadedFile | null = null;
    const fields: Record<string, string> = {};
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const data = await part.toBuffer();
        if (part.fieldname === 'file' && !file) file = { fileName: part.filename, data };
      } else if (typeof part.value === 'string') {
        fields[part.fieldname] = part.value;
      }
    }
    if (!file) throw badRequest('file_required');
    return { ...file, fields };
  } catch (err) {
    throw mapMultipartError(err);
  }
};
