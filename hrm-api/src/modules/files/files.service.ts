import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { StoredFileRef } from '@hrm/shared';
import type { Db } from '../../db/client';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { storageKey, type FileStorage } from '../../lib/storage';
import { auditRepository } from '../audit/audit.repository';
import type { AuthContext } from '../auth/auth.service';
import { employeeAccess } from '../employees/employees.service';
import { detectDocumentFileType, sanitizeFileName } from './file-type';
import { filesRepository as repo } from './files.repository';

export interface UploadedFile {
  fileName: string | undefined;
  data: Buffer;
}

export interface FileDownload {
  file: StoredFileRef;
  stream: Readable;
}

export const fileTooLarge = () => new AppError(413, 'file_too_large');

const toRef = (f: { id: string; originalName: string; mimeType: string; sizeBytes: number }): StoredFileRef => ({
  id: f.id,
  originalName: f.originalName,
  mimeType: f.mimeType,
  sizeBytes: f.sizeBytes,
});

/** Validated, tenant-scoped file uploads/downloads (A7, FR-EMP-07). */
export const createFilesService = (db: Db, storage: FileStorage, opts: { maxBytes: number }) => ({
  maxBytes: opts.maxBytes,

  /** Attach (or replace) the scanned file of an employee document. */
  async uploadEmployeeDocumentFile(ctx: AuthContext, employeeId: string, documentId: string, upload: UploadedFile): Promise<StoredFileRef> {
    if (upload.data.length === 0) throw badRequest('file_required');
    if (upload.data.length > opts.maxBytes) throw fileTooLarge();
    const type = detectDocumentFileType(upload.data);
    if (!type) throw new AppError(415, 'unsupported_file_type');

    const ws = ctx.workspaceId;
    const id = randomUUID();
    const key = storageKey(ws, 'EMPLOYEE_DOCUMENT', id);
    let written = false;
    try {
      const { file, replacedKey } = await db.tenant(ws, async (tx) => {
        const doc = await repo.findEmployeeDocument(tx, ws, employeeId, documentId);
        if (!doc) throw notFound();
        await storage.put(key, upload.data);
        written = true;
        const created = await repo.create(tx, {
          id,
          workspaceId: ws,
          storageKey: key,
          purpose: 'EMPLOYEE_DOCUMENT',
          originalName: sanitizeFileName(upload.fileName, type.extension),
          mimeType: type.mimeType,
          sizeBytes: upload.data.length,
          sha256: createHash('sha256').update(upload.data).digest('hex'),
          uploadedById: ctx.userId,
        });
        await repo.linkDocument(tx, doc.id, created.id);
        const replaced = doc.file && (await repo.deleteIfUnreferenced(tx, ws, doc.file.id)) ? doc.file.storageKey : null;
        await auditRepository.create(tx, {
          workspaceId: ws,
          actorUserId: ctx.userId,
          action: doc.file ? 'employee.document_file_replaced' : 'employee.document_file_uploaded',
          entity: 'EmployeeDocument',
          entityId: doc.id,
          meta: { employeeId, fileId: created.id, mimeType: created.mimeType, sizeBytes: created.sizeBytes, replacedFileId: doc.file?.id ?? null },
        });
        return { file: created, replacedKey: replaced };
      });
      // Bytes of the replaced file are removed only after the new link is committed.
      if (replacedKey) await storage.delete(replacedKey).catch(() => undefined);
      return toRef(file);
    } catch (err) {
      if (written) await storage.delete(key).catch(() => undefined);
      throw err;
    }
  },

  async downloadEmployeeDocumentFile(ctx: AuthContext, employeeId: string, documentId: string): Promise<FileDownload> {
    // Same data scope as the employee profile (B8): read_all, own reporting line, or oneself; else 404.
    const doc = await db.tenant(ctx.workspaceId, async (tx) => {
      await employeeAccess.assertCanRead(tx, ctx, employeeId);
      return repo.findEmployeeDocument(tx, ctx.workspaceId, employeeId, documentId);
    });
    if (!doc) throw notFound();
    if (!doc.file) throw notFound('file_missing');
    const stream = await storage.get(doc.file.storageKey).catch(() => {
      throw notFound('file_missing');
    });
    return { file: toRef(doc.file), stream };
  },
});

export type FilesService = ReturnType<typeof createFilesService>;
