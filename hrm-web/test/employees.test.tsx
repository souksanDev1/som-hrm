import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EmployeeSummary, EmploymentHistoryEntry, ExpiringDocument } from '@hrm/shared';
import { ConfirmDialog } from '@/components/ui';
import { EmergencyContactsCard } from '@/features/employees/components/EmergencyContactsCard';
import { EmployeeForm } from '@/features/employees/components/EmployeeForm';
import { ExpiringDocumentList } from '@/features/employees/components/ExpiringDocumentList';
import { EmployeeList } from '@/features/employees/components/EmployeeList';
import { LineManagerCard } from '@/features/employees/components/LineManagerCard';
import { HistoryCard } from '@/features/employees/components/HistoryCard';
import { toCreatePayload, toUpdatePayload, type EmployeeFormValues } from '@/features/employees/payload';

vi.mock('@/features/org/hooks', () => {
  const empty = { data: [] };
  return { useBranches: () => empty, useDepartments: () => ({ data: [{ id: 'd1', name: 'Ops' }] }), usePositions: () => empty };
});

const contactMutations = vi.hoisted(() => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false, error: null });
  return { add: mutation(), update: mutation(), remove: mutation() };
});
const historyPage = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('@/features/employees/hooks', () => ({
  useManagerOptions: () => ({ data: [{ value: 'm1', label: 'E001 · Boss' }] }),
  useEmergencyContacts: () => contactMutations,
  useEmployeeHistory: () => ({ data: historyPage.current, isPending: false, error: null, refetch: () => undefined }),
}));

const base: EmployeeFormValues = {
  employeeCode: 'E1',
  firstName: 'A',
  lastName: 'B',
  gender: 'MALE',
  hireDate: '2025-01-01',
  contractType: 'INDEFINITE',
  payType: 'MONTHLY',
  nationalityType: 'LAO',
  status: 'ACTIVE',
  email: 'a@x.la',
  phone: '02055551234',
  idCardNo: '',
};

describe('employee payload builders', () => {
  it('create: drops blanks and adds the login', () => {
    const p = toCreatePayload({ ...base, nickname: '', createLogin: true, loginMethod: 'PASSWORD' });
    expect(p).not.toHaveProperty('nickname');
    expect(p).not.toHaveProperty('idCardNo');
    expect(p.login).toEqual({ method: 'PASSWORD' });
    expect(p).not.toHaveProperty('createLogin');
  });

  it('edit: sends only changed fields and null for cleared ones', () => {
    expect(toUpdatePayload({ ...base, email: '' }, base)).toEqual({ email: null });
    expect(toUpdatePayload(base, base)).toEqual({});
  });

  it('edit: an untouched blank (e.g. masked identifier) is not sent, effective date rides along with a change', () => {
    expect(toUpdatePayload({ ...base, effectiveDate: '2026-02-01' }, base)).toEqual({});
    expect(toUpdatePayload({ ...base, status: 'RESIGNED', effectiveDate: '2026-02-01' }, base)).toEqual({
      status: 'RESIGNED',
      effectiveDate: '2026-02-01',
    });
  });

  it('edit: keeps nationality and its type together', () => {
    const foreign = { ...base, nationalityType: 'FOREIGN' as const, nationality: 'Thailand' };
    expect(toUpdatePayload({ ...foreign, nationality: '' }, foreign)).toEqual({ nationalityType: 'FOREIGN', nationality: null });
  });
});

