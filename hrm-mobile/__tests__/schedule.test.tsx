import { render, screen } from '@testing-library/react-native';
import type { EmployeeWorkSchedule, ResolvedWorkPatternView } from '@hrm/shared';
import { WorkScheduleSummary } from '@/features/schedule/MyWorkScheduleCard';
import { usePrefsStore } from '@/lib/i18n';

beforeEach(() => usePrefsStore.setState({ locale: 'lo' }));

const current = (over: Partial<ResolvedWorkPatternView> = {}): ResolvedWorkPatternView => ({
  source: 'standard',
  scheduleId: 's1',
  effectiveFrom: '2026-11-16',
  dayHours: [0, 8, 8, 8, 8, 8, 8],
  workingDays: [1, 2, 3, 4, 5, 6],
  weeklyHours: 48,
  label: null,
  ...over,
});
const schedule = (over: Partial<EmployeeWorkSchedule> = {}): EmployeeWorkSchedule => ({
  employeeId: 'e1', asOf: '2026-11-16', current: current(), upcoming: [], history: [], ...over,
});

describe('WorkScheduleSummary', () => {
  it('shows the standard schedule with days and weekly hours', () => {
    render(<WorkScheduleSummary schedule={schedule()} />);
    expect(screen.getByText('ມາດຕະຖານ')).toBeTruthy();
    expect(screen.getByTestId('my-schedule-summary').props.children).toBe('6 ມື້ · 48 ຊມ/ອາທິດ');
    expect(screen.getByTestId('my-schedule-day-0')).toHaveTextContent('ອາທິດພັກ');
    expect(screen.getByTestId('my-schedule-day-1')).toHaveTextContent('ຈັນ8');
    expect(screen.queryByTestId('my-schedule-next')).toBeNull();
  });

  it('shows an individual schedule, a half-day Saturday and the next change', () => {
    render(
      <WorkScheduleSummary
        schedule={schedule({
          current: current({ source: 'override', dayHours: [0, 8, 8, 8, 8, 8, 4], weeklyHours: 44, label: 'Half Sat' }),
          upcoming: [{ id: 'a1', effectiveFrom: '2027-01-01', source: 'standard', dayHours: null, label: null, reason: null, createdByName: null, createdAt: '' }],
        })}
      />,
    );
    expect(screen.getByText('ສະເພາະບຸກຄົນ')).toBeTruthy();
    expect(screen.getByTestId('my-schedule-day-6')).toHaveTextContent('ເສົາ4');
    expect(screen.getByText(/Half Sat/)).toBeTruthy();
    expect(screen.getByTestId('my-schedule-next')).toHaveTextContent('ແຕ່ 2027-01-01: ກັບໄປໃຊ້ມາດຕະຖານ');
  });
});
