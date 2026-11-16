import {
  EMPLOYEE_IMPORT_COLUMNS,
  translate,
  type EmployeeImportColumn,
  type EmployeeImportFormat,
} from '@hrm/shared';
import ExcelJS from 'exceljs';
import { AppError, badRequest } from '../../lib/errors';
import { detectImportFileType } from '../files/file-type';

/**
 * Spreadsheet I/O for the bulk employee import (FR-EMP-09): read an .xlsx/CSV upload into raw rows,
 * and build the downloadable template. Mapping cells onto employee fields lives in the import service.
 */

/** A cell as read from the file. Formulas and Excel error values are kept as markers and rejected later. */
export type RawCell = string | number | boolean | Date | null | { formula: true } | { error: true };
export interface RawRow {
  /** Spreadsheet row number (the header is row 1). */
  row: number;
  cells: RawCell[];
}
export interface RawSheet {
  header: RawCell[];
  rows: RawRow[];
}

/**
 * Guard against ZIP bombs: the sum of the uncompressed entry sizes an .xlsx may declare. A sheet at the
 * maximum row limit with every column filled is a few MB of XML, so this leaves ample headroom.
 */
export const MAX_XLSX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
/** Columns read per row; the template has ~30, anything wider is not an import file. */
const MAX_COLUMNS = 100;

const tooManyRows = (max: number) => badRequest('import_too_many_rows', { max });
const invalidFile = () => badRequest('invalid_import_file');

/**
 * Total uncompressed size declared in a ZIP's central directory, or null when it cannot be read
 * (not a ZIP, truncated, or ZIP64 — which no legitimate import file needs).
 */
export const zipUncompressedSize = (buf: Buffer): number | null => {
  const EOCD = 0x06054b50;
  const CDH = 0x02014b50;
  const minEocd = 22;
  let eocd = -1;
  for (let i = buf.length - minEocd; i >= Math.max(0, buf.length - minEocd - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CDH) return null;
    const size = buf.readUInt32LE(offset + 24);
    if (size === 0xffffffff) return null;
    total += size;
    offset += 46 + buf.readUInt16LE(offset + 28) + buf.readUInt16LE(offset + 30) + buf.readUInt16LE(offset + 32);
  }
  return total;
};

const isBlank = (cells: RawCell[]) => cells.every((c) => c === null || (typeof c === 'string' && c.trim() === ''));

/** Keep header + non-blank rows; stop as soon as there are more than `maxRows` data rows. */
const collect = (rows: Iterable<RawRow>, maxRows: number): RawSheet => {
  let header: RawCell[] | null = null;
  const data: RawRow[] = [];
  for (const r of rows) {
    if (isBlank(r.cells)) continue;
    if (!header) {
      header = r.cells;
      continue;
    }
    if (data.length >= maxRows) throw tooManyRows(maxRows);
    data.push(r);
  }
  if (!header || !data.length) throw badRequest('import_empty');
  return { header, rows: data };
};

const xlsxCell = (v: ExcelJS.CellValue): RawCell => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if ('formula' in v || 'sharedFormula' in v) return { formula: true };
  if ('error' in v) return { error: true };
  if ('richText' in v) return v.richText.map((t) => t.text).join('');
  if ('text' in v) return typeof v.text === 'string' ? v.text : null;
  return null;
};

const readXlsx = async (data: Buffer, maxRows: number): Promise<RawSheet> => {
  const size = zipUncompressedSize(data);
  if (size === null) throw invalidFile();
  if (size > MAX_XLSX_UNCOMPRESSED_BYTES) throw new AppError(413, 'file_too_large');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    throw invalidFile();
  }
  const sheet = wb.worksheets[0];
  if (!sheet) throw invalidFile();
  // Cheap early exit before walking the rows: header + at most `maxRows` rows that hold values.
  if (sheet.actualRowCount > maxRows + 1) throw tooManyRows(maxRows);
  function* rows(): Generator<RawRow> {
    for (let n = 1; n <= sheet!.rowCount; n++) {
      const values = sheet!.getRow(n).values;
      // ExcelJS row values are 1-based (index 0 is unused).
      const cells = Array.isArray(values) ? values.slice(1, MAX_COLUMNS + 1).map((v) => xlsxCell(v as ExcelJS.CellValue)) : [];
      yield { row: n, cells };
    }
  }
  return collect(rows(), maxRows);
};

/** Minimal RFC 4180 CSV reader: quoted fields, "" escapes, CRLF/LF; `,` or `;` (detected from the header). */
export const parseCsv = (text: string): string[][] => {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
};

const readCsv = (data: Buffer, maxRows: number): RawSheet => {
  const text = new TextDecoder('utf-8').decode(data).replace(/^\uFEFF/, '');
  const rows = parseCsv(text).map((cells, i): RawRow => ({ row: i + 1, cells: cells.slice(0, MAX_COLUMNS).map((c) => c || null) }));
  return collect(rows, maxRows);
};

/** Parse an uploaded import file; the type comes from its bytes, never from the name. */
export const readImportFile = async (data: Buffer, maxRows: number): Promise<RawSheet> => {
  const type = detectImportFileType(data);
  if (!type) throw new AppError(415, 'unsupported_import_file');
  return type === 'xlsx' ? readXlsx(data, maxRows) : readCsv(data, maxRows);
};

// ─────────────────────────── Template ───────────────────────────

/** Header text of a column: "Lao / English", with `*` for required columns. */
export const columnHeader = (c: EmployeeImportColumn): string =>
  `${translate('lo', c.labelKey)} / ${translate('en', c.labelKey)}${c.required ? ' *' : ''}`;

const columnFormat = (c: EmployeeImportColumn): string => {
  switch (c.kind) {
    case 'date':
      return 'YYYY-MM-DD';
    case 'code':
      return (c.values ?? []).join(', ');
    case 'boolean':
      return 'yes / no';
    case 'ref':
      return c.key === 'managerCode' ? 'Employee code (existing, or an earlier row)' : 'Name';
    default:
      return '';
  }
};

const csvField = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const TEMPLATE_CONTENT_TYPES: Record<EmployeeImportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

/** Empty import template: the header row (xlsx adds a second sheet listing formats and allowed codes). */
export const buildTemplate = async (format: EmployeeImportFormat): Promise<Buffer> => {
  const headers = EMPLOYEE_IMPORT_COLUMNS.map(columnHeader);
  // UTF-8 BOM so Excel opens the Lao headers correctly.
  if (format === 'csv') return Buffer.from(`\uFEFF${headers.map(csvField).join(',')}\r\n`, 'utf8');

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Employees');
  sheet.addRow(headers).font = { bold: true };
  sheet.columns.forEach((col, i) => {
    col.width = Math.min(40, Math.max(14, headers[i]!.length));
    // Text format keeps leading zeros (phone, codes) as typed.
    const c = EMPLOYEE_IMPORT_COLUMNS[i]!;
    if (c.kind !== 'date' && c.kind !== 'boolean') col.numFmt = '@';
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const guide = wb.addWorksheet('Codes');
  guide.addRow(['ຖັນ / Column', 'ຈຳເປັນ / Required', 'ຮູບແບບ / Format']).font = { bold: true };
  for (const c of EMPLOYEE_IMPORT_COLUMNS as readonly EmployeeImportColumn[]) guide.addRow([columnHeader(c), c.required ? 'yes' : '', columnFormat(c)]);
  guide.columns.forEach((col) => (col.width = 45));
  return Buffer.from(await wb.xlsx.writeBuffer());
};
