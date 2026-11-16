import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/ui';
import { EmployeeForm } from '@/features/employees/components/EmployeeForm';
import { toCreatePayload, toUpdatePayload, type EmployeeFormValues } from '@/features/employees/payload';

vi.mock('@/features/org/hooks', () => {
  const empty = { data: [] };
  return { useBranches: () => empty, useDepartments: () => empty, usePositions: () => empty };
});

const base: EmployeeFormValues = {
  employeeCode: 'E1',
  firstName: 'A',
  lastName: 'B',
  gender: 'MALE',
  hireDate: '2025-01-01',
  employmentType: 'FULL_TIME',
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
