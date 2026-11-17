import type { AttendanceDayView, RosterView, Shift } from '@hrm/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceDayTable } from '@/features/shifts/components/AttendanceDayTable';
import { RosterBulkForm } from '@/features/shifts/components/RosterBulkForm';
import { RosterGrid } from '@/features/shifts/components/RosterGrid';
import { ShiftList } from '@/features/shifts/components/ShiftList';
import { emptyShiftValues, parseShiftForm, shiftFormValues } from '@/features/shifts/form';
import { mondayOf, monthBounds, weekDates } from '@/features/shifts/format';
import { usePrefsStore } from '@/lib/i18n';

beforeEach(() => {
  usePrefsStore.setState({ locale: 'en' });
});

const shift = (over: Partial<Shift> = {}): Shift => ({
  id: 's1', name: 'Day', code: 'D', color: '#2563EB', startTime: '08:00', endTime: '17:00', breakMinutes: 60,
  lateGraceMinutes: null, earlyGraceMinutes: null, isActive: true, crossesMidnight: false, netMinutes: 480, inUse: false, ...over,
});
const night = shift({ id: 's2', name: 'Night', code: 'N', startTime: '22:00', endTime: '06:00', crossesMidnight: true, netMinutes: 420 });

describe('parseShiftForm (FR-ATT-17.1/17.2)', () => {
  it('builds the payload; empty grace = workspace parameter', () => {
    expect(parseShiftForm({ ...emptyShiftValues(), name: ' Day ', code: 'D', lateGraceMinutes: '10' })).toEqual({
      ok: true,
      data: { name: 'Day', code: 'D', color: null, startTime: '08:00', endTime: '17:00', breakMinutes: 60, lateGraceMinutes: 10, earlyGraceMinutes: null, isActive: true },
    });
  });
  it('accepts a night shift and round-trips an existing shift', () => {
    expect(parseShiftForm(shiftFormValues(night))).toMatchObject({ ok: true, data: { startTime: '22:00', endTime: '06:00', color: '#2563EB' } });
  });
  it('rejects bad times, equal start/end, long breaks, bad colours and grace out of range', () => {
    const base = { ...emptyShiftValues(), name: 'X' };
    expect(parseShiftForm({ ...base, name: '' })).toEqual({ ok: false, errors: { name: 'required' } });
    expect(parseShiftForm({ ...base, startTime: '24:00' })).toEqual({ ok: false, errors: { startTime: 'shift_invalid_time' } });
    expect(parseShiftForm({ ...base, endTime: '08:00' })).toEqual({ ok: false, errors: { endTime: 'shift_invalid_time' } });
    expect(parseShiftForm({ ...base, breakMinutes: '540' })).toEqual({ ok: false, errors: { breakMinutes: 'shift_break_too_long' } });
    expect(parseShiftForm({ ...base, color: 'blue' })).toEqual({ ok: false, errors: { color: 'shift_invalid_color' } });
    expect(parseShiftForm({ ...base, lateGraceMinutes: '500' }).ok).toBe(false);
  });
});

describe('ShiftList', () => {
  it('badges night and inactive shifts and wires edit/delete', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<ShiftList shifts={[shift(), { ...night, isActive: false }]} onEdit={onEdit} onDelete={onDelete} />);
    const rows = screen.getAllByTestId('shift-row');
    expect(within(rows[1]!).getByText('Night shift')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Inactive')).toBeInTheDocument();
    expect(within(rows[0]!).queryByText('Night shift')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Edit Night' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete Day' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });
});

