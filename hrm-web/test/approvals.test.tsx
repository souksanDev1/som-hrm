import type { ApprovalInboxItem, ApprovalStep, DelegateCandidate, Delegation } from '@hrm/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalInbox } from '@/features/approvals/components/ApprovalInbox';
import { DecisionForm } from '@/features/approvals/components/DecisionForm';
import { DelegationForm } from '@/features/approvals/components/DelegationForm';
import { StepHistory } from '@/features/approvals/components/StepHistory';
import { resolveWebLink } from '@/features/notifications/links';
import { ApiError } from '@/lib/api-client';

const manager = { userId: 'u-mgr', name: 'Somsak' };
const hr = { userId: 'u-hr', name: 'Noy' };

const step = (over: Partial<ApprovalStep> = {}): ApprovalStep => ({
  id: 's1',
  level: 1,
  approver: manager,
  delegate: null,
  actingAs: 'MANAGER',
  decision: 'PENDING',
  decidedBy: null,
  decidedAt: null,
  note: null,
  createdAt: '2026-11-16T03:00:00.000Z',
  ...over,
});

const candidates: DelegateCandidate[] = [
  { userId: 'u-1', name: 'Kham', employeeCode: 'E010', isManager: false },
  { userId: 'u-2', name: 'Vong', employeeCode: 'E011', isManager: true },
];

describe('DecisionForm', () => {
  it('requires a reason before rejecting', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    render(<DecisionForm onDecide={onDecide} />);
    await userEvent.click(screen.getByTestId('approval-reject'));
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByText('ເຫດຜົນທີ່ປະຕິເສດ')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/ໝາຍເຫດ/), '  overlaps audit week ');
    await userEvent.click(screen.getByTestId('approval-reject'));
    expect(onDecide).toHaveBeenCalledWith('reject', 'overlaps audit week');
  });

  it('approves without a note and shows a lost race as a translated error', async () => {
    const onDecide = vi.fn().mockRejectedValue(new ApiError(409, 'approval_already_decided', 'x'));
    render(<DecisionForm onDecide={onDecide} />);
    await userEvent.click(screen.getByTestId('approval-approve'));
    expect(onDecide).toHaveBeenCalledWith('approve', '');
    expect(await screen.findByTestId('decision-error')).toHaveTextContent('ຄຳຂໍນີ້ຖືກຕັດສິນແລ້ວ');
  });
});

describe('StepHistory', () => {
  it('shows each level with its decision, capacity, delegate and HR pool', () => {
    render(
      <StepHistory
        requiredLevels={2}
        steps={[
          step({ decision: 'ESCALATED', decidedAt: '2026-11-19T00:00:00.000Z' }),
          step({ id: 's2', delegate: hr, actingAs: 'DELEGATE', decision: 'APPROVED', decidedBy: hr, decidedAt: '2026-11-20T01:00:00.000Z', note: 'ok' }),
          step({ id: 's3', level: 2, approver: null, actingAs: 'HR' }),
        ]}
      />,
    );
    const rows = screen.getAllByTestId('approval-step');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('ຂັ້ນ 1/2');
    expect(rows[0]).toHaveTextContent('ສົ່ງຕໍ່ຂັ້ນເທິງ');
    expect(within(rows[0]!).getByTestId('approval-step-meta')).toHaveTextContent('2026-11-19');
    expect(rows[1]).toHaveTextContent('ຜູ້ແທນ: Noy');
    expect(within(rows[1]!).getByTestId('approval-step-meta')).toHaveTextContent('Noy · ຜູ້ອະນຸມັດແທນ · 2026-11-20');
    expect(rows[1]).toHaveTextContent('“ok”');
    expect(rows[2]).toHaveTextContent('HR (ຜູ້ອະນຸມັດສຳຮອງ)');
    expect(within(rows[2]!).getByTestId('approval-step-meta')).toHaveTextContent('ລໍຖ້າແຕ່ 2026-11-16');
  });
});

