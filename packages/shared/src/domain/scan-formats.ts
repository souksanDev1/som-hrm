import { ScanFormat, type PunchKind } from '../enums';

/**
 * Fingerprint-scanner file parsers (FR-ATT-02.1–02.3). Pure: they turn a file's text (or the cells of an .xlsx
 * sheet) into one row per scan with the employee code, the local wall-clock time and, when the file says so,
 * IN/OUT. Matching codes to employees, time zones, duplicates and storing punches happen in the API.
 *
 * - ZKTECO: the device's `attlog.dat` (`userId  YYYY-MM-DD HH:mm:ss  verify  state  workcode …`, whitespace or
 *   tab separated; state 0 = IN, 1 = OUT, other states = unknown) or the ZKTime CSV/Excel export (header row
 *   with AC-No./No. and Date/Time or Date + Time).
 * - HIP: Time Attendance text export, `code,dd/MM/yyyy,HH:mm[:ss][,…]` with comma, tab, semicolon or space
 *   separators. Real HIP sample files were not available, so this parser is deliberately tolerant.
 * - GENERIC: CSV or Excel with header columns `employee_code`, `date` + `time` or `datetime`, optional `type`.
 */

/** Row-level problems: the row is shown as INVALID with this code. */
export type ScanRowParseError = 'scan_invalid_line' | 'scan_missing_code' | 'scan_invalid_date' | 'scan_invalid_time' | 'scan_invalid_type';
/** File-level problems: the whole file is rejected. */
export type ScanFileParseError = 'scan_import_empty' | 'scan_missing_columns';

export interface ParsedScanRow {
  /** Line (text) or spreadsheet row number, 1-based, header included. */
  rowNumber: number;
  employeeCode: string | null;
  /** Local wall-clock time `YYYY-MM-DD HH:mm:ss` (workspace time zone), or null when unparsable. */
  localDateTime: string | null;
  /** IN/OUT when the file states it; null = derive from the order of the day's punches. */
  kind: PunchKind | null;
  error?: ScanRowParseError;
}

export type ScanParseResult = { ok: true; rows: ParsedScanRow[] } | { ok: false; error: ScanFileParseError };

/** A sheet of text cells (an .xlsx read by the API, or a delimited text file). */
export interface ScanSheet {
  header: readonly (string | null)[];
  rows: readonly { row: number; cells: readonly (string | null)[] }[];
}

export const SCAN_FORMATS = [ScanFormat.ZKTECO, ScanFormat.HIP, ScanFormat.GENERIC] as const;

/** Header row of the downloadable generic template (FR-ATT-02.3). */
export const SCAN_GENERIC_TEMPLATE_COLUMNS = ['employee_code', 'date', 'time', 'type'] as const;

/** `accept` attribute for the scan file picker; the API checks the content, not the extension. */
export const SCAN_IMPORT_ACCEPT = '.dat,.txt,.csv,.xlsx,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ─────────────────────────── Date / time ───────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

const validDate = (y: number, m: number, d: number): string | null => {
  if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** `YYYY-MM-DD` / `YYYY/MM/DD` (year first) or `dd/MM/yyyy` / `dd-MM-yyyy` / `dd.MM.yyyy` (day first) → ISO date. */
export const parseScanDate = (text: string): string | null => {
  const s = text.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return validDate(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
};

/** `H:mm`, `HH:mm:ss`, optionally followed by AM/PM → `HH:mm:ss`. */
export const parseScanTime = (text: string): string | null => {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AaPp])\.?[Mm]\.?)?$/.exec(text.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] ? Number(m[3]) : 0;
  if (m[4]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[4].toLowerCase() === 'p' ? 12 : 0);
  }
  if (h > 23 || min > 59 || sec > 59) return null;
  return `${pad(h)}:${pad(min)}:${pad(sec)}`;
};

type DateTimeResult = { value: string } | { error: 'scan_invalid_date' | 'scan_invalid_time' };

const combine = (dateText: string, timeText: string): DateTimeResult => {
  const date = parseScanDate(dateText);
  if (!date) return { error: 'scan_invalid_date' };
  const time = parseScanTime(timeText);
  if (!time) return { error: 'scan_invalid_time' };
  return { value: `${date} ${time}` };
};

/** `<date> <time>` or `<date>T<time>` (any date form of `parseScanDate`, time with optional AM/PM). */
export const parseScanDateTime = (text: string): DateTimeResult => {
  const m = /^(\S+?)(?:T|\s+)(.+)$/.exec(text.trim());
  if (!m) return parseScanDate(text) ? { error: 'scan_invalid_time' } : { error: 'scan_invalid_date' };
  return combine(m[1]!, m[2]!.replace(/(?:Z|[+-]\d{2}:?\d{2})$/, ''));
};

