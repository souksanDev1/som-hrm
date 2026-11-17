import type { ParameterView } from '@hrm/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ParameterBoard } from '@/features/settings/parameters/components/ParameterBoard';
import { ScheduleChangeForm } from '@/features/settings/parameters/components/ScheduleChangeForm';
import { fill, formatParameterValue, parseParameterInput } from '@/features/settings/parameters/format';
import { ApiError } from '@/lib/api-client';

const escalation: ParameterView = {
  key: 'approval.escalationWorkingDays', labelKey: 'param.approval.escalationWorkingDays', type: 'int', unit: 'days',
  min: 1, max: 30, legalMin: null, legalMax: null, maxItems: null, defaultValue: 2, currentValue: 2, source: 'default', scheduled: [], history: [],
};

describe('parameter formatting', () => {
  const t = (k: string) => ({ 'param.unit.days': 'days', 'param.enabled': 'On', 'param.disabled': 'Off' })[k] ?? k;
  it('formats values with units', () => {
    expect(formatParameterValue(t, { type: 'intList', unit: 'days' }, [90, 30])).toBe('90, 30 days');
    expect(formatParameterValue(t, { type: 'boolean', unit: null }, true)).toBe('On');
  });
  it('parses form input by type', () => {
    expect(parseParameterInput('int', ' 12 ')).toBe(12);
    expect(parseParameterInput('int', '1.5')).toBeNull();
    // unit timeOfDay: minutes after midnight shown and typed as HH:mm (ot.nightStart / ot.nightEnd)
    expect(parseParameterInput('int', '22:00', 'timeOfDay')).toBe(1320);
    expect(parseParameterInput('int', '1320', 'timeOfDay')).toBeNull();
    expect(formatParameterValue(t, { type: 'int', unit: 'timeOfDay' }, 300)).toBe('05:00');
    expect(parseParameterInput('intList', '90, 60,30')).toEqual([90, 60, 30]);
    expect(parseParameterInput('intList', '90, x')).toBeNull();
    expect(parseParameterInput('boolean', 'false')).toBe(false);
  });
  it('fills placeholders', () => {
    expect(fill('Allowed {min}–{max}', { min: 1, max: 30 })).toBe('Allowed 1–30');
  });
});

describe('ScheduleChangeForm', () => {
  it('validates locally before calling the API', async () => {
    const onSubmit = vi.fn();
    render(<ScheduleChangeForm parameter={escalation} defaultEffectiveFrom="2026-11-16" onSubmit={onSubmit} />);
    const value = screen.getByLabelText(/ຄ່າໃໝ່/);
    await userEvent.clear(value);
    await userEvent.type(value, '99');
    await userEvent.click(screen.getByRole('button', { name: 'ບັນທຶກ' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(value).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('ຄ່າຢູ່ນອກຂອບເຂດທີ່ອະນຸຍາດ')).toBeInTheDocument();
  });

  it('shows API errors under the field named in details.field', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(400, 'effective_date_in_past', 'x', { field: 'effectiveFrom' }));
    render(<ScheduleChangeForm parameter={escalation} defaultEffectiveFrom="2026-11-16" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/ເຫດຜົນ/), 'policy');
    await userEvent.click(screen.getByRole('button', { name: 'ບັນທຶກ' }));
    expect(onSubmit).toHaveBeenCalledWith({ value: 2, effectiveFrom: '2026-11-16', reason: 'policy' });
    expect(await screen.findByText('ວັນທີມີຜົນຕ້ອງບໍ່ແມ່ນອະດີດ')).toBeInTheDocument();
    expect(screen.getByLabelText(/ມີຜົນແຕ່/)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('ParameterBoard', () => {
  it('offers "schedule change" per parameter when canEdit is a function', () => {
    const alertDays: ParameterView = {
      ...escalation, key: 'document.expiryAlertDays', labelKey: 'param.document.expiryAlertDays', type: 'intList',
      defaultValue: [90, 60, 30, 7], currentValue: [90, 60, 30, 7], maxItems: 6,
    };
    render(
      <ParameterBoard
        items={[escalation, alertDays]}
        canEdit={(p) => p.key === 'document.expiryAlertDays'}
        defaultEffectiveFrom="2026-11-17"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button', { name: /param.scheduleChange|ກຳນົດ|Schedule/ })).toHaveLength(1);
  });
});
