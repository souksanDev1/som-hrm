import type { Prisma } from '@prisma/client';
import type { Tx } from '../../db/client';

export const storedFileSelect = { id: true, originalName: true, mimeType: true, sizeBytes: true, storageKey: true } as const;

export const filesRepository = {
  findEmployeeDocument: (tx: Tx, workspaceId: string, employeeId: string, documentId: string) =>
    tx.employeeDocument.findFirst({
      where: { id: documentId, employeeId, workspaceId },
      select: { id: true, fileId: true, file: { select: storedFileSelect } },
    }),

  create: (tx: Tx, data: Prisma.StoredFileUncheckedCreateInput) => tx.storedFile.create({ data, select: storedFileSelect }),

  linkDocument: (tx: Tx, documentId: string, fileId: string) =>
    tx.employeeDocument.update({ where: { id: documentId }, data: { fileId } }),

  /** Delete a file row unless something still references it. Returns true when deleted. */
  deleteIfUnreferenced: async (tx: Tx, workspaceId: string, fileId: string): Promise<boolean> => {
    const refs = await tx.employeeDocument.count({ where: { workspaceId, fileId } });
    if (refs > 0) return false;
    const { count } = await tx.storedFile.deleteMany({ where: { id: fileId, workspaceId } });
    return count > 0;
  },
};