describe('roster', () => {
  const dates = weekDates('2026-11-16');
  const roster: RosterView = {
    from: dates[0]!,
    to: dates[6]!,
    employees: [{ id: 'e1', employeeCode: 'E1', name: 'Somchai', departmentName: null }],
    cells: dates.map((date, i) => ({ employeeId: 'e1', date, shiftId: i === 0 ? 's2' : i === 6 ? null : 's1', source: i === 0 ? 'ROSTER' : 'SCHEDULE' })),
  };

  it('shows roster and schedule cells and reports a cell change', async () => {
    const onChange = vi.fn();
    render(<RosterGrid roster={roster} dates={dates} shifts={[shift(), night]} allShifts={[shift(), night]} onChange={onChange} />);
    const monday = screen.getByTestId('roster-cell-E1-2026-11-16') as HTMLSelectElement;
    expect(monday.value).toBe('s2');
    expect((screen.getByTestId('roster-cell-E1-2026-11-17') as HTMLSelectElement).value).toBe('SCHEDULE');
    await userEvent.selectOptions(screen.getByTestId('roster-cell-E1-2026-11-18'), 'REST');
    expect(onChange).toHaveBeenCalledWith('e1', '2026-11-18', 'REST');
  });

  it('is read-only without onChange', () => {
    render(<RosterGrid roster={roster} dates={dates} shifts={[shift()]} allShifts={[shift(), night]} />);
    expect(screen.queryByTestId('roster-cell-E1-2026-11-16')).toBeNull();
    expect(screen.getAllByTitle('Night')).toHaveLength(1);
  });

  it('bulk fills a range for the selected employees and validates the range', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(<RosterBulkForm employees={roster.employees} shifts={[shift(), night]} defaultFrom="2026-11-16" defaultTo="2026-11-18" maxDays={62} onApply={onApply} />);
    await userEvent.click(screen.getByTestId('roster-bulk-apply'));
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    await userEvent.click(screen.getByLabelText('E1 · Somchai'));
    await userEvent.selectOptions(screen.getByLabelText('Shift'), 's2');
    await userEvent.click(screen.getByTestId('roster-bulk-apply'));
    expect(onApply).toHaveBeenCalledWith(
      [
        { employeeId: 'e1', date: '2026-11-16' },
        { employeeId: 'e1', date: '2026-11-17' },
        { employeeId: 'e1', date: '2026-11-18' },
      ],
      's2',
    );
    await userEvent.clear(screen.getByLabelText('To'));
    await userEvent.type(screen.getByLabelText('To'), '2026-11-01');
    await userEvent.click(screen.getByTestId('roster-bulk-apply'));
    expect(screen.getByRole('alert')).toHaveTextContent('The end date must not be before the start date');
  });
});

describe('AttendanceDayTable', () => {
  const day: AttendanceDayView = {
    id: 'd1', employeeId: 'e1', employeeCode: 'E1', employeeName: 'Somchai Dee', departmentName: 'Ops', workDate: '2026-11-16',
    shiftId: 's2', shiftName: 'Night', shiftCode: 'N', shiftColor: null, scheduledStart: null, scheduledEnd: null, scheduledMinutes: 420,
    firstInAt: null, lastOutAt: null, scheduledStartLocal: '22:00', scheduledEndLocal: '06:00 +1', firstInLocal: '22:12', lastOutLocal: '06:00 +1',
    lateMinutes: 12, earlyLeaveMinutes: 0, workedMinutes: 408, status: 'LATE', computedAt: '2026-11-17T00:00:00Z',
  };
  it('renders API values (local clock, minutes, status) and links to the employee month', () => {
    render(<AttendanceDayTable days={[day]} rowLabel="employee" />);
    const row = screen.getByTestId('attendance-day-row');
    expect(within(row).getByText('22:12')).toBeInTheDocument();
    expect(within(row).getAllByText('06:00 +1').length).toBeGreaterThan(0);
    expect(within(row).getByText('12 min')).toBeInTheDocument();
    expect(within(row).getByText('6.8 h')).toBeInTheDocument();
    expect(within(row).getByText('Late')).toBeInTheDocument();
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/attendance/employees/e1');
  });
  it('shows the empty state', () => {
    render(<AttendanceDayTable days={[]} rowLabel="date" />);
    expect(screen.getByText('No attendance records')).toBeInTheDocument();
  });
});

describe('date helpers', () => {
  it('finds the Monday and month bounds', () => {
    expect(mondayOf('2026-11-22')).toBe('2026-11-16');
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});
