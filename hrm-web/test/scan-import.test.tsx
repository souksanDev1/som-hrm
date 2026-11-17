import type { ScanImportPreview, ScanImportPreviewRow } from '@hrm/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ScanPreviewTable } from '@/features/scan-import/components/ScanPreviewTable';

const row = (rowNumber: number, over: Partial<ScanImportPreviewRow>): ScanImportPreviewRow => ({
  rowNumber,
  employeeCode: 'E1',
  employeeId: 'emp1',
  employeeName: 'ສົມ ດີ',
  localDateTime: '2026-11-16 08:00:00',
  workDate: '2026-11-16',
  kind: 'IN',
  kindInferred: false,
  status: 'OK',
  error: null,
  duplicateOfRow: null,
  ...over,
});

const preview: ScanImportPreview = {
  format: 'GENERIC',
  branchId: null,
  totalRows: 4,
  counts: { OK: 2, UNMATCHED: 1, DUPLICATE: 1, INVALID: 0 },
  rows: [
    row(2, { kindInferred: true }),
    row(3, { status: 'DUPLICATE', error: 'scan_duplicate_in_file', duplicateOfRow: 2, kind: null }),
    row(4, { employeeCode: 'NOPE', employeeId: null, employeeName: null, status: 'UNMATCHED', error: 'scan_employee_not_found', kind: null }),
    // A night-shift scan after midnight belongs to the previous work date.
    row(5, { localDateTime: '2026-11-17 05:58:00', workDate: '2026-11-16', kind: 'OUT' }),
  ],
  importToken: 'tok',
  expiresAt: '2030-01-01T00:00:00.000Z',
};

describe('ScanPreviewTable (FR-ATT-02.4/02.5)', () => {
  it('shows counts per status and filters the rows', async () => {
    render(<ScanPreviewTable preview={preview} />);
    expect(screen.getByTestId('scan-count-ALL')).toHaveTextContent('4');
    expect(screen.getByTestId('scan-count-OK')).toHaveTextContent('2');
    expect(screen.getByTestId('scan-count-INVALID')).toHaveTextContent('0');
    expect(screen.getAllByTestId('scan-row')).toHaveLength(4);

    await userEvent.click(screen.getByTestId('scan-filter-UNMATCHED'));
    const rows = screen.getAllByTestId('scan-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('NOPE');
    expect(within(rows[0]!).getByTestId('scan-row-reason')).toHaveTextContent('ບໍ່ພົບລະຫັດພະນັກງານນີ້');
    expect(screen.getByTestId('scan-filter-UNMATCHED')).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByTestId('scan-filter-INVALID'));
    expect(screen.queryAllByTestId('scan-row')).toHaveLength(0);
  });

  it('explains duplicates, inferred kinds and a different work date', () => {
    render(<ScanPreviewTable preview={preview} />);
    const [first, dup, , night] = screen.getAllByTestId('scan-row');
    expect(first).toHaveTextContent('ຄິດຈາກລຳດັບເວລາ');
    expect(dup).toHaveAttribute('data-status', 'DUPLICATE');
    expect(within(dup!).getByTestId('scan-row-reason')).toHaveTextContent('ຊ້ຳກັບແຖວ 2');
    expect(night).toHaveTextContent('ວັນເຮັດວຽກ 2026-11-16');
    expect(first).not.toHaveTextContent('ວັນເຮັດວຽກ');
  });
});
