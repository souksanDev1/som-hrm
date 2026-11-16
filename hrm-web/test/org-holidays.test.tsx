import type { Holiday } from '@hrm/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HolidayList } from '@/features/holidays/components/HolidayList';
import { parseHolidayForm } from '@/features/holidays/form';
import { EntityFormDialog } from '@/features/org/components/EntityFormDialog';
import { OrgEntityList } from '@/features/org/components/OrgEntityList';
import { apiFieldErrors, parseBranchForm, parsePositionForm } from '@/features/org/forms';
import { ApiError } from '@/lib/api-client';
import { usePrefsStore } from '@/lib/i18n';

beforeEach(() => {
  usePrefsStore.setState({ locale: 'lo' });
  // jsdom has no <dialog> methods; open/close by attribute.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

describe('parseBranchForm (geofence)', () => {
  const base = { name: 'HQ', address: '', latitude: '', longitude: '', geofenceRadius: '150' };
  it('accepts a complete geofence and an empty one', () => {
    expect(parseBranchForm({ ...base, latitude: '17.97', longitude: '102.63' })).toEqual({
      ok: true,
      data: { name: 'HQ', latitude: 17.97, longitude: 102.63, geofenceRadius: 150 },
    });
    expect(parseBranchForm(base)).toMatchObject({ ok: true, data: { latitude: null, longitude: null } });
  });
  it('rejects out-of-range, half-filled and non-numeric values', () => {
    expect(parseBranchForm({ ...base, latitude: '95', longitude: '100' })).toEqual({ ok: false, errors: { latitude: 'invalid_latitude' } });
    expect(parseBranchForm({ ...base, latitude: '17' })).toEqual({ ok: false, errors: { latitude: 'geofence_incomplete', longitude: 'geofence_incomplete' } });
    expect(parseBranchForm({ ...base, geofenceRadius: '5' })).toEqual({ ok: false, errors: { geofenceRadius: 'invalid_radius' } });
    expect(parseBranchForm({ ...base, geofenceRadius: '' })).toEqual({ ok: false, errors: { geofenceRadius: 'invalid_radius' } });
    expect(parseBranchForm({ ...base, longitude: 'abc', latitude: '1' })).toEqual({ ok: false, errors: { longitude: 'invalid_longitude' } });
  });
  it('parses position levels', () => {
    expect(parsePositionForm({ name: 'Clerk', level: '3' })).toEqual({ ok: true, data: { name: 'Clerk', level: 3 } });
    expect(parsePositionForm({ name: '', level: '1' })).toEqual({ ok: false, errors: { name: 'required' } });
  });
  it('maps API errors onto fields', () => {
    expect(apiFieldErrors(new ApiError(400, 'geofence_incomplete', 'x', { fields: ['latitude', 'longitude'] }))).toEqual({
      latitude: 'geofence_incomplete',
      longitude: 'geofence_incomplete',
    });
    expect(apiFieldErrors(new ApiError(409, 'name_taken', 'x'))).toEqual({ name: 'name_taken' });
    expect(apiFieldErrors(new ApiError(409, 'has_open_children', 'x'))).toEqual({ form: 'has_open_children' });
  });
});

describe('OrgEntityList close / reopen', () => {
  const props = { title: 'ສາຂາ', testId: 'branches', canEdit: true, onCreate: vi.fn(), onDelete: vi.fn() };

  it('confirms before closing and reopens directly; closed rows are marked', async () => {
    const onSetActive = vi.fn().mockResolvedValue(undefined);
    render(
      <OrgEntityList
        {...props}
        items={[{ id: 'a', name: 'Pakse', isActive: true }, { id: 'b', name: 'Old', isActive: false }]}
        onSetActive={onSetActive}
      />,
    );
    expect(screen.getByText('ປິດແລ້ວ')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ປິດ Pakse' }));
    expect(onSetActive).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId('confirm-accept'));
    expect(onSetActive).toHaveBeenCalledWith('a', false);
    await userEvent.click(screen.getByRole('button', { name: 'ເປີດຄືນ Old' }));
    expect(onSetActive).toHaveBeenCalledWith('b', true);
  });

  it('keeps the old rename behaviour when no onEdit/onSetActive is given', () => {
    render(<OrgEntityList {...props} items={[{ id: 'a', name: 'Pakse' }]} onRename={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'ປ່ຽນຊື່ Pakse' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ປິດ Pakse' })).toBeNull();
  });

  it('suggests closing when a delete fails because the item is in use', () => {
    render(<OrgEntityList {...props} items={[]} error={new ApiError(409, 'in_use', 'x')} onSetActive={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('ໃຫ້ປິດແທນການລຶບ');
  });
});

describe('EntityFormDialog', () => {
  it('shows local validation errors and submits parsed data', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <EntityFormDialog
        open
        title="Edit"
        testId="branch-form"
        fields={[
          { name: 'name', label: 'Name' },
          { name: 'latitude', label: 'Lat', type: 'number' },
          { name: 'longitude', label: 'Lng', type: 'number' },
          { name: 'geofenceRadius', label: 'Radius', type: 'number' },
        ]}
        initial={{ name: 'HQ', latitude: '', longitude: '', geofenceRadius: '150' }}
        parse={parseBranchForm}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );
    await userEvent.type(screen.getByLabelText('Lat'), '17.5');
    await userEvent.click(screen.getByTestId('branch-form-save'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText('ກະລຸນາໃສ່ທັງລະຕິຈູດ ແລະ ລອງຈິຈູດ')).toHaveLength(2);

    await userEvent.type(screen.getByLabelText('Lng'), '102.6');
    await userEvent.click(screen.getByTestId('branch-form-save'));
    expect(onSubmit).toHaveBeenCalledWith({ name: 'HQ', latitude: 17.5, longitude: 102.6, geofenceRadius: 150 });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows API errors under the field', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(409, 'date_taken', 'x', { fields: ['date'] }));
    render(
      <EntityFormDialog
        open
        title="Holiday"
        testId="holiday-form"
        fields={[
          { name: 'date', label: 'Date', type: 'date' },
          { name: 'nameLo', label: 'Lo' },
          { name: 'nameEn', label: 'En' },
          { name: 'womenOnly', label: 'Women', type: 'checkbox' },
        ]}
        initial={{ date: '2027-10-21', nameLo: 'ບຸນ', nameEn: 'Boun', kind: 'TRADITIONAL', womenOnly: '', nationality: '' }}
        parse={parseHolidayForm}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByLabelText('Women'));
    await userEvent.click(screen.getByTestId('holiday-form-save'));
    expect(onSubmit).toHaveBeenCalledWith({ date: '2027-10-21', nameLo: 'ບຸນ', nameEn: 'Boun', kind: 'TRADITIONAL', womenOnly: true, nationality: null });
    expect(await screen.findByText('ມີວັນພັກໃນວັນທີນີ້ແລ້ວ')).toBeInTheDocument();
  });
});

describe('holiday form + list', () => {
  it('requires a nationality for a national day', () => {
    expect(parseHolidayForm({ date: '2027-09-02', nameLo: 'x', nameEn: 'x', kind: 'NATIONAL_DAY', womenOnly: '', nationality: ' ' })).toEqual({
      ok: false,
      errors: { nationality: 'nationality_required' },
    });
    expect(parseHolidayForm({ date: '2027-02-30', nameLo: 'x', nameEn: 'x', kind: 'PUBLIC', womenOnly: '', nationality: '' })).toEqual({
      ok: false,
      errors: { date: 'invalid_date' },
    });
  });

  it('lists holidays with kind, women-only and nationality badges', async () => {
    const h = (over: Partial<Holiday>): Holiday => ({
      id: over.date ?? 'x', date: '2027-01-01', nameLo: 'ປີໃໝ່', nameEn: 'New Year', kind: 'PUBLIC', womenOnly: false, nationality: null, isDefault: true, ...over,
    });
    const onDelete = vi.fn();
    render(
      <HolidayList
        canEdit
        onEdit={vi.fn()}
        onDelete={onDelete}
        holidays={[h({}), h({ date: '2027-03-08', nameLo: 'ວັນແມ່ຍິງ', womenOnly: true }), h({ date: '2027-09-02', nameLo: 'ວັນຊາດຫວຽດນາມ', kind: 'NATIONAL_DAY', nationality: 'Vietnamese', isDefault: false })]}
      />,
    );
    const rows = screen.getAllByTestId('holiday-row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText('ສະເພາະພະນັກງານຍິງ')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('ວັນຊາດ (ຕາມສັນຊາດ)')).toBeInTheDocument();
    expect(within(rows[2]!).getByText('ສັນຊາດ: Vietnamese')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ລຶບ ວັນຊາດຫວຽດນາມ' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ date: '2027-09-02' }));
  });
});
