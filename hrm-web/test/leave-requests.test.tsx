import type { LeavePreview, LeaveRequest, LeaveType } from '@hrm/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LeaveRequestDetail } from '@/features/leave-requests/components/LeaveRequestDetail';
import { LeaveRequestForm } from '@/features/leave-requests/components/LeaveRequestForm';
import { LeaveBalanceList, LeaveRequestList } from '@/features/leave-requests/components/LeaveViews';
import { ApiError } from '@/lib/api-client';

const leaveType = (over: Partial<LeaveType> = {}): LeaveType => ({
  id: 'annual', code: 'ANNUAL', category: 'ANNUAL', nameLo: 'ລາພັກປະຈຳປີ', nameEn: 'Annual leave', paid: true, requiresAttachment: false, allowHalfDay: true,
  gender: null, isActive: true, countingMethod: 'WORKING_DAYS', quotaPeriod: 'YEARLY', isCustom: false, sortOrder: 1,
  policy: { daysPerYear: 15, hazardousDays: 18, multipleBirthDays: null, minServiceDays: 365, minServicePayTypes: [] }, legalMin: { days: 15 }, ...over,
});
const TYPES = [
  leaveType(),
  leaveType({ id: 'sick', code: 'SICK', category: 'SICK', nameLo: 'ລາປ່ວຍ', nameEn: 'Sick leave', requiresAttachment: true }),
  leaveType({ id: 'mat', code: 'MATERNITY', category: 'MATERNITY', nameLo: 'ລາເກີດລູກ', nameEn: 'Maternity', allowHalfDay: false, quotaPeriod: 'PER_EVENT' }),
];

const preview = (over: Partial<LeavePreview> = {}): LeavePreview => ({
  days: 3, byYear: { 2030: 3 }, balanceByYear: { 2030: 12 }, quota: null, errors: [], certificateRequired: false, certificateDueDate: null, needsDelegate: false, ...over,
});

const request = (over: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: 'lr1', employeeId: 'e1', employeeCode: 'E001', employeeName: 'Somsak P', leaveType: { id: 'annual', code: 'ANNUAL', nameLo: 'ລາພັກປະຈຳປີ', nameEn: 'Annual leave' },
  startDate: '2030-12-03', endDate: '2030-12-05', halfDay: 'NONE', multipleBirth: false, days: 3, reason: 'Trip', status: 'PENDING', filedAs: 'SELF',
  submittedByName: 'Somsak', certificateRequired: false, certificateFileId: null, certificateDueDate: null, approvalRequestId: 'ap1', cancelRequest: null,
  cancelledAt: null, cancelReason: null, createdAt: '', ...over,
});

const renderForm = (props: Partial<Parameters<typeof LeaveRequestForm>[0]> = {}) => {
  const onPreview = props.onPreview ?? vi.fn().mockResolvedValue(preview());
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onUpload = props.onUpload ?? vi.fn().mockResolvedValue({ id: 'f1', originalName: 'cert.pdf', mimeType: 'application/pdf', sizeBytes: 10 });
  render(<LeaveRequestForm types={TYPES} delegateOptions={[{ value: 'u9', label: 'Delegate' }]} debounceMs={0} {...props} onPreview={onPreview} onSubmit={onSubmit} onUpload={onUpload} />);
  return { onPreview, onSubmit, onUpload };
};
const fill = async (typeId: string, start: string, end?: string) => {
  await userEvent.selectOptions(screen.getByTestId('leave-type'), typeId);
  await userEvent.type(screen.getByTestId('leave-start'), start);
  if (end) {
    await userEvent.clear(screen.getByTestId('leave-end'));
    await userEvent.type(screen.getByTestId('leave-end'), end);
  }
};

