import { z } from 'zod';

/** Stored-file metadata exposed to clients (bytes are downloaded through an authorised API route). */
export const storedFileSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
});
export type StoredFileRef = z.infer<typeof storedFileSchema>;

/** File types accepted for employee documents (FR-EMP-07.2). The API checks magic bytes, not the extension. */
export const DOCUMENT_FILE_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type DocumentFileMimeType = (typeof DOCUMENT_FILE_MIME_TYPES)[number];

/** `accept` attribute for document pickers. */
export const DOCUMENT_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

/**
 * Default upload limit. The API enforces its configured FILE_MAX_BYTES; clients use this
 * only for early feedback before sending the file.
 */
export const DEFAULT_FILE_MAX_BYTES = 10 * 1024 * 1024;
