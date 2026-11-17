import type { OvertimePreview, OvertimeReport, OvertimeRequestView } from '@hrm/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OvertimeReportTable } from '@/features/overtime/components/OvertimeReportTable';
import { OvertimeRequestForm } from '@/features/overtime/components/OvertimeRequestForm';
import { OvertimeRequestList } from '@/features/overtime/components/OvertimeRequestList';
import { ApiError } from '@/lib/api-client';

const cap = (total: number, over: Partial<OvertimePreview['day']> = {}) => ({ total, cap: 180, exceeded: false, warn: false, ...over });
const preview = (over: Partial<OvertimePreview> = {}): OvertimePreview => ({
  start: '2028-03-14T10:30:00.000Z',
  end: '2028-03-14T15:30:00.000Z',
  workdayDayMinutes: 270,
  workdayNightMinutes: 30,
  holidayDayMinutes: 0,
  holidayNightMinutes: 0,
  minutes: 150,
  day: cap(150),
  month: { total: 600, cap: 2700, exceeded: false, warn: false },
  warnPercent: 80,
  ...over,
});

const request = (over: Partial<OvertimeRequestView> = {}): OvertimeRequestView => ({
  id: 'ot1', employeeId: 'e1', employeeCode: 'E001', employeeName: 'Somsak P', kind: 'PRE', workDate: '2028-03-14',
  plannedStart: '', plannedEnd: '', plannedStartTime: '17:30', plannedEndTime: '20:00', actualStart: null, actualEnd: null,
  actualStartTime: null, actualEndTime: null, reason: 'Stock count', minutes: 150, workdayDayMinutes: 150, workdayNightMinutes: 0,
  holidayDayMinutes: 0, holidayNightMinutes: 0, status: 'PENDING', decidedAt: null, createdAt: '', approvalRequestId: 'ap1', ...over,
});

const fillPeriod = async (start = '17:30', end = '20:00') => {
  await userEvent.type(screen.getByLabelText(/^ເລີ່ມ/), start);
  await userEvent.type(screen.getByLabelText(/^ເຖິງ/), end);
};

describe('OvertimeRequestForm', () => {
  it('previews the split and caps from the API, then submits the request', async () => {
    const onPreview = vi.fn().mockResolvedValue(preview({ day: cap(150, { warn: true }) }));
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<OvertimeRequestForm today="2028-03-14" onPreview={onPreview} onSubmit={onSubmit} debounceMs={0} />);
    expect(screen.getByTestId('ot-preview')).toHaveTextContent('ໃສ່ວັນທີ ແລະ ເວລາ');
    await fillPeriod();
    await waitFor(() => expect(screen.getByTestId('ot-preview-split-total')).toHaveTextContent('2:30'));
    expect(onPreview).toHaveBeenLastCalledWith({ kind: 'PRE', workDate: '2028-03-14', start: '17:30', end: '20:00' });
    expect(screen.getByTestId('ot-preview-split-workdayNightMinutes')).toHaveTextContent('0:30');
    expect(screen.getByTestId('ot-cap-day')).toHaveTextContent('ໃກ້ຮອດເພດານໂອທີ (80%)');

    await userEvent.type(screen.getByLabelText(/ເຫດຜົນ/), ' Stock count ');
    await userEvent.click(screen.getByTestId('ot-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ kind: 'PRE', workDate: '2028-03-14', start: '17:30', end: '20:00', reason: 'Stock count' });
  });

  it('disables submit over the cap and shows preview errors', async () => {
    const onPreview = vi.fn().mockResolvedValue(preview({ day: cap(240, { exceeded: true, warn: true }) }));
    const onSubmit = vi.fn();
    const { unmount } = render(<OvertimeRequestForm today="2028-03-14" onPreview={onPreview} onSubmit={onSubmit} debounceMs={0} />);
    await fillPeriod();
    await waitFor(() => expect(screen.getByTestId('ot-cap-day')).toHaveTextContent('ເກີນເພດານໂອທີ'));
    expect(screen.getByTestId('ot-submit')).toBeDisabled();
    unmount();

    render(
      <OvertimeRequestForm
        today="2028-03-14"
        onPreview={vi.fn().mockRejectedValue(new ApiError(409, 'ot_overlaps_shift', 'x'))}
        onSubmit={onSubmit}
        debounceMs={0}
      />,
    );
    await fillPeriod('16:00', '18:00');
    expect(await screen.findByTestId('ot-preview-error')).toHaveTextContent('ເວລາໂອທີຕ້ອງຢູ່ນອກເວລາເຮັດວຽກປົກກະຕິ');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires the reason and shows API errors on submit', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(409, 'ot_cap_exceeded', 'x'));
    render(<OvertimeRequestForm today="2028-03-14" onPreview={vi.fn().mockResolvedValue(preview())} onSubmit={onSubmit} debounceMs={0} />);
    await fillPeriod();
    await waitFor(() => expect(screen.getByTestId('ot-preview-split')).toBeInTheDocument());
    await userEvent.click(screen.getByTestId('ot-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('ຈຳເປັນຕ້ອງໃສ່')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/ເຫດຜົນ/), 'x');
    await userEvent.click(screen.getByTestId('ot-submit'));
    expect(await screen.findByTestId('ot-form-error')).toHaveTextContent('ເກີນເພດານໂອທີຕໍ່ມື້ ຫຼື ຕໍ່ເດືອນ');
  });
});

describe('OvertimeRequestList', () => {
  it('shows planned and actual times, the total and the status linked to the approval', () => {
    render(<OvertimeRequestList items={[request({ status: 'APPROVED', actualStartTime: '17:30', actualEndTime: '19:00', minutes: 90 })]} showEmployee />);
    const item = screen.getByTestId('ot-item');
    expect(item).toHaveTextContent('ແຜນ 17:30–20:00');
    expect(item).toHaveTextContent('ຕົວຈິງ 17:30–19:00');
    expect(item).toHaveTextContent('E001 Somsak P');
    expect(item).toHaveTextContent('1:30');
    expect(within(item).getByRole('link')).toHaveAttribute('href', '/approvals/ap1');
  });
});

describe('OvertimeReportTable', () => {
  it('lists approved minutes per employee and category with totals', () => {
    const totals = { workdayDayMinutes: 90, workdayNightMinutes: 60, holidayDayMinutes: 0, holidayNightMinutes: 30, totalMinutes: 180 };
    const report: OvertimeReport = {
      month: '2028-03',
      rows: [{ ...totals, employeeId: 'e1', employeeCode: 'E001', employeeName: 'Somsak P', requests: 2 }],
      totals,
      items: [],
    };
    render(<OvertimeReportTable report={report} />);
    const row = screen.getByTestId('ot-report-row');
    expect(row).toHaveTextContent('E001 Somsak P');
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['E001 Somsak P', '1:30', '1:00', '0:00', '0:30', '3:00', '2']);
    expect(screen.getByTestId('ot-report-totals')).toHaveTextContent('3:00');
  });
});
