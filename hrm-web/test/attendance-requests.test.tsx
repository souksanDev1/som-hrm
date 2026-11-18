import type { Correction, EmployeeDevices, OffsitePermission, ReviewPunch } from '@hrm/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CorrectionForm, CorrectionList } from '@/features/attendance-requests/components/Corrections';
import { DeviceList } from '@/features/attendance-requests/components/DeviceList';
import type { RenderEmployeeSelect } from '@/features/attendance-requests/components/EmployeeSelect';
import { OffsiteForm, OffsiteList } from '@/features/attendance-requests/components/OffsitePermissions';
import { OnBehalfForm } from '@/features/attendance-requests/components/OnBehalfForm';
import { mapLink, ReviewItem } from '@/features/attendance-requests/components/ReviewQueueList';
import { ApiError } from '@/lib/api-client';

const employee = { id: 'e1', employeeCode: 'E001', name: 'Kham Vong' };

/** Plain <select> instead of the hook-backed picker. */
const stubSelect: RenderEmployeeSelect = ({ id, value, onChange }) => (
  <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">—</option>
    <option value="e1">E001</option>
  </select>
);

const punch = (over: Partial<ReviewPunch> = {}): ReviewPunch => ({
  id: 'p1',
  employee,
  kind: 'IN',
  workDate: '2026-11-16',
  capturedAt: '2026-11-16T01:00:00.000Z',
  capturedLocal: '2026-11-16 08:00',
  receivedAt: '2026-11-16T01:30:00.000Z',
  receivedLocal: '2026-11-16 08:30',
  source: 'MOBILE',
  branch: { id: 'b1', name: 'Vientiane' },
  latitude: 17.97,
  longitude: 102.6,
  accuracyMetres: 10,
  distanceMetres: 42.4,
  selfieFileId: 'f1',
  offline: true,
  suspicious: true,
  suspiciousReasons: ['DEVICE_TIME_SKEW'],
  reviewStatus: 'PENDING',
  reviewNote: null,
  reason: null,
  ...over,
});

describe('ReviewItem (FR-ATT-14)', () => {
  it('shows translated reasons, local times, map link and the selfie', async () => {
    const loadSelfie = vi.fn().mockResolvedValue('data:image/png;base64,AAAA');
    render(<ReviewItem punch={punch()} onDecide={vi.fn()} loadSelfie={loadSelfie} />);
    expect(screen.getByTestId('review-reasons')).toHaveTextContent('ເວລາໃນເຄື່ອງບໍ່ກົງກັບເຊີບເວີ');
    expect(screen.getByTestId('review-captured')).toHaveTextContent('2026-11-16 08:00');
    expect(screen.getByTestId('review-map')).toHaveAttribute('href', mapLink(17.97, 102.6));
    expect(screen.getByText(/42 ແມັດ/)).toBeInTheDocument();
    expect(await screen.findByTestId('review-selfie')).toHaveAttribute('src', 'data:image/png;base64,AAAA');
    expect(loadSelfie).toHaveBeenCalledWith('f1');
  });

  it('translates the rooted-device and Wi-Fi reasons (FR-ATT-10.2, FR-ATT-12)', () => {
    render(<ReviewItem punch={punch({ selfieFileId: null, suspiciousReasons: ['ROOTED', 'WIFI_MISMATCH'] })} onDecide={vi.fn()} />);
    const reasons = screen.getByTestId('review-reasons');
    expect(reasons).toHaveTextContent('ເຄື່ອງຖືກ root/jailbreak');
    expect(reasons).toHaveTextContent('ບໍ່ໄດ້ເຊື່ອມ Wi-Fi ຂອງສາຂາ');
    expect(reasons).not.toHaveTextContent('attendance.suspicion');
  });

  it('requires a note to reject, approves without one and shows API errors', async () => {
    const onDecide = vi.fn().mockRejectedValueOnce(new ApiError(409, 'review_already_decided', 'x')).mockResolvedValue(undefined);
    render(<ReviewItem punch={punch({ selfieFileId: null })} onDecide={onDecide} />);
    await userEvent.click(screen.getByTestId('review-reject'));
    expect(onDecide).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('ກະລຸນາໃສ່ເຫດຜົນທີ່ປະຕິເສດ');

    await userEvent.click(screen.getByTestId('review-approve'));
    expect(onDecide).toHaveBeenCalledWith({ decision: 'APPROVED', note: undefined });
    expect(await screen.findByRole('alert')).toHaveTextContent('ລາຍການນີ້ຖືກກວດສອບແລ້ວ');

    await userEvent.type(screen.getByLabelText('ໝາຍເຫດ'), ' fake GPS ');
    await userEvent.click(screen.getByTestId('review-reject'));
    expect(onDecide).toHaveBeenLastCalledWith({ decision: 'REJECTED', note: 'fake GPS' });
  });
});

