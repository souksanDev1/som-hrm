import {
  parseScanSheet,
  parseScanText,
  SCAN_GENERIC_TEMPLATE_COLUMNS,
  ScanFormat,
  type ParsedScanRow,
  type ScanTemplateFormat,
} from '@hrm/shared';
import ExcelJS from 'exceljs';
import { AppError, badRequest } from '../../lib/errors';
import { readImportFile, type RawCell } from '../employees/employee-import.file';
import { detectImportFileType } from '../files/file-type';

/**
 * File I/O of the scanner import (FR-ATT-02): bytes → parsed scan rows (the parsers live in @hrm/shared) and the
 * downloadable generic template. Excel reading reuses the employee import's guarded reader (ZIP-bomb + row limits).
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** An .xlsx cell as text. Date cells hold the wall-clock time as UTC fields; Excel's time-only cells sit on 1899-12-30. */
const cellText = (cell: RawCell): string | null => {
  if (cell === null) return null;
  if (cell instanceof Date) {
    const time = `${pad(cell.getUTCHours())}:${pad(cell.getUTCMinutes())}:${pad(cell.getUTCSeconds())}`;
    if (cell.getUTCFullYear() < 1900) return time;
    const date = cell.toISOString().slice(0, 10);
    return time === '00:00:00' ? date : `${date} ${time}`;
  }
  if (typeof cell === 'object') return null; // formula / error value: refused like in the employee import
  return String(cell).trim() || null;
};

/** Parse an upload of `format`; the file type comes from its bytes. Throws on file-level problems. */
export const readScanFile = async (format: ScanFormat, data: Buffer, maxRows: number): Promise<ParsedScanRow[]> => {
  if (data.length === 0) throw badRequest('file_required');
  const type = detectImportFileType(data);
  if (!type) throw new AppError(415, 'unsupported_import_file');
  let result;
  if (type === 'xlsx') {
    // The HIP export is a text file; only header-based layouts come as Excel.
    if (format === ScanFormat.HIP) throw new AppError(415, 'scan_format_needs_text');
    const sheet = await readImportFile(data, maxRows).catch((err: unknown) => {
      throw err instanceof AppError && err.code === 'import_empty' ? badRequest('scan_import_empty') : err;
    });
    result = parseScanSheet(format, {
      header: sheet.header.map(cellText),
      rows: sheet.rows.map((r) => ({ row: r.row, cells: r.cells.map(cellText) })),
    });
  } else {
    result = parseScanText(format, new TextDecoder('utf-8').decode(data));
  }
  if (!result.ok) throw badRequest(result.error);
  if (result.rows.length > maxRows) throw badRequest('import_too_many_rows', { max: maxRows });
  return result.rows;
};

export const SCAN_TEMPLATE_CONTENT_TYPES: Record<ScanTemplateFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

const GUIDE: readonly [string, string, string][] = [
  ['employee_code', 'ລະຫັດພະນັກງານ / Employee code', 'E001'],
  ['date', 'ວັນທີ / Date', 'YYYY-MM-DD or dd/MM/yyyy'],
  ['time', 'ເວລາ / Time', 'HH:mm or HH:mm:ss (or one "datetime" column instead of date + time)'],
  ['type', 'ປະເພດ / Type (optional)', 'IN / OUT — blank: first scan of the work day is IN, the rest OUT'],
];

/** Empty generic template (header row only, so nothing is imported by mistake); the xlsx adds a guide sheet. */
export const buildScanTemplate = async (format: ScanTemplateFormat): Promise<Buffer> => {
  const headers = [...SCAN_GENERIC_TEMPLATE_COLUMNS];
  if (format === 'csv') return Buffer.from(`\uFEFF${headers.join(',')}\r\n`, 'utf8');
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Scans');
  sheet.addRow(headers).font = { bold: true };
  // Text format keeps codes and times exactly as typed.
  sheet.columns.forEach((col) => {
    col.width = 18;
    col.numFmt = '@';
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  const guide = wb.addWorksheet('Guide');
  guide.addRow(['ຖັນ / Column', 'ຄວາມໝາຍ / Meaning', 'ຮູບແບບ / Format']).font = { bold: true };
  for (const g of GUIDE) guide.addRow([...g]);
  guide.columns.forEach((col) => (col.width = 45));
  return Buffer.from(await wb.xlsx.writeBuffer());
};