describe('ApprovalInbox', () => {
  it('lists the requester, summary, level and capacity with a link to the detail', () => {
    const item: ApprovalInboxItem = {
      id: 'req-1',
      subjectType: 'LEAVE',
      requester: { employeeId: 'e3', employeeCode: 'E003', name: 'Phet' },
      summary: { title: 'ລາພັກປະຈຳປີ · 2 ມື້', detail: '2026-12-01 – 2026-12-02' },
      link: '/approvals/req-1',
      level: 1,
      requiredLevels: 1,
      myCapacity: 'DELEGATE',
      submittedAt: '2026-11-15T00:00:00.000Z',
      pendingSince: '2026-11-15T00:00:00.000Z',
    };
    render(<ApprovalInbox items={[item]} />);
    const row = screen.getByTestId('approval-row');
    expect(row).toHaveTextContent('Phet');
    expect(row).toHaveTextContent('ລາພັກ · ລາພັກປະຈຳປີ · 2 ມື້');
    expect(row).toHaveTextContent('ຂັ້ນ 1/1');
    expect(row).toHaveTextContent('ຜູ້ອະນຸມັດແທນ');
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/approvals/req-1');
  });

  it('lets notification links open approval requests', () => {
    expect(resolveWebLink('/approvals/req-1')).toBe('/approvals/req-1');
  });
});

describe('DelegationForm', () => {
  it('validates dates before calling the API and submits the chosen delegate', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<DelegationForm candidates={candidates} today="2026-11-17" onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.click(screen.getByTestId('delegation-save'));
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText(/ຜູ້ອະນຸມັດແທນ/), 'u-1');
    await userEvent.clear(screen.getByLabelText(/ແຕ່ວັນທີ/));
    await userEvent.type(screen.getByLabelText(/ແຕ່ວັນທີ/), '2026-11-20');
    await userEvent.clear(screen.getByLabelText(/ຮອດວັນທີ/));
    await userEvent.type(screen.getByLabelText(/ຮອດວັນທີ/), '2026-11-18');
    await userEvent.click(screen.getByTestId('delegation-save'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('ວັນສິ້ນສຸດຕ້ອງບໍ່ກ່ອນວັນເລີ່ມ')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/ຮອດວັນທີ/));
    await userEvent.type(screen.getByLabelText(/ຮອດວັນທີ/), '2026-11-25');
    await userEvent.type(screen.getByLabelText(/ເຫດຜົນ/), 'Training');
    await userEvent.click(screen.getByTestId('delegation-save'));
    expect(onSubmit).toHaveBeenCalledWith({ delegateUserId: 'u-1', startDate: '2026-11-20', endDate: '2026-11-25', reason: 'Training' });
  });

  it('shows an API overlap error and keeps the delegator fixed when editing', async () => {
    const existing: Delegation = {
      id: 'd1',
      delegator: manager,
      delegate: { userId: 'u-2', name: 'Vong' },
      startDate: '2026-11-17',
      endDate: '2026-11-30',
      reason: null,
      status: 'ACTIVE',
      createdAt: '2026-11-10T00:00:00.000Z',
    };
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(409, 'delegation_overlap', 'x'));
    render(<DelegationForm candidates={candidates} today="2026-11-17" initial={existing} canPickDelegator onSubmit={onSubmit} onCancel={() => {}} />);
    expect(screen.queryByLabelText(/ຫົວໜ້າທີ່ມອບສິດ/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/ຜູ້ອະນຸມັດແທນ/)).toHaveValue('u-2');
    await userEvent.click(screen.getByTestId('delegation-save'));
    expect(await screen.findByTestId('delegation-error')).toHaveTextContent('ຊ່ວງວັນທີຊ້ອນກັບການມອບສິດທີ່ມີຢູ່ແລ້ວ');
  });

  it('lets HR appoint for another manager but not to themselves', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<DelegationForm candidates={candidates} today="2026-11-17" canPickDelegator onSubmit={onSubmit} onCancel={() => {}} />);
    const delegator = screen.getByLabelText(/ຫົວໜ້າທີ່ມອບສິດ/);
    expect(within(delegator).getAllByRole('option').map((o) => o.textContent)).toEqual(['ຂ້ອຍ', 'Vong · E011']);
    await userEvent.selectOptions(delegator, 'u-2');
    await userEvent.selectOptions(screen.getByLabelText(/^ຜູ້ອະນຸມັດແທນ/), 'u-2');
    await userEvent.click(screen.getByTestId('delegation-save'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('ບໍ່ສາມາດມອບສິດໃຫ້ຕົນເອງ')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/^ຜູ້ອະນຸມັດແທນ/), 'u-1');
    await userEvent.click(screen.getByTestId('delegation-save'));
    expect(onSubmit).toHaveBeenCalledWith({ delegateUserId: 'u-1', startDate: '2026-11-17', endDate: '2026-11-17', reason: undefined, delegatorUserId: 'u-2' });
  });
});