describe('LeaveRequestForm (FR-LV-03/06)', () => {
  it('previews days and balance from the API, then submits', async () => {
    const { onPreview, onSubmit } = renderForm();
    expect(screen.getByTestId('leave-preview')).toHaveTextContent('ເລືອກປະເພດ ແລະ ວັນທີ');
    await fill('annual', '2030-12-03', '2030-12-05');
    await waitFor(() => expect(screen.getByTestId('leave-preview-days')).toHaveTextContent('3'));
    expect(screen.getByTestId('leave-preview-balance-2030')).toHaveTextContent('12');
    expect(onPreview).toHaveBeenLastCalledWith({ leaveTypeId: 'annual', startDate: '2030-12-03', endDate: '2030-12-05', halfDay: 'NONE', multipleBirth: false });
    await userEvent.type(screen.getByTestId('leave-reason'), ' Trip ');
    await userEvent.click(screen.getByTestId('leave-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ leaveTypeId: 'annual', startDate: '2030-12-03', endDate: '2030-12-05', halfDay: 'NONE', multipleBirth: false, reason: 'Trip' });
  });

  it('shows the rule errors of the preview and blocks submit', async () => {
    const { onSubmit } = renderForm({ onPreview: vi.fn().mockResolvedValue(preview({ errors: ['leave_insufficient_balance'] })) });
    await fill('annual', '2030-12-03');
    expect(await screen.findByTestId('leave-preview-rule')).toHaveTextContent('ວັນລາຄົງເຫຼືອບໍ່ພໍ');
    expect(screen.getByTestId('leave-submit')).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('asks for a delegate when the preview needs one and sends it', async () => {
    const { onSubmit } = renderForm({ onPreview: vi.fn().mockResolvedValue(preview({ needsDelegate: true })) });
    await fill('annual', '2030-12-03');
    await screen.findByTestId('leave-delegate');
    await userEvent.click(screen.getByTestId('leave-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText('ກະລຸນາເລືອກຜູ້ອະນຸມັດແທນໃນໄລຍະລາ').length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByTestId('leave-delegate'), 'u9');
    await userEvent.click(screen.getByTestId('leave-submit'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ delegateUserId: 'u9' }));
  });

  it('uploads a certificate for types that need one and shows the deadline', async () => {
    const { onSubmit, onUpload } = renderForm({
      onPreview: vi.fn().mockResolvedValue(preview({ certificateRequired: true, certificateDueDate: '2030-12-09', balanceByYear: { 2030: 30 } })),
    });
    await fill('sick', '2030-12-03', '2030-12-04');
    expect(await screen.findByTestId('leave-preview-certificate')).toHaveTextContent('2030-12-09');
    await userEvent.upload(screen.getByTestId('leave-certificate'), new File(['%PDF'], 'cert.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(onUpload).toHaveBeenCalled());
    expect(await screen.findByText('ແນບແລ້ວ: cert.pdf')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('leave-submit'));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ leaveTypeId: 'sick', certificateFileId: 'f1' }));
  });

  it('offers half days and multiple birth only where the type allows them, and shows API errors', async () => {
    renderForm({ onSubmit: vi.fn().mockRejectedValue(new ApiError(400, 'leave_overlaps_request', 'x')) });
    await userEvent.selectOptions(screen.getByTestId('leave-type'), 'mat');
    expect(screen.queryByTestId('leave-halfDay')).not.toBeInTheDocument();
    expect(screen.getByTestId('leave-multipleBirth')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByTestId('leave-type'), 'annual');
    expect(screen.queryByTestId('leave-multipleBirth')).not.toBeInTheDocument();
    await userEvent.type(screen.getByTestId('leave-start'), '2030-12-03');
    await userEvent.selectOptions(screen.getByTestId('leave-halfDay'), 'AM');
    await waitFor(() => expect(screen.getByTestId('leave-preview-days')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('leave-submit'));
    expect(await screen.findByTestId('leave-form-error')).toHaveTextContent('ມີຄຳຂໍລາອື່ນໃນໄລຍະນີ້ແລ້ວ');
  });
});

describe('LeaveRequestList / LeaveBalanceList', () => {
  it('lists requests with status and days linking to the detail', () => {
    render(<LeaveRequestList items={[request(), request({ id: 'lr2', status: 'APPROVED', halfDay: 'AM', startDate: '2030-12-08', endDate: '2030-12-08', days: 0.5 })]} />);
    const items = screen.getAllByTestId('leave-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('2030-12-03 – 2030-12-05');
    expect(items[0]).toHaveTextContent('ລໍຖ້າອະນຸມັດ');
    expect(items[1]).toHaveTextContent('ເຄິ່ງມື້ເຊົ້າ');
    expect(items[0]!.querySelector('a')).toHaveAttribute('href', '/leave/lr1');
  });

  it('shows the empty state and yearly balances only', () => {
    render(<LeaveRequestList items={[]} />);
    expect(screen.getByTestId('leave-empty')).toBeInTheDocument();
    render(
      <LeaveBalanceList
        year={2030}
        types={TYPES}
        balances={[
          { leaveTypeId: 'annual', year: 2030, quotaPeriod: 'YEARLY', entitled: 15, carried: 0, used: 3, adjusted: 0, expired: 0, balance: 12, pending: 2 },
          { leaveTypeId: 'mat', year: 2030, quotaPeriod: 'PER_EVENT', entitled: 0, carried: 0, used: 0, adjusted: 0, expired: 0, balance: 0, pending: 0 },
        ]}
      />,
    );
    expect(screen.getByTestId('leave-balance-ANNUAL')).toHaveTextContent('12');
    expect(screen.getByTestId('leave-balance-ANNUAL')).toHaveTextContent('ລໍຖ້າອະນຸມັດ 2');
    expect(screen.queryByTestId('leave-balance-MATERNITY')).not.toBeInTheDocument();
  });
});

describe('LeaveRequestDetail', () => {
  it('withdraws a pending request without a reason', async () => {
    const onCancel = vi.fn().mockResolvedValue({});
    render(<LeaveRequestDetail request={request()} onAttach={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByTestId('leave-cancel'));
    await userEvent.click(screen.getByTestId('leave-cancel-confirm'));
    expect(onCancel).toHaveBeenCalledWith('');
  });

  it('needs a reason to cancel approved leave and hides the button while a cancellation is pending', async () => {
    const onCancel = vi.fn().mockResolvedValue({});
    const { unmount } = render(<LeaveRequestDetail request={request({ status: 'APPROVED' })} onAttach={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByTestId('leave-cancel'));
    await userEvent.click(screen.getByTestId('leave-cancel-confirm'));
    expect(onCancel).not.toHaveBeenCalled();
    await userEvent.type(screen.getByTestId('leave-cancel-reason'), 'Plans changed');
    await userEvent.click(screen.getByTestId('leave-cancel-confirm'));
    expect(onCancel).toHaveBeenCalledWith('Plans changed');
    unmount();

    render(<LeaveRequestDetail request={request({ status: 'APPROVED', cancelRequest: { id: 'c1', status: 'PENDING', reason: 'x', approvalRequestId: null } })} onAttach={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByTestId('leave-cancel-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('leave-cancel')).not.toBeInTheDocument();
  });

  it('shows a missing certificate with its deadline and attaches one', async () => {
    const onAttach = vi.fn().mockResolvedValue({});
    render(<LeaveRequestDetail request={request({ certificateRequired: true, certificateDueDate: '2030-12-09' })} onAttach={onAttach} onCancel={vi.fn()} />);
    expect(screen.getByTestId('leave-detail-certificate')).toHaveTextContent('ຍັງບໍ່ແນບ — ກຳນົດ 2030-12-09');
    await userEvent.upload(screen.getByTestId('leave-attach'), new File(['%PDF'], 'cert.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(onAttach).toHaveBeenCalled());
    expect(await screen.findByTestId('leave-notice')).toHaveTextContent('ແນບໃບແພດແລ້ວ');
  });
});
