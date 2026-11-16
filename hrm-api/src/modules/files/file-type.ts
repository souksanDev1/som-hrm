import type { DocumentFileMimeType } from '@hrm/shared';

interface Signature {
  mimeType: DocumentFileMimeType;
  extension: string;
  bytes: readonly number[];
}

/** Magic-byte signatures of the accepted document formats (FR-EMP-07.2). */
const SIGNATURES: readonly Signature[] = [
  { mimeType: 'application/pdf', extension: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mimeType: 'image/png', extension: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/jpeg', extension: 'jpg', bytes: [0xff, 0xd8, 0xff] },
];

/**
 * Detect the real file type from its leading bytes. The client-supplied name and
 * content-type are never trusted. Returns null for anything that is not PDF/PNG/JPEG.
 */
export const detectDocumentFileType = (data: Buffer): Pick<Signature, 'mimeType' | 'extension'> | null => {
  const match = SIGNATURES.find((s) => data.length >= s.bytes.length && s.bytes.every((b, i) => data[i] === b));
  return match ? { mimeType: match.mimeType, extension: match.extension } : null;
};

export type ImportFileType = 'xlsx' | 'csv';
const ZIP_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04 (an .xlsx is a ZIP package)

/**
 * Detect a spreadsheet import file (FR-EMP-09) from its bytes: a ZIP package is treated as .xlsx
 * (the parser rejects other ZIPs), and NUL-free valid UTF-8 text as CSV. Anything else is null.
 */
export const detectImportFileType = (data: Buffer): ImportFileType | null => {
  if (data.length >= ZIP_LOCAL_HEADER.length && ZIP_LOCAL_HEADER.every((b, i) => data[i] === b)) return 'xlsx';
  if (data.length === 0 || data.includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(data);
    return 'csv';
  } catch {
    return null;
  }
};

/** Keep a display-safe file name: strip paths and control characters, cap the length. */
export const sanitizeFileName = (name: string | undefined, fallbackExtension: string): string => {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim().slice(0, 200);
  return cleaned || `file.${fallbackExtension}`;
};

/** RFC 6266 Content-Disposition value that works for non-ASCII (e.g. Lao) file names. */
export const contentDisposition = (fileName: string, type: 'attachment' | 'inline' = 'attachment'): string => {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};
