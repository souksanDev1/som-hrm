import { ApiError, type EmployeeImportPreview } from '@hrm/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeeImport } from '@/features/employees/components/EmployeeImport';
import { ImportPreview } from '@/features/employees/components/ImportPreview';

const withErrors: EmployeeImportPreview = {
  rows: 3,
  errors: [
    { row: 1, column: 'Salary', code: 'unknown_column' },
    { row: 3, column: 'gender', code: 'invalid_option' },
    { row: 3, column: 'managerCode', code: 'unknown_reference' },
    { row: 4, column: null, code: 'seat_limit_reached' },
  ],
  sample: [
    { row: 2, values: { employeeCode: 'E-1', firstName: 'ສົມ', lastName: 'ດີ', hireDate: '2024-01-15' } },
    { row: 3, values: { employeeCode: 'E-2', firstName: 'ນາງ', department: 'Finance' } },
    { row: 4, values: { employeeCode: 'E-3' } },
  ],
  importToken: null,
  expiresAt: null,
};
const valid: EmployeeImportPreview = { ...withErrors, errors: [], importToken: 'tok', expiresAt: '2030-01-01T00:00:00.000Z' };

describe('ImportPreview', () => {
  it('lists every error with row number, column label and translated reason', () => {
    render(<ImportPreview preview={withErrors} />);
    expect(screen.getByRole('alert')).toHaveTextContent('ພົບ 3 ແຖວ');
    expect(screen.getByRole('alert')).toHaveTextContent('ພົບ 4 ຂໍ້ຜິດພາດ');
    const rows = within(screen.getByTestId('import-errors')).getAllByTestId('import-error');
    expect(rows.map((r) => Array.from(r.querySelectorAll('td')).map((c) => c.textContent))).toEqual([
      ['1', 'Salary', 'ບໍ່ຮູ້ຈັກຫົວຖັນນີ້'],
      ['3', 'ເພດ', 'ລະຫັດບໍ່ຖືກຕ້ອງ (ເບິ່ງລະຫັດທີ່ໃຊ້ໄດ້ໃນແບບຟອມ)'],
      ['3', 'ລະຫັດພະນັກງານຂອງຫົວໜ້າ', 'ບໍ່ພົບຂໍ້ມູນນີ້ໃນລະບົບ'],
      ['4', 'ທັງແຖວ', 'ຈຳນວນພະນັກງານເຕັມຕາມແພັກເກດແລ້ວ'],
    ]);
  });

  it('highlights sample rows that have errors and shows a dash for empty cells', () => {
    render(<ImportPreview preview={withErrors} />);
    const rows = screen.getAllByTestId('import-sample-row');
    expect(rows.map((r) => r.getAttribute('data-invalid'))).toEqual([null, 'true', 'true']);
    expect(rows[0]).toHaveTextContent('E-1');
    expect(rows[2]).toHaveTextContent('—');
  });

  it('shows a ready state without an errors table when the file is valid', () => {
    render(<ImportPreview preview={valid} />);
    expect(screen.getByRole('status')).toHaveTextContent('ທຸກແຖວຖືກຕ້ອງ');
    expect(screen.queryByTestId('import-errors')).toBeNull();
    expect(screen.getAllByTestId('import-sample-row').every((r) => !r.hasAttribute('data-invalid'))).toBe(true);
  });
});

const importHooks = vi.hoisted(() => {
  const mutation = () => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null as unknown,
    data: undefined as unknown,
    variables: undefined as unknown,
  });
  return { preview: mutation(), confirm: mutation(), template: mutation() };
});
vi.mock('@/features/employees/hooks', () => ({ useEmployeeImport: () => importHooks }));

describe('EmployeeImport flow', () => {
  beforeEach(() => {
    for (const m of Object.values(importHooks)) {
      m.mutate.mockReset();
      m.mutateAsync.mockReset().mockResolvedValue(undefined);
      m.error = null;
      m.data = undefined;
    }
  });

  it('downloads templates, previews the chosen file and confirms with its token', async () => {
    const { rerender } = render(<EmployeeImport />);
    await userEvent.click(screen.getByTestId('import-template-csv'));
    expect(importHooks.template.mutate).toHaveBeenCalledWith('csv');
    expect(screen.queryByTestId('import-confirm')).toBeNull();

    const file = new File(['code\nE-1'], 'staff.csv', { type: 'text/csv' });
    await userEvent.upload(screen.getByTestId('import-file'), file);
    expect(importHooks.preview.mutateAsync).toHaveBeenCalledWith(file);

    importHooks.preview.data = valid;
    rerender(<EmployeeImport />);
    await userEvent.click(screen.getByTestId('import-confirm'));
    await userEvent.click(screen.getByTestId('confirm-accept'));
    expect(importHooks.confirm.mutate).toHaveBeenCalledWith({ file, importToken: 'tok' }, expect.anything());

    importHooks.confirm.data = { created: 3 };
    rerender(<EmployeeImport />);
    expect(screen.getByTestId('import-done')).toHaveTextContent('ນຳເຂົ້າພະນັກງານສຳເລັດ 3 ຄົນ');
  });

  it('offers no confirm button while the preview has errors', () => {
    importHooks.preview.data = withErrors;
    render(<EmployeeImport />);
    expect(screen.getByTestId('import-errors')).toBeInTheDocument();
    expect(screen.queryByTestId('import-confirm')).toBeNull();
  });

  it('shows the rows rejected on confirm when the data changed since the preview', () => {
    importHooks.preview.data = valid;
    importHooks.confirm.error = new ApiError(400, 'import_invalid', 'x', { errors: [{ row: 2, column: 'employeeCode', code: 'employee_code_taken' }] });
    render(<EmployeeImport />);
    expect(screen.getByTestId('import-error')).toHaveTextContent('ລະຫັດພະນັກງານນີ້ຖືກໃຊ້ແລ້ວ');
    expect(screen.queryByTestId('import-confirm')).toBeNull();
  });
});
