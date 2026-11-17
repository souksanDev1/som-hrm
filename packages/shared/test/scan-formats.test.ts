import { describe, expect, it } from 'vitest';
import { parseScanDate, parseScanDateTime, parseScanSheet, parseScanText, parseScanTime, splitDelimitedLine, type ScanParseResult } from '../src';

const rowsOf = (r: ScanParseResult) => {
  if (!r.ok) throw new Error(`expected rows, got ${r.error}`);
  return r.rows;
};

describe('date / time helpers', () => {
  it('reads year-first and day-first dates and rejects impossible ones', () => {
    expect(parseScanDate('2026-11-17')).toBe('2026-11-17');
    expect(parseScanDate('2026/1/5')).toBe('2026-01-05');
    expect(parseScanDate('17/11/2026')).toBe('2026-11-17');
    expect(parseScanDate('05.01.2026')).toBe('2026-01-05');
    expect(parseScanDate('31/02/2026')).toBeNull();
    expect(parseScanDate('2026-13-01')).toBeNull();
    expect(parseScanDate('17/11/26')).toBeNull();
  });
  it('reads 24 h and AM/PM times', () => {
    expect(parseScanTime('8:05')).toBe('08:05:00');
    expect(parseScanTime('17:30:59')).toBe('17:30:59');
    expect(parseScanTime('12:15 AM')).toBe('00:15:00');
    expect(parseScanTime('1:00 pm')).toBe('13:00:00');
    expect(parseScanTime('24:00')).toBeNull();
    expect(parseScanTime('08:60')).toBeNull();
    expect(parseScanTime('13:00 PM')).toBeNull();
  });
  it('reads combined date-times', () => {
    expect(parseScanDateTime('2026-11-17 08:01:22')).toEqual({ value: '2026-11-17 08:01:22' });
    expect(parseScanDateTime('2026-11-17T08:01:22+07:00')).toEqual({ value: '2026-11-17 08:01:22' });
    expect(parseScanDateTime('17/11/2026 5:02 PM')).toEqual({ value: '2026-11-17 17:02:00' });
    expect(parseScanDateTime('2026-11-17')).toEqual({ error: 'scan_invalid_time' });
    expect(parseScanDateTime('yesterday 08:00')).toEqual({ error: 'scan_invalid_date' });
  });
  it('splits quoted delimited lines', () => {
    expect(splitDelimitedLine('a,"b, c","d ""e"""', ',')).toEqual(['a', 'b, c', 'd "e"']);
    expect(splitDelimitedLine('1\t2', '\t')).toEqual(['1', '2']);
  });
});

describe('ZKTeco (FR-ATT-02.1)', () => {
  it('parses attlog.dat lines with state 0 = IN, 1 = OUT, other states = unknown', () => {
    const text = ['     1\t2026-11-17 08:01:22\t1\t0\t1\t0', '1\t2026-11-17 17:05:00\t1\t1\t1\t0', '  23  2026-11-17 12:00:00  15  2  0  0', '7 2026-11-17 09:00:00'].join('\r\n');
    expect(rowsOf(parseScanText('ZKTECO', text))).toEqual([
      { rowNumber: 1, employeeCode: '1', localDateTime: '2026-11-17 08:01:22', kind: 'IN' },
      { rowNumber: 2, employeeCode: '1', localDateTime: '2026-11-17 17:05:00', kind: 'OUT' },
      { rowNumber: 3, employeeCode: '23', localDateTime: '2026-11-17 12:00:00', kind: null },
      { rowNumber: 4, employeeCode: '7', localDateTime: '2026-11-17 09:00:00', kind: null },
    ]);
  });
  it('flags bad attlog lines and keeps their row numbers', () => {
    const rows = rowsOf(parseScanText('ZKTECO', '1 2026-11-17 08:00:00 1 0\n\n2 garbage\n3 2026-02-30 08:00:00 1 0\n4 2026-11-17 25:00:00 1 0'));
    expect(rows.map((r) => [r.rowNumber, r.error])).toEqual([
      [1, undefined],
      [3, 'scan_invalid_line'],
      [4, 'scan_invalid_date'],
      [5, 'scan_invalid_time'],
    ]);
  });
  it('parses the ZKTime CSV export (AC-No. preferred over No., Date/Time, State)', () => {
    const text = ['No.,AC-No.,Name,Date/Time,State', '1,E001,Somchai,17/11/2026 08:03:00,C/In', '2,E001,Somchai,17/11/2026 05:01 PM,C/Out', '3,E002,Noy,17/11/2026 08:10,OverTime In'].join('\n');
    expect(rowsOf(parseScanText('ZKTECO', text))).toEqual([
      { rowNumber: 2, employeeCode: 'E001', localDateTime: '2026-11-17 08:03:00', kind: 'IN' },
      { rowNumber: 3, employeeCode: 'E001', localDateTime: '2026-11-17 17:01:00', kind: 'OUT' },
      { rowNumber: 4, employeeCode: 'E002', localDateTime: '2026-11-17 08:10:00', kind: null },
    ]);
  });
  it('reads a ZKTime export sheet with separate Date and Time columns', () => {
    const r = parseScanSheet('ZKTECO', { header: ['AC-No.', 'Date', 'Time'], rows: [{ row: 2, cells: ['15', '2026-11-17', '07:59:59'] }] });
    expect(rowsOf(r)).toEqual([{ rowNumber: 2, employeeCode: '15', localDateTime: '2026-11-17 07:59:59', kind: null }]);
  });
});