describe('OnBehalfForm (FR-ATT-04)', () => {
  it('requires employee, time and reason, then submits the local time and shows the result', async () => {
    const onSubmit = vi.fn().mockResolvedValue(punch({ source: 'HR_ON_BEHALF', capturedLocal: '2026-11-16 08:20' }));
    render(<OnBehalfForm onSubmit={onSubmit} renderEmployeeSelect={stubSelect} />);
    await userEvent.click(screen.getByTestId('on-behalf-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert')).toHaveLength(3);

    await userEvent.selectOptions(screen.getByLabelText(/ພະນັກງານ/), 'e1');
    await userEvent.selectOptions(screen.getByLabelText(/ປະເພດ/), 'OUT');
    await userEvent.type(screen.getByLabelText(/ວັນທີ ແລະ ເວລາ/), '2026-11-16T08:20');
    await userEvent.type(screen.getByLabelText(/ເຫດຜົນ/), 'Phone broken');
    await userEvent.click(screen.getByTestId('on-behalf-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ employeeId: 'e1', kind: 'OUT', capturedAt: '2026-11-16T08:20', reason: 'Phone broken' });
    expect(await screen.findByTestId('on-behalf-success')).toHaveTextContent('Kham Vong');
  });

  it('puts a field error from the API under that field', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, 'punch_in_future', 'x', { field: 'capturedAt' }));
    render(<OnBehalfForm onSubmit={onSubmit} renderEmployeeSelect={stubSelect} />);
    await userEvent.selectOptions(screen.getByLabelText(/ພະນັກງານ/), 'e1');
    await userEvent.type(screen.getByLabelText(/ວັນທີ ແລະ ເວລາ/), '2099-01-01T08:00');
    await userEvent.type(screen.getByLabelText(/ເຫດຜົນ/), 'x');
    await userEvent.click(screen.getByTestId('on-behalf-submit'));
    expect(await screen.findByText('ເວລາຢູ່ໃນອະນາຄົດ')).toBeInTheDocument();
  });
});

describe('off-site permissions (FR-ATT-16.1)', () => {
  it('validates the range and submits', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<OffsiteForm onSubmit={onSubmit} onCancel={vi.fn()} renderEmployeeSelect={stubSelect} />);
    await userEvent.selectOptions(screen.getByLabelText(/ພະນັກງານ/), 'e1');
    await userEvent.type(screen.getByLabelText(/ແຕ່ວັນທີ/), '2099-01-10');
    await userEvent.type(screen.getByLabelText(/ຫາວັນທີ/), '2099-01-05');
    await userEvent.click(screen.getByTestId('offsite-save'));
    expect(screen.getByText('ວັນສິ້ນສຸດຕ້ອງບໍ່ກ່ອນວັນເລີ່ມ')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/ຫາວັນທີ/));
    await userEvent.type(screen.getByLabelText(/ຫາວັນທີ/), '2099-01-20');
    await userEvent.type(screen.getByLabelText(/ໝາຍເຫດ/), 'Site visit');
    await userEvent.click(screen.getByTestId('offsite-save'));
    expect(onSubmit).toHaveBeenCalledWith({ employeeId: 'e1', fromDate: '2099-01-10', toDate: '2099-01-20', note: 'Site visit' });
  });

  it('lists permissions and revokes an active one after confirming', async () => {
    const base: OffsitePermission = { id: 'o1', employee, fromDate: '2099-01-10', toDate: '2099-01-20', note: 'Site', grantedBy: 'Noy', revokedAt: null, active: true, createdAt: '' };
    const onRevoke = vi.fn().mockResolvedValue(undefined);
    render(<OffsiteList items={[base, { ...base, id: 'o2', revokedAt: '2026-11-01T00:00:00Z', active: false }]} onRevoke={onRevoke} />);
    const rows = screen.getAllByTestId('offsite-item');
    expect(rows[0]).toHaveTextContent('2099-01-10 – 2099-01-20 · Site');
    expect(rows[0]).toHaveTextContent('ໃຊ້ໄດ້');
    expect(within(rows[1]!).queryByTestId('offsite-revoke')).toBeNull();
    await userEvent.click(within(rows[0]!).getByTestId('offsite-revoke'));
    await userEvent.click(screen.getByTestId('confirm-accept'));
    expect(onRevoke).toHaveBeenCalledWith('o1');
  });
});

