import type { EmployeeWorkSchedule, ResolvedWorkPatternView, ScheduleOverrideRow, StandardScheduleView } from '@hrm/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OverrideManager } from '@/features/schedules/components/OverrideManager';
import { PatternForm } from '@/features/schedules/components/PatternForm';
import { WeekPattern } from '@/features/schedules/components/WeekPattern';
import { WorkScheduleView } from '@/features/schedules/components/WorkScheduleCard';
import { formatHours, parseDayHours, presetPattern } from '@/features/schedules/format';
import { ApiError } from '@/lib/api-client';

const LIMITS = { maxHoursPerDay: 8, maxHoursPerWeek: 48 };
const SIX = [0, 8, 8, 8, 8, 8, 8];
const HALF_SAT = [0, 8, 8, 8, 8, 8, 4];

const pattern = (over: Partial<ResolvedWorkPatternView> = {}): ResolvedWorkPatternView => ({
  source: 'standard', scheduleId: 's1', effectiveFrom: '2026-11-16', dayHours: SIX, workingDays: [1, 2, 3, 4, 5, 6], weeklyHours: 48, label: null, ...over,
});

const standard: StandardScheduleView = {
  asOf: '2026-11-16',
  current: { id: 's1', effectiveFrom: '2026-11-16', dayHours: SIX, weeklyHours: 48, reason: null, createdByName: null, createdAt: '2026-11-16T00:00:00.000Z' },
  scheduled: [],
  history: [],
  limits: LIMITS,
};

describe('schedule formatting', () => {
  it('formats hours, parses inputs and builds presets from the standard day', () => {
    expect(formatHours(8)).toBe('8');
    expect(formatHours(7.5)).toBe('7.5');
    expect(parseDayHours(['', '8', '8', '8', '8', '8', '4'])).toEqual(HALF_SAT);
    expect(parseDayHours(['x', '8', '8', '8', '8', '8', '4'])).toBeNull();
    expect(presetPattern('sixDays', LIMITS)).toEqual(SIX);
    expect(presetPattern('fiveDays', LIMITS)).toEqual([0, 8, 8, 8, 8, 8, 0]);
    expect(presetPattern('halfSaturday', LIMITS)).toEqual(HALF_SAT);
  });
});

describe('WeekPattern', () => {
  it('shows Monday first, hours for working days and "off" for rest days', () => {
    render(<WeekPattern dayHours={HALF_SAT} data-testid="w" />);
    const items = within(screen.getByTestId('w')).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('ຈັນ8');
    expect(items[5]).toHaveTextContent('ເສົາ4');
    expect(items[6]).toHaveTextContent('ອາທິດພັກ');
  });
});

describe('PatternForm', () => {
  it('blocks a week above the legal 48 h before calling the API', async () => {
    const onSubmit = vi.fn();
    render(<PatternForm idPrefix="p" initialDayHours={SIX} limits={LIMITS} today="2026-11-16" onSubmit={onSubmit} />);
    await userEvent.clear(screen.getByLabelText('ອາທິດ'));
    await userEvent.type(screen.getByLabelText('ອາທິດ'), '8');
    await userEvent.type(screen.getByLabelText(/ເຫດຜົນ/), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'ບັນທຶກ' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('p-pattern-error')).toHaveTextContent('ຊົ່ວໂມງຕໍ່ອາທິດເກີນຂອບເຂດ');
  });

  it('applies a preset and submits hours, date, reason and label', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PatternForm idPrefix="p" initialDayHours={SIX} limits={LIMITS} today="2026-11-16" withLabel onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: 'ຈັນ–ສຸກ + ເສົາເຄິ່ງມື້' }));
    await userEvent.type(screen.getByLabelText(/ຊື່ຕາຕະລາງ/), 'Half Sat');
    await userEvent.type(screen.getByLabelText(/ເຫດຜົນ/), 'contract');
    await userEvent.click(screen.getByRole('button', { name: 'ບັນທຶກ' }));
    expect(onSubmit).toHaveBeenCalledWith({ dayHours: HALF_SAT, effectiveFrom: '2026-11-16', reason: 'contract', label: 'Half Sat' });
  });

  it('shows an API date error under the effective date', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, 'effective_date_in_past', 'x', { field: 'effectiveFrom' }));
    render(<PatternForm idPrefix="p" initialDayHours={SIX} limits={LIMITS} today="2026-11-16" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/ເຫດຜົນ/), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'ບັນທຶກ' }));
    expect(await screen.findByText('ວັນທີມີຜົນຕ້ອງບໍ່ແມ່ນອະດີດ')).toBeInTheDocument();
  });
});

