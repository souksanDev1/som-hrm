import { PERMISSIONS, type LeaveBalance, type LeaveLedgerEntry, type LeaveType } from '@hrm/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { visibleNav } from '@/components/layout/nav';
import { LeaveAdjustForm } from '@/features/leave-policy/components/LeaveAdjustForm';
import { LeaveBalanceTable } from '@/features/leave-policy/components/LeaveBalanceTable';
import { LeaveLedgerTable } from '@/features/leave-policy/components/LeaveLedgerTable';
import { LeaveTypeForm } from '@/features/leave-policy/components/LeaveTypeForm';
import { LeaveTypeList } from '@/features/leave-policy/components/LeaveTypeList';
import { parseLeaveTypeForm, emptyLeaveTypeValues } from '@/features/leave-policy/form';
import { ApiError } from '@/lib/api-client';

const annual = (over: Partial<LeaveType> = {}): LeaveType => ({
  id: 'lt1', code: 'ANNUAL', category: 'ANNUAL', nameLo: 'ລາພັກປະຈຳປີ', nameEn: 'Annual leave', paid: true, requiresAttachment: false,
  allowHalfDay: true, gender: null, isActive: true, countingMethod: 'WORKING_DAYS', quotaPeriod: 'YEARLY', isCustom: false, sortOrder: 0,
  policy: { daysPerYear: 15, hazardousDays: 18, multipleBirthDays: null, minServiceDays: 365, minServicePayTypes: [] },
  legalMin: { days: 15, hazardousDays: 18 },
  ...over,
});
const custom = annual({ id: 'lt9', code: 'STUDY', category: 'OTHER', nameLo: 'ລາຮຽນ', nameEn: 'Study', isCustom: true, legalMin: null, policy: { daysPerYear: 5, hazardousDays: null, multipleBirthDays: null, minServiceDays: 0, minServicePayTypes: [] } });

describe('LeaveTypeList (FR-LV-01/02)', () => {
  it('shows days, quota, legal minimum and statutory/custom badges and opens the editor', async () => {
    const onEdit = vi.fn();
    render(<LeaveTypeList types={[annual(), custom]} onEdit={onEdit} />);
    const rows = screen.getAllByTestId('leave-type-row');
    expect(rows[0]).toHaveTextContent('ລາພັກປະຈຳປີ');
    expect(rows[0]).toHaveTextContent('ຕາມກົດໝາຍ');
    expect(within(rows[0]!).getByTestId('leave-legal-min')).toHaveTextContent('ຂັ້ນຕ່ຳຕາມກົດໝາຍ: 15 ມື້ · ວຽກອັນຕະລາຍ: 18 ມື້');
    expect(within(rows[0]!).getByTestId('leave-type-quota')).toHaveTextContent('15 ມື້ ຕໍ່ປີ');
    expect(rows[1]).toHaveTextContent('ກຳນົດເອງ');
    expect(within(rows[1]!).queryByTestId('leave-legal-min')).toBeNull();
    await userEvent.click(within(rows[1]!).getByTestId('leave-type-edit'));
    expect(onEdit).toHaveBeenCalledWith(custom);
  });
});

describe('LeaveTypeForm', () => {
  it('locks statutory fields, shows the legal minimum and the API below-minimum error on the field', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, 'below_legal_minimum', 'x', { field: 'daysPerYear', legalMin: 15 }));
    render(<LeaveTypeForm mode="edit" type={annual()} onSubmit={onSubmit} />);
    expect(screen.getByTestId('leave-legal-min')).toHaveTextContent('15');
    expect(screen.getByTestId('leave-type-locked')).toBeInTheDocument();
    expect(screen.getByLabelText('ໂຄຕ້າ')).toBeDisabled();
    expect(screen.getByLabelText('ວິທີນັບມື້')).toBeDisabled();
    expect(screen.getByLabelText('ລະຫັດ')).toBeDisabled();

    const days = screen.getByLabelText(/^ຈຳນວນມື້/);
    await userEvent.clear(days);
    await userEvent.type(days, '14');
    await userEvent.click(screen.getByTestId('leave-type-submit'));
    expect(onSubmit).toHaveBeenCalledWith({
      nameLo: 'ລາພັກປະຈຳປີ', nameEn: 'Annual leave', paid: true, requiresAttachment: false, allowHalfDay: true, isActive: true,
      policy: { daysPerYear: 14, hazardousDays: 18, multipleBirthDays: null, minServiceDays: 365, minServicePayTypes: [] },
    });
    expect(await screen.findByText('ຈຳນວນມື້ ຕ້ອງບໍ່ຕ່ຳກວ່າ 15 ມື້ ຕາມກົດໝາຍແຮງງານ')).toBeInTheDocument();
    expect(screen.getByTestId('leave-type-form-error')).toHaveTextContent('ຄ່າຕ່ຳກວ່າຂັ້ນຕ່ຳທີ່ກົດໝາຍແຮງງານກຳນົດ');
  });

  it('creates a custom type with code, quota, counting and pay types', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<LeaveTypeForm mode="create" onSubmit={onSubmit} />);
    await userEvent.click(screen.getByTestId('leave-type-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);

    await userEvent.type(screen.getByLabelText(/^ລະຫັດ/), 'study');
    await userEvent.type(screen.getByLabelText(/ຊື່ \(ລາວ\)/), 'ລາຮຽນ');
    await userEvent.type(screen.getByLabelText(/ຊື່ \(ອັງກິດ\)/), 'Study');
    await userEvent.selectOptions(screen.getByLabelText('ໂຄຕ້າ'), 'PER_EVENT');
    await userEvent.type(screen.getByLabelText(/^ຈຳນວນມື້/), '2.5');
    await userEvent.click(screen.getByLabelText('ລາຍວັນ'));
    await userEvent.click(screen.getByLabelText('ໄດ້ຮັບເງິນເດືອນ'));
    await userEvent.click(screen.getByTestId('leave-type-submit'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'STUDY', nameLo: 'ລາຮຽນ', nameEn: 'Study', quotaPeriod: 'PER_EVENT', countingMethod: 'WORKING_DAYS', gender: null, paid: false,
        policy: { daysPerYear: 2.5, hazardousDays: null, multipleBirthDays: null, minServiceDays: 0, minServicePayTypes: ['DAILY'] },
      }),
    );
  });

  it('parses half-day steps only', () => {
    const r = parseLeaveTypeForm({ ...emptyLeaveTypeValues(), code: 'AB', nameLo: 'a', nameEn: 'b', daysPerYear: '1.3' }, 'create');
    expect(r).toEqual({ ok: false, errors: { daysPerYear: 'leave_days_half_step' } });
  });
});