// ─────────────────────────── IN / OUT ───────────────────────────

const KIND_WORDS: Record<string, PunchKind> = {
  in: 'IN', i: 'IN', cin: 'IN', checkin: 'IN', clockin: 'IN', ເຂົ້າ: 'IN',
  out: 'OUT', o: 'OUT', cout: 'OUT', checkout: 'OUT', clockout: 'OUT', ອອກ: 'OUT',
};
/** ZKTeco state codes: 0 check-in, 1 check-out; 2–5 (break, overtime) carry no IN/OUT meaning here. */
const ZK_STATE: Record<string, PunchKind> = { '0': 'IN', '1': 'OUT' };

const normWord = (v: string) => v.trim().toLowerCase().replace(/[\s/_.-]/g, '');

/**
 * `{ kind }` for a recognised value, `{ kind: null }` for blank (or, with `strict` off, an unknown state),
 * `{ error }` for an unknown non-blank value when `strict` (generic files must say IN or OUT).
 */
const readKind = (value: string | null | undefined, opts: { zkStates: boolean; strict: boolean }): { kind: PunchKind | null } | { error: 'scan_invalid_type' } => {
  const v = (value ?? '').trim();
  if (!v) return { kind: null };
  const k = KIND_WORDS[normWord(v)] ?? (opts.zkStates ? ZK_STATE[v] : undefined);
  if (k) return { kind: k };
  return opts.strict ? { error: 'scan_invalid_type' } : { kind: null };
};

// ─────────────────────────── Rows ───────────────────────────

/** Spreadsheet-formula prefixes are refused so a code never turns into a formula when exported again. */
const FORMULA_LIKE = /^[=+\-@]/;

const row = (rowNumber: number, code: string | null | undefined, dateTime: DateTimeResult, kind: ReturnType<typeof readKind>): ParsedScanRow => {
  const employeeCode = code?.trim() ? code.trim() : null;
  const base = { rowNumber, employeeCode, localDateTime: 'value' in dateTime ? dateTime.value : null, kind: 'kind' in kind ? kind.kind : null };
  if (!employeeCode || FORMULA_LIKE.test(employeeCode)) return { ...base, employeeCode: null, error: 'scan_missing_code' };
  if ('error' in dateTime) return { ...base, error: dateTime.error };
  if ('error' in kind) return { ...base, error: kind.error };
  return base;
};

const lines = (text: string) =>
  text
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .map((line, i) => ({ row: i + 1, line }))
    .filter((l) => l.line.trim() !== '');

/** Split one delimited line, honouring "quoted" fields with "" escapes. */
export const splitDelimitedLine = (line: string, sep: string): string[] => {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (ch === sep) {
      out.push(field.trim());
      field = '';
    } else field += ch;
  }
  out.push(field.trim());
  return out;
};

/** The most frequent of tab / semicolon / comma in a header line (comma on a tie). */
const detectSeparator = (line: string): string => {
  const count = (c: string) => line.split(c).length - 1;
  return ['\t', ';', ','].reduce((best, c) => (count(c) > count(best) ? c : best), ',');
};

/** A delimited text file as a sheet (first non-blank line = header). */
export const textToScanSheet = (text: string): ScanSheet | null => {
  const all = lines(text);
  if (!all.length) return null;
  const sep = detectSeparator(all[0]!.line);
  return {
    header: splitDelimitedLine(all[0]!.line, sep),
    rows: all.slice(1).map(({ row: r, line }) => ({ row: r, cells: splitDelimitedLine(line, sep).map((c) => c || null) })),
  };
};

// ─────────────────────────── Header-based sheets (ZKTime export, generic) ───────────────────────────

const normHeader = (v: string) => v.replace(/\*/g, '').trim().toLowerCase().replace(/[\s._\-/()]/g, '');

/** Header aliases per field, most specific first (AC-No. wins over No. in ZKTime exports). */
const HEADER_ALIASES = {
  code: ['employeecode', 'empcode', 'code', 'ລະຫັດພະນັກງານ', 'acno', 'enno', 'enrollno', 'enrollnumber', 'userid', 'empno', 'personid', 'no', 'id'],
  dateTime: ['datetime', 'timestamp', 'checktime', 'punchtime', 'ວັນທີເວລາ'],
  date: ['date', 'ວັນທີ'],
  time: ['time', 'ເວລາ'],
  kind: ['type', 'kind', 'inout', 'state', 'status', 'checktype', 'ປະເພດ'],
} as const;
type HeaderField = keyof typeof HEADER_ALIASES;