describe('WorkScheduleView', () => {
  it('shows an individual schedule with its days, hours and upcoming revert', () => {
    const schedule: EmployeeWorkSchedule = {
      employeeId: 'e1',
      asOf: '2026-11-16',
      current: pattern({ source: 'override', scheduleId: 'o1', dayHours: HALF_SAT, weeklyHours: 44, label: 'Half Sat' }),
      upcoming: [{ id: 'a2', effectiveFrom: '2026-12-01', source: 'standard', dayHours: null, label: null, reason: 'x', createdByName: null, createdAt: '' }],
      history: [],
    };
    render(<WorkScheduleView schedule={schedule} />);
    expect(screen.getByTestId('schedule-source')).toHaveTextContent('ສະເພາະບຸກຄົນ');
    expect(screen.getByTestId('schedule-summary')).toHaveTextContent('6 ມື້ · 44 ຊມ/ອາທິດ');
    expect(screen.getByTestId('schedule-upcoming')).toHaveTextContent('2026-12-01');
    expect(screen.getByTestId('schedule-upcoming')).toHaveTextContent('ກັບໄປໃຊ້ມາດຕະຖານ');
  });

  it('labels the standard', () => {
    render(<WorkScheduleView schedule={{ employeeId: 'e1', asOf: '2026-11-16', current: pattern(), upcoming: [], history: [] }} />);
    expect(screen.getByTestId('schedule-source')).toHaveTextContent('ມາດຕະຖານ');
  });
});

describe('OverrideManager', () => {
  const rows: ScheduleOverrideRow[] = [
    { employee: { id: 'e1', employeeCode: 'E1', name: 'A One' }, current: pattern({ source: 'override', dayHours: HALF_SAT }), next: null },
    {
      employee: { id: 'e2', employeeCode: 'E2', name: 'B Two' },
      current: pattern(),
      next: { id: 'a1', effectiveFrom: '2026-12-01', source: 'override', dayHours: HALF_SAT, label: 'Half Sat', reason: null, createdByName: null, createdAt: '' },
    },
  ];

  it('lists overrides and scheduled ones, and bulk-reverts only employees on an override', async () => {
    const onRevert = vi.fn().mockResolvedValue({ count: 1 });
    render(<OverrideManager rows={rows} standard={standard} onApply={vi.fn()} onRevert={onRevert} />);
    expect(screen.getByTestId('override-row-E2')).toHaveTextContent('ແຕ່ 2026-12-01: Half Sat');
    expect(screen.getByTestId('bulk-revert')).toBeDisabled();

    await userEvent.click(screen.getByLabelText('E2 · B Two'));
    expect(screen.getByTestId('bulk-revert')).toBeDisabled(); // E2 is still on the standard today
    await userEvent.click(screen.getByLabelText('E1 · A One'));
    await userEvent.click(screen.getByTestId('bulk-revert'));

    const form = screen.getByTestId('revert-form');
    await userEvent.type(within(form).getByLabelText(/ເຫດຜົນ/), 'back');
    // jsdom has no showModal(), so dialog content counts as hidden for role queries.
    await userEvent.click(within(form).getByRole('button', { name: 'ກັບໄປໃຊ້ມາດຕະຖານ', hidden: true }));
    expect(onRevert).toHaveBeenCalledWith({ employeeIds: ['e1'], effectiveFrom: '2026-11-16', reason: 'back' });
    expect(screen.queryByTestId('revert-form')).not.toBeInTheDocument();
  });

  it('shows the empty state when everyone works the standard', () => {
    render(<OverrideManager rows={[]} standard={standard} onApply={vi.fn()} onRevert={vi.fn()} />);
    expect(screen.getByText('ທຸກຄົນໃຊ້ຕາຕະລາງມາດຕະຖານ')).toBeInTheDocument();
  });
});