describe('DeviceList (FR-ATT-11)', () => {
  const devices: EmployeeDevices = {
    employee,
    hasLogin: true,
    bindings: [
      { id: 'b1', deviceId: 'dev-new', platform: 'ANDROID', model: 'Huawei Y7', isActive: true, lastSeenAt: null, revokedAt: null, createdAt: '' },
      { id: 'b0', deviceId: 'dev-old', platform: 'ANDROID', model: null, isActive: false, lastSeenAt: null, revokedAt: '2026-11-01T00:00:00Z', createdAt: '' },
    ],
    requests: [{ id: 'r1', deviceId: 'dev-new', platform: 'ANDROID', model: 'Huawei Y7', reason: 'Lost phone', status: 'APPROVED', createdAt: '2026-11-10T00:00:00Z', decidedAt: null, approvalRequestId: 'a1' }],
  };

  it('shows bindings and requests and resets only the active phone', async () => {
    const onReset = vi.fn().mockResolvedValue(undefined);
    render(<DeviceList devices={devices} onReset={onReset} />);
    expect(screen.getAllByTestId('device-binding')).toHaveLength(2);
    expect(screen.getAllByTestId('device-reset')).toHaveLength(1);
    expect(screen.getByTestId('device-request')).toHaveTextContent('ອະນຸມັດແລ້ວ');
    await userEvent.click(screen.getByTestId('device-reset'));
    await userEvent.click(screen.getByTestId('confirm-accept'));
    expect(onReset).toHaveBeenCalledWith('b1');
  });

  it('explains when the employee has no login', () => {
    render(<DeviceList devices={{ ...devices, hasLogin: false, bindings: [] }} onReset={vi.fn()} />);
    expect(screen.getByText('ພະນັກງານຄົນນີ້ຍັງບໍ່ມີບັນຊີເຂົ້າລະບົບ')).toBeInTheDocument();
  });
});

describe('time correction (FR-ATT-19)', () => {
  it('needs a time and reason, uploads the attachment and submits its id', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onUpload = vi.fn().mockResolvedValue({ id: 'file-1', originalName: 'memo.pdf', mimeType: 'application/pdf', sizeBytes: 10 });
    const onDone = vi.fn();
    render(<CorrectionForm onSubmit={onSubmit} onUpload={onUpload} onDone={onDone} />);
    await userEvent.type(screen.getByLabelText(/ວັນທີເຮັດວຽກ/), '2026-11-16');
    await userEvent.click(screen.getByTestId('correction-submit'));
    expect(screen.getByText('ໃສ່ເວລາເຂົ້າ ຫຼື ເວລາອອກຢ່າງໜ້ອຍ 1 ອັນ')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/ເວລາເຂົ້າວຽກ/), '08:00');
    await userEvent.type(screen.getByLabelText(/ເຫດຜົນ/), 'Forgot');
    await userEvent.upload(screen.getByTestId('correction-attachment'), new File(['%PDF'], 'memo.pdf', { type: 'application/pdf' }));
    expect(await screen.findByTestId('correction-attached')).toHaveTextContent('memo.pdf');
    await userEvent.click(screen.getByTestId('correction-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ workDate: '2026-11-16', requestedCheckIn: '08:00', requestedCheckOut: undefined, reason: 'Forgot', attachmentFileId: 'file-1' });
    expect(onDone).toHaveBeenCalled();
  });

  it('lists original vs requested times with the status', () => {
    const c: Correction = {
      id: 'c1', employee, workDate: '2026-11-16', checkIn: { original: '2026-11-16 08:30', requested: '2026-11-16 08:00' }, checkOut: { original: null, requested: null },
      reason: 'Queue', attachment: null, status: 'PENDING', createdAt: '', decidedAt: null, approvalRequestId: 'a1',
    };
    render(<CorrectionList items={[c, { ...c, id: 'c2', checkIn: { original: null, requested: '2026-11-15 08:00' }, status: 'APPROVED' }]} />);
    const rows = screen.getAllByTestId('correction-item');
    expect(rows[0]).toHaveTextContent('ເດີມ 2026-11-16 08:30 → ຂໍແກ້ເປັນ 2026-11-16 08:00');
    expect(rows[0]).toHaveTextContent('ລໍຖ້າອະນຸມັດ');
    expect(rows[1]).toHaveTextContent('ເດີມ ບໍ່ມີ');
  });
});