describe('EmployeeForm (edit)', () => {
  it('submits null for a cleared field', async () => {
    const onSubmit = vi.fn();
    render(<EmployeeForm mode="edit" defaultValues={base} onSubmit={onSubmit} onCancel={() => undefined} />);
    await userEvent.clear(screen.getByLabelText(/ອີເມວ|Email/));
    fireEvent.submit(screen.getByTestId('employee-form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ email: null }));
  });

  it('shows a validation error instead of submitting an invalid phone', async () => {
    const onSubmit = vi.fn();
    render(<EmployeeForm mode="edit" defaultValues={base} onSubmit={onSubmit} onCancel={() => undefined} />);
    const phone = screen.getByLabelText(/ເບີໂທ|Phone/);
    await userEvent.clear(phone);
    await userEvent.type(phone, '123');
    fireEvent.submit(screen.getByTestId('employee-form'));
    await waitFor(() => expect(phone).toHaveAttribute('aria-invalid', 'true'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('EmployeeForm: M3 fields', () => {
  it('sends contract/pay type, the structured address and the manager; blanks are dropped on create', () => {
    const p = toCreatePayload({ ...base, contractType: 'FIXED_TERM', contractEndDate: '2026-12-31', province: 'LP', village: 'ວັດແສນ', firstNameEn: '', managerId: 'm1' });
    expect(p).toMatchObject({ contractType: 'FIXED_TERM', payType: 'MONTHLY', contractEndDate: '2026-12-31', province: 'LP', village: 'ວັດແສນ', managerId: 'm1' });
    expect(p).not.toHaveProperty('firstNameEn');
  });

  it('edit: clearing the manager or province sends null; changing pay type sends only that', () => {
    const before = { ...base, managerId: 'm1', province: 'VT' as const };
    expect(toUpdatePayload({ ...before, managerId: '', province: '' as never }, before)).toEqual({ managerId: null, isTopLevel: false, province: null });
    expect(toUpdatePayload({ ...before, payType: 'DAILY' }, before)).toEqual({ payType: 'DAILY' });
  });

  it('shows the end date that fits the contract type and the manager picker', async () => {
    render(<EmployeeForm mode="create" onSubmit={vi.fn()} onCancel={() => undefined} />);
    // New hires default to a probation contract.
    expect(screen.getByLabelText(/ວັນສິ້ນສຸດການທົດລອງວຽກ|Probation end date/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/ວັນສິ້ນສຸດສັນຍາ|Contract end date/)).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText(/ປະເພດສັນຍາ|Contract type/), 'FIXED_TERM');
    expect(screen.getByLabelText(/ວັນສິ້ນສຸດສັນຍາ|Contract end date/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'E001 · Boss' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'ຫຼວງພະບາງ' })).toBeInTheDocument();
  });

  it('flags an end date before the hire date', async () => {
    const onSubmit = vi.fn();
    render(<EmployeeForm mode="edit" defaultValues={{ ...base, contractType: 'FIXED_TERM', contractEndDate: '2024-01-01' }} onSubmit={onSubmit} onCancel={() => undefined} />);
    fireEvent.submit(screen.getByTestId('employee-form'));
    await waitFor(() => expect(screen.getByText('ວັນທີນີ້ຕ້ອງບໍ່ກ່ອນວັນເຂົ້າວຽກ')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires a contract end date for a new fixed-term contract but not for a legacy one left as it is', async () => {
    const onCreate = vi.fn();
    const { unmount } = render(<EmployeeForm mode="create" defaultValues={{ ...base, contractType: 'FIXED_TERM' }} onSubmit={onCreate} onCancel={() => undefined} />);
    fireEvent.submit(screen.getByTestId('employee-form'));
    await waitFor(() => expect(screen.getByText('ສັນຍາແບບມີກຳນົດເວລາ ຕ້ອງໃສ່ວັນໝົດສັນຍາ')).toBeInTheDocument());
    expect(onCreate).not.toHaveBeenCalled();
    unmount();

    const onEdit = vi.fn();
    render(<EmployeeForm mode="edit" defaultValues={{ ...base, contractType: 'FIXED_TERM', contractEndDate: '' }} onSubmit={onEdit} onCancel={() => undefined} />);
    await userEvent.type(screen.getByLabelText(/ຊື່ຫຼິ້ນ|Nickname/), 'Noy');
    fireEvent.submit(screen.getByTestId('employee-form'));
    await waitFor(() => expect(onEdit).toHaveBeenCalledWith({ nickname: 'Noy' }));
  });

  it('keeps showing a stored manager that is not among the loaded options', () => {
    render(
      <EmployeeForm mode="edit" defaultValues={{ ...base, managerId: 'far' }} currentManager={{ id: 'far', name: 'Far Away' }} onSubmit={vi.fn()} onCancel={() => undefined} />,
    );
    expect(document.getElementById('managerId')).toHaveValue('far');
  });
});

const DEPARTMENT_REQUIRED = 'ກະລຸນາເລືອກພະແນກ';
const MANAGER_REQUIRED = 'ກະລຸນາເລືອກຫົວໜ້າ ຫຼື ໝາຍວ່າເປັນຄົນເທິງສຸດ';
const submitForm = () => fireEvent.submit(screen.getByTestId('employee-form'));
const topLevelBox = () => screen.getByLabelText(/ບໍ່ມີຫົວໜ້າ|No line manager/);

describe('EmployeeForm: department and line manager', () => {
  it('create: requires a department, then a manager or the top-level box', async () => {
    const onSubmit = vi.fn();
    render(<EmployeeForm mode="create" defaultValues={base} onSubmit={onSubmit} onCancel={() => undefined} />);
    submitForm();
    await waitFor(() => expect(screen.getByText(DEPARTMENT_REQUIRED)).toBeInTheDocument());
    expect(screen.getByText(MANAGER_REQUIRED)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText(/ພະແນກ|Department/), 'd1');
    submitForm();
    await waitFor(() => expect(screen.queryByText(DEPARTMENT_REQUIRED)).toBeNull());
    expect(screen.getByText(MANAGER_REQUIRED)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('create: ticking top level disables and clears the manager, and submits without managerId', async () => {
    const onSubmit = vi.fn();
    render(<EmployeeForm mode="create" defaultValues={{ ...base, departmentId: 'd1', managerId: 'm1' }} onSubmit={onSubmit} onCancel={() => undefined} />);
    const manager = document.getElementById('managerId') as HTMLSelectElement;
    expect(manager).toHaveValue('m1');
    await userEvent.click(topLevelBox());
    expect(manager).toBeDisabled();
    expect(manager).toHaveValue('');
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.isTopLevel).toBe(true);
    expect(payload).not.toHaveProperty('managerId');
  });

  it('create: a manager and a department are enough', async () => {
    const onSubmit = vi.fn();
    render(<EmployeeForm mode="create" defaultValues={{ ...base, departmentId: 'd1', managerId: 'm1' }} onSubmit={onSubmit} onCancel={() => undefined} />);
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ departmentId: 'd1', managerId: 'm1', isTopLevel: false });
  });

  it('edit: a legacy employee gets a warning banner, and a status-only change still submits', async () => {
    const onSubmit = vi.fn();
    render(<EmployeeForm mode="edit" defaultValues={base} onSubmit={onSubmit} onCancel={() => undefined} />);
    expect(screen.getByTestId('assignment-incomplete-hint')).toHaveTextContent('ພະນັກງານນີ້ຍັງຂາດພະແນກ');
    await userEvent.selectOptions(screen.getByLabelText(/ສະຖານະ|Status/), 'RESIGNED');
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ status: 'RESIGNED' }));
    expect(screen.queryByText(DEPARTMENT_REQUIRED)).toBeNull();
  });

  it('edit: no banner for a complete employee; touching the assignment makes the rule apply', async () => {
    const onSubmit = vi.fn();
    const complete = { ...base, departmentId: 'd1', managerId: 'm1' };
    render(<EmployeeForm mode="edit" defaultValues={complete} onSubmit={onSubmit} onCancel={() => undefined} />);
    expect(screen.queryByTestId('assignment-incomplete-hint')).toBeNull();
    await userEvent.selectOptions(document.getElementById('managerId') as HTMLSelectElement, '');
    submitForm();
    await waitFor(() => expect(screen.getByText(MANAGER_REQUIRED)).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('edit: ticking top level on a managed employee sends the flag with a cleared manager', async () => {
    const onSubmit = vi.fn();
    render(<EmployeeForm mode="edit" defaultValues={{ ...base, departmentId: 'd1', managerId: 'm1' }} onSubmit={onSubmit} onCancel={() => undefined} />);
    await userEvent.click(topLevelBox());
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ isTopLevel: true, managerId: null }));
  });

  it('edit: giving a top-level employee a manager sends the manager and unticks top level', async () => {
    const onSubmit = vi.fn();
    render(<EmployeeForm mode="edit" defaultValues={{ ...base, departmentId: 'd1', isTopLevel: true }} onSubmit={onSubmit} onCancel={() => undefined} />);
    expect(screen.queryByTestId('assignment-incomplete-hint')).toBeNull();
    await userEvent.click(topLevelBox());
    await userEvent.selectOptions(document.getElementById('managerId') as HTMLSelectElement, 'm1');
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ managerId: 'm1', isTopLevel: false }));
  });
});

describe('employee payload: assignment pair', () => {
  it('edit: keeps isTopLevel and managerId together when either changed', () => {
    const before = { ...base, departmentId: 'd1', managerId: 'm1' };
    expect(toUpdatePayload({ ...before, managerId: 'm2' }, before)).toEqual({ managerId: 'm2', isTopLevel: false });
    expect(toUpdatePayload({ ...before, managerId: '', isTopLevel: true }, before)).toEqual({ managerId: null, isTopLevel: true });
    expect(toUpdatePayload({ ...before, nickname: 'x' }, before)).toEqual({ nickname: 'x' });
  });
});

describe('EmployeeList: incomplete assignment badge', () => {
  const row = (over: Partial<EmployeeSummary>): EmployeeSummary =>
    ({ id: 'x', employeeCode: 'E1', firstName: 'A', lastName: 'B', status: 'ACTIVE', nationalityType: 'LAO', assignmentIncomplete: false, ...over }) as EmployeeSummary;

  it('flags only active employees with an incomplete assignment', () => {
    render(
      <EmployeeList
        items={[
          row({ id: '1', employeeCode: 'E1', assignmentIncomplete: true }),
          row({ id: '2', employeeCode: 'E2' }),
          row({ id: '3', employeeCode: 'E3', assignmentIncomplete: true, status: 'RESIGNED' }),
          row({ id: '4', employeeCode: 'E4', assignmentIncomplete: true, status: 'TERMINATED' }),
        ]}
      />,
    );
    const rows = screen.getAllByTestId('employee-row');
    expect(within(rows[0]!).getByTestId('assignment-incomplete')).toHaveTextContent('ຂາດພະແນກ / ຫົວໜ້າ');
    for (const r of rows.slice(1)) expect(within(r).queryByTestId('assignment-incomplete')).toBeNull();
    const cards = screen.getAllByTestId('employee-card');
    expect(within(cards[0]!).getByTestId('assignment-incomplete')).toBeInTheDocument();
    expect(screen.getAllByTestId('assignment-incomplete')).toHaveLength(2);
  });
});

describe('LineManagerCard', () => {
  const dept = { id: 'd1', name: 'Ops' };
  it('shows the manager name and position', () => {
    render(<LineManagerCard manager={{ id: 'm1', name: 'ບົວພັນ ສີສຸວັນ', positionName: 'Lead' }} isTopLevel={false} department={dept} />);
    expect(screen.getByText('ບົວພັນ ສີສຸວັນ')).toBeInTheDocument();
    expect(screen.getByText('Lead')).toBeInTheDocument();
    expect(screen.getByText('Ops')).toBeInTheDocument();
  });
  it('shows the top-level text', () => {
    render(<LineManagerCard manager={null} isTopLevel department={dept} />);
    expect(screen.getByText('ຄົນເທິງສຸດ — ຄຳຂໍໄປຫາ HR')).toBeInTheDocument();
  });
  it('shows "not assigned" when there is neither', () => {
    render(<LineManagerCard manager={null} isTopLevel={false} department={null} />);
    expect(screen.getByText('ຍັງບໍ່ໄດ້ກຳນົດ, ກະລຸນາຕິດຕໍ່ HR')).toBeInTheDocument();
  });
});

describe('EmergencyContactsCard', () => {
  it('edits a contact through the PATCH mutation', async () => {
    render(<EmergencyContactsCard employeeId="e1" canEdit contacts={[{ id: 'c1', name: 'ນາງ ດາ', relationship: 'ແມ່', phone: '02055559191' }]} />);
    await userEvent.click(screen.getByTestId('edit-contact'));
    const relationship = screen.getByLabelText(/ຄວາມສຳພັນ|Relationship/);
    expect(relationship).toHaveValue('ແມ່');
    await userEvent.clear(relationship);
    await userEvent.type(relationship, 'ພໍ່');
    await userEvent.click(screen.getByTestId('save-contact'));
    await waitFor(() =>
      expect(contactMutations.update.mutateAsync).toHaveBeenCalledWith({ contactId: 'c1', body: { name: 'ນາງ ດາ', relationship: 'ພໍ່', phone: '02055559191' } }),
    );
    expect(contactMutations.add.mutateAsync).not.toHaveBeenCalled();
  });
});

describe('HistoryCard', () => {
  it('shows resolved names, translated contract/pay types and legacy employment types', () => {
    const entry = (over: Partial<EmploymentHistoryEntry>): EmploymentHistoryEntry => ({
      id: Math.random().toString(), changeType: 'UPDATED', fromValue: null, toValue: null, effectiveDate: '2025-03-01', note: null,
      createdAt: '2025-03-01T00:00:00Z', createdBy: null, labels: {}, ...over,
    });
    historyPage.current = {
      items: [
        entry({ fromValue: { positionId: null, managerId: 'm1' }, toValue: { positionId: 'p1', managerId: 'm2' }, labels: { p1: 'Lead', m1: 'Boss', m2: 'New Boss' } }),
        entry({ fromValue: { payType: 'MONTHLY' }, toValue: { payType: 'HOURLY' } }),
        entry({ effectiveDate: '2024-01-01', fromValue: { employmentType: 'FULL_TIME' }, toValue: { employmentType: 'CONTRACT' } }),
      ],
      total: 3, page: 1, pageSize: 10,
    };
    render(<HistoryCard employeeId="e1" />);
    const rows = screen.getAllByTestId('history-row');
    expect(rows[0]).toHaveTextContent('ຕຳແໜ່ງ: — → Lead');
    expect(rows[0]).toHaveTextContent('ຫົວໜ້າ: Boss → New Boss');
    expect(rows[1]).toHaveTextContent('ລາຍເດືອນ → ລາຍຊົ່ວໂມງ');
    expect(rows[2]).toHaveTextContent('ເຕັມເວລາ → ສັນຍາ');
  });
});

describe('ExpiringDocumentList', () => {
  it('links to the employee and shows expired documents in red', () => {
    const doc: ExpiringDocument = {
      id: 'd1', type: 'RESIDENCE_PERMIT', number: 'RP-1', expiresAt: '2026-11-01', expiryStatus: 'EXPIRED', daysUntilExpiry: -15, expiryThresholdDays: null,
      employee: { id: 'e9', employeeCode: 'E009', firstName: 'Nguyen', lastName: 'An', firstNameEn: null, lastNameEn: null, branch: { id: 'b1', name: 'Pakse' } },
    };
    render(<ExpiringDocumentList items={[doc]} />);
    const row = screen.getByTestId('expiring-row');
    expect(row).toHaveTextContent('ໃບອະນຸຍາດພັກເຊົາ');
    expect(row.querySelector('a')).toHaveAttribute('href', '/employees/e9');
    expect(row.querySelector('[data-expiry="EXPIRED"]')!.parentElement!.className).toMatch(/text-danger/);
  });
});

describe('ConfirmDialog', () => {
  it('calls onConfirm / onCancel and blocks while loading', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog open title="Delete" message="Sure?" confirmLabel="Delete" tone="danger" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    expect(screen.getByText('Sure?')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-accept'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('confirm-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('confirm-accept').className).toMatch(/bg-danger/);

    rerender(<ConfirmDialog open loading title="Delete" message="Sure?" confirmLabel="Delete" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByTestId('confirm-accept')).toBeDisabled();
    expect(screen.getByTestId('confirm-cancel')).toBeDisabled();
  });

  it('renders nothing inside the dialog when closed, and gives each dialog its own title id', () => {
    render(
      <>
        <ConfirmDialog open title="One" message="m1" confirmLabel="OK" onConfirm={() => undefined} onCancel={() => undefined} />
        <ConfirmDialog open title="Two" message="m2" confirmLabel="OK" onConfirm={() => undefined} onCancel={() => undefined} />
        <ConfirmDialog open={false} title="Three" message="m3" confirmLabel="OK" onConfirm={() => undefined} onCancel={() => undefined} />
      </>,
    );
    const ids = [...document.querySelectorAll('dialog')].map((d) => d.getAttribute('aria-labelledby'));
    expect(new Set(ids).size).toBe(3);
    expect(screen.queryByText('m3')).toBeNull();
  });
});