const balance = (over: Partial<LeaveBalance> = {}): LeaveBalance => ({
  leaveTypeId: 'lt1', year: 2030, quotaPeriod: 'YEARLY', entitled: 15, carried: 2, used: 3, adjusted: -0.5, expired: 0, balance: 13.5, pending: 1, ...over,
});
const entry = (over: Partial<LeaveLedgerEntry> = {}): LeaveLedgerEntry => ({
  id: 'l1', employeeId: 'e1', leaveTypeId: 'lt1', periodYear: 2030, kind: 'ENTITLEMENT', days: 15, effectiveDate: '2030-01-01',
  leaveRequestId: null, reason: null, createdByName: null, createdAt: '2030-01-01T00:00:00.000Z', ...over,
});

describe('LeaveBalanceTable and LeaveLedgerTable (FR-LV-07)', () => {
  it('shows the API balances per type and every movement with who posted it', () => {
    render(<LeaveBalanceTable balances={[balance()]} types={[annual()]} />);
    const row = screen.getByTestId('leave-balance-row');
    expect(row).toHaveTextContent('ລາພັກປະຈຳປີ');
    expect(row).toHaveTextContent('13.5');
    expect(row).toHaveTextContent('-0.5');
  });

  it('lists ledger rows: system grants and HR adjustments with reason', () => {
    render(<LeaveLedgerTable entries={[entry({ id: 'l2', kind: 'ADJUST', days: -0.5, reason: 'Late note', createdByName: 'HR Admin' }), entry()]} types={[annual()]} />);
    const rows = screen.getAllByTestId('leave-ledger-row');
    expect(rows[0]).toHaveTextContent('HR ປັບ');
    expect(rows[0]).toHaveTextContent('-0.5');
    expect(rows[0]).toHaveTextContent('Late note');
    expect(rows[0]).toHaveTextContent('HR Admin');
    expect(rows[1]).toHaveTextContent('+15');
    expect(rows[1]).toHaveTextContent('ລະບົບ');
  });

  it('shows an empty state', () => {
    render(<LeaveLedgerTable entries={[]} types={[]} />);
    expect(screen.getByTestId('leave-ledger-empty')).toBeInTheDocument();
  });
});

describe('LeaveAdjustForm (FR-LV-07.2)', () => {
  it('requires a type, non-zero half-step days and a reason, then posts the adjustment', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<LeaveAdjustForm employeeId="e1" year={2030} types={[annual()]} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByTestId('leave-adjust-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.selectOptions(screen.getByLabelText(/^ປະເພດ/), 'lt1');
    await userEvent.type(screen.getByLabelText(/^ຈຳນວນມື້/), '0');
    await userEvent.type(screen.getByLabelText(/^ເຫດຜົນ/), 'Late sick note');
    await userEvent.click(screen.getByTestId('leave-adjust-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('ຈຳນວນມື້ຕ້ອງເປັນທະວີຄູນຂອງ 0.5')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/^ຈຳນວນມື້/));
    await userEvent.type(screen.getByLabelText(/^ຈຳນວນມື້/), '-1.5');
    await userEvent.click(screen.getByTestId('leave-adjust-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ employeeId: 'e1', leaveTypeId: 'lt1', periodYear: 2030, days: -1.5, reason: 'Late sick note' });
    expect(await screen.findByTestId('leave-adjust-done')).toBeInTheDocument();
  });

  it('shows API errors', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(403, 'forbidden', 'x'));
    render(<LeaveAdjustForm employeeId="e1" year={2030} types={[annual()]} onSubmit={onSubmit} />);
    await userEvent.selectOptions(screen.getByLabelText(/^ປະເພດ/), 'lt1');
    await userEvent.type(screen.getByLabelText(/^ຈຳນວນມື້/), '1');
    await userEvent.type(screen.getByLabelText(/^ເຫດຜົນ/), 'x');
    await userEvent.click(screen.getByTestId('leave-adjust-submit'));
    expect(await screen.findByTestId('leave-adjust-error')).toBeInTheDocument();
  });
});

describe('nav', () => {
  it('shows leave settings and ledger to HR only', () => {
    expect(visibleNav([PERMISSIONS.LEAVE_MANAGE]).map((i) => i.href)).toEqual(expect.arrayContaining(['/settings/leave-types', '/leave/ledger']));
    expect(visibleNav([]).map((i) => i.href)).not.toContain('/leave/ledger');
  });
});