describe('HIP (FR-ATT-02.2)', () => {
  it('accepts comma, tab, semicolon and space separators, seconds optional, AM/PM and IN/OUT words', () => {
    const text = ['Code,Date,Time', 'E001,17/11/2026,08:00', 'E001\t17/11/2026\t17:00:30\tOUT', 'E002; 17/11/2026; 8:15; AM; In', 'E003 17/11/2026 09:00'].join('\n');
    expect(rowsOf(parseScanText('HIP', text))).toEqual([
      { rowNumber: 2, employeeCode: 'E001', localDateTime: '2026-11-17 08:00:00', kind: null },
      { rowNumber: 3, employeeCode: 'E001', localDateTime: '2026-11-17 17:00:30', kind: 'OUT' },
      { rowNumber: 4, employeeCode: 'E002', localDateTime: '2026-11-17 08:15:00', kind: 'IN' },
      { rowNumber: 5, employeeCode: 'E003', localDateTime: '2026-11-17 09:00:00', kind: null },
    ]);
  });
  it('flags short lines and bad dates', () => {
    const rows = rowsOf(parseScanText('HIP', 'E001,17/11/2026\nE002,31/11/2026,08:00\n=cmd,17/11/2026,08:00'));
    expect(rows.map((r) => r.error)).toEqual(['scan_invalid_line', 'scan_invalid_date', 'scan_missing_code']);
  });
});

describe('GENERIC (FR-ATT-02.3)', () => {
  it('reads the template columns with both date forms and optional type', () => {
    const text = ['employee_code,date,time,type', 'E001,2026-11-17,08:00,IN', 'E001,17/11/2026,17:01:05,out', 'E002,2026-11-17,08:30,'].join('\n');
    expect(rowsOf(parseScanText('GENERIC', text))).toEqual([
      { rowNumber: 2, employeeCode: 'E001', localDateTime: '2026-11-17 08:00:00', kind: 'IN' },
      { rowNumber: 3, employeeCode: 'E001', localDateTime: '2026-11-17 17:01:05', kind: 'OUT' },
      { rowNumber: 4, employeeCode: 'E002', localDateTime: '2026-11-17 08:30:00', kind: null },
    ]);
  });
  it('accepts a single datetime column and semicolon separators', () => {
    expect(rowsOf(parseScanText('GENERIC', 'employee_code;datetime\nE9;2026-11-17 06:00'))).toEqual([
      { rowNumber: 2, employeeCode: 'E9', localDateTime: '2026-11-17 06:00:00', kind: null },
    ]);
  });
  it('rejects unknown types (generic files must say IN or OUT) and missing codes', () => {
    const rows = rowsOf(parseScanText('GENERIC', 'employee_code,date,time,type\nE1,2026-11-17,08:00,BREAK\n,2026-11-17,08:00,IN\nE1,2026-11-17,8h,IN'));
    expect(rows.map((r) => r.error)).toEqual(['scan_invalid_type', 'scan_missing_code', 'scan_invalid_time']);
  });
  it('rejects files without the required columns or without rows', () => {
    expect(parseScanText('GENERIC', 'name,date\nX,2026-11-17')).toEqual({ ok: false, error: 'scan_missing_columns' });
    expect(parseScanText('GENERIC', 'employee_code,date,time\n')).toEqual({ ok: false, error: 'scan_import_empty' });
    expect(parseScanText('ZKTECO', '\n  \n')).toEqual({ ok: false, error: 'scan_import_empty' });
  });
});