const mapHeader = (header: readonly (string | null)[]): Partial<Record<HeaderField, number>> => {
  const normalized = header.map((h) => (h ? normHeader(h) : ''));
  const index: Partial<Record<HeaderField, number>> = {};
  for (const field of Object.keys(HEADER_ALIASES) as HeaderField[]) {
    for (const alias of HEADER_ALIASES[field]) {
      const i = normalized.indexOf(alias);
      if (i >= 0) {
        index[field] = i;
        break;
      }
    }
  }
  return index;
};

/**
 * Rows of a header-based sheet: the ZKTime export (ZKTECO) or the generic template (GENERIC). A `Time` column
 * without a `Date` column is read as a full date-time (ZKTime "Time" holds both).
 */
export const parseScanSheet = (format: ScanFormat, sheet: ScanSheet): ScanParseResult => {
  const idx = mapHeader(sheet.header);
  const hasDateTime = idx.dateTime !== undefined || idx.time !== undefined;
  if (idx.code === undefined || !hasDateTime) return { ok: false, error: 'scan_missing_columns' };
  const generic = format === ScanFormat.GENERIC;
  const rows = sheet.rows
    .filter((r) => r.cells.some((c) => c !== null && c.trim() !== ''))
    .map(({ row: r, cells }) => {
      const cell = (i: number | undefined) => (i === undefined ? '' : (cells[i] ?? ''));
      const dateTime =
        idx.date !== undefined && idx.time !== undefined
          ? combine(cell(idx.date), cell(idx.time))
          : parseScanDateTime(cell(idx.dateTime ?? idx.time));
      return row(r, cell(idx.code), dateTime, readKind(cell(idx.kind), { zkStates: !generic, strict: generic }));
    });
  return rows.length ? { ok: true, rows } : { ok: false, error: 'scan_import_empty' };
};

// ─────────────────────────── Text formats ───────────────────────────

/** A first line that names columns (starts with a letter and mentions a date or time) rather than holding a scan. */
const looksLikeHeader = (line: string) => /^\W*[A-Za-z຀-໿]/.test(line) && /date|time|ວັນທີ|ເວລາ/i.test(line);

/** ZKTeco `attlog.dat`: `userId  date  time  verify  state  workcode …` (whitespace separated). */
const parseAttlog = (text: string): ParsedScanRow[] =>
  lines(text).map(({ row: r, line }) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) return { rowNumber: r, employeeCode: parts[0] ?? null, localDateTime: null, kind: null, error: 'scan_invalid_line' };
    return row(r, parts[0], combine(parts[1]!, parts[2]!), readKind(parts[4], { zkStates: true, strict: false }));
  });

/** HIP export: `code, date, time[, AM|PM][, …]` separated by comma, tab, semicolon or spaces; an optional header line. */
const parseHip = (text: string): ParsedScanRow[] => {
  const all = lines(text);
  if (all.length && looksLikeHeader(all[0]!.line)) all.shift();
  return all.map(({ row: r, line }) => {
    const parts = line.trim().split(/\s*[,;\t]\s*|\s+/).filter((p) => p !== '');
    if (parts.length < 3) return { rowNumber: r, employeeCode: parts[0] ?? null, localDateTime: null, kind: null, error: 'scan_invalid_line' };
    let time = parts[2]!;
    let rest = parts.slice(3);
    if (/^[AaPp]\.?[Mm]\.?$/.test(rest[0] ?? '')) {
      time = `${time} ${rest[0]}`;
      rest = rest.slice(1);
    }
    const kindToken = rest.find((p) => KIND_WORDS[normWord(p)]);
    return row(r, parts[0], combine(parts[1]!, time), readKind(kindToken, { zkStates: false, strict: false }));
  });
};

/** Parse a text upload (attlog.dat, ZKTime CSV, HIP text, generic CSV) of the given format. */
export const parseScanText = (format: ScanFormat, text: string): ScanParseResult => {
  const first = lines(text)[0];
  if (!first) return { ok: false, error: 'scan_import_empty' };
  if (format === ScanFormat.HIP) {
    const rows = parseHip(text);
    return rows.length ? { ok: true, rows } : { ok: false, error: 'scan_import_empty' };
  }
  if (format === ScanFormat.ZKTECO && !looksLikeHeader(first.line)) {
    return { ok: true, rows: parseAttlog(text) };
  }
  const sheet = textToScanSheet(text);
  return sheet ? parseScanSheet(format, sheet) : { ok: false, error: 'scan_import_empty' };
};
