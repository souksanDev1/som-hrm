import type { ApprovalRequestDetail, ApprovalTeamLeave } from '@hrm/shared';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalDetail } from '@/features/approvals/components/ApprovalDetail';
import { StepHistory } from '@/features/approvals/components/StepHistory';
import { TeamOnLeave } from '@/features/approvals/components/TeamOnLeave';

const member = (over: Partial<ApprovalTeamLeave> = {}): ApprovalTeamLeave => ({
  requestId: 'lr-1',
  employeeId: 'e-1',
  employeeCode: 'E001',
  name: 'Kham Vong',
  startDate: '2026-12-07',
  endDate: '2026-12-09',
  halfDay: 'NONE',
  days: 3,
  status: 'APPROVED',
  ...over,
});

const request = (over: Partial<ApprovalRequestDetail> = {}): ApprovalRequestDetail => ({
  id: 'ar-1',
  subjectType: 'LEAVE',
  subjectId: 'lr-0',
  status: 'PENDING',
  requester: { employeeId: 'e-0', employeeCode: 'E000', name: 'Somsak' },
  summary: { title: 'ລາພັກປະຈຳປີ · 1 ມື້', detail: '2026-12-08' },
  link: '/approvals/ar-1',
  currentStep: 1,
  requiredLevels: 1,
  submittedAt: '2026-11-18T03:00:00.000Z',
  decidedAt: null,
  steps: [],
  myCapacity: null,
  ...over,
});

describe('TeamOnLeave (FR-LV-13.10)', () => {
  it('lists each colleague with dates, half day, days and a pending marker', () => {
    render(<TeamOnLeave members={[member(), member({ requestId: 'lr-2', name: 'Noy', employeeCode: 'E002', startDate: '2026-12-08', endDate: '2026-12-08', halfDay: 'PM', days: 0.5, status: 'PENDING' })]} />);
    const rows = screen.getAllByTestId('team-on-leave-item');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Kham Vong · E001');
    expect(rows[0]).toHaveTextContent('2026-12-07 – 2026-12-09 · 3 ມື້');
    expect(rows[0]).not.toHaveTextContent('ລໍຖ້າອະນຸມັດ');
    expect(rows[1]).toHaveTextContent('2026-12-08 (ເຄິ່ງມື້ບ່າຍ) · 0.5 ມື້');
    expect(rows[1]).toHaveTextContent('ລໍຖ້າອະນຸມັດ');
  });

  it('says so when nobody else is away', () => {
    render(<TeamOnLeave members={[]} />);
    expect(screen.getByTestId('team-on-leave-empty')).toHaveTextContent('ບໍ່ມີເພື່ອນຮ່ວມທີມລາໃນຊ່ວງນີ້');
  });

  it('is part of the approval detail only when the API sends the list', () => {
    const { unmount } = render(<ApprovalDetail request={request({ teamOnLeave: [member()] })} onDecide={vi.fn()} />);
    expect(screen.getByText('ເພື່ອນຮ່ວມທີມທີ່ລາໃນຊ່ວງດຽວກັນ')).toBeInTheDocument();
    expect(screen.getAllByTestId('team-on-leave-item')).toHaveLength(1);
    unmount();
    render(<ApprovalDetail request={request()} onDecide={vi.fn()} />);
    expect(screen.queryByTestId('team-on-leave')).not.toBeInTheDocument();
  });
});

describe('StepHistory of a withdrawn request (FR-LV-12.1)', () => {
  it('shows the open step as withdrawn by whoever cancelled it', () => {
    render(
      <StepHistory
        requiredLevels={1}
        requestStatus="CANCELLED"
        steps={[
          {
            id: 's1', level: 1, approver: { userId: 'u-m', name: 'Manager' }, delegate: null, actingAs: 'MANAGER', decision: 'PENDING',
            decidedBy: { userId: 'u-e', name: 'Somsak' }, decidedAt: '2026-11-18T04:00:00.000Z', note: 'Plans changed', createdAt: '2026-11-17T03:00:00.000Z',
          },
        ]}
      />,
    );
    const row = screen.getByTestId('approval-step');
    expect(row).toHaveTextContent('ຖອນຄຳຂໍແລ້ວ');
    expect(row).not.toHaveTextContent('ລໍຖ້າ');
    expect(within(row).getByTestId('approval-step-meta')).toHaveTextContent('ຖອນຄຳຂໍໂດຍ Somsak · 2026-11-18');
  });
});
