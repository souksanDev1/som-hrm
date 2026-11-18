import type { KioskDevice } from '@hrm/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { visibleNav } from '@/components/layout/nav';
import { EnrolKioskDialog } from '@/features/kiosks/components/EnrolKioskDialog';
import { KioskList, localDateTime } from '@/features/kiosks/components/KioskList';
import { ApiError } from '@/lib/api-client';

const kiosk = (over: Partial<KioskDevice> = {}): KioskDevice => ({
  id: 'k1',
  name: 'Front door',
  branchId: 'b1',
  branchName: 'Factory',
  enrolledByName: 'HR Admin',
  lastSeenAt: '2026-11-17T01:05:00.000Z',
  revokedAt: null,
  createdAt: '2026-11-16T02:00:00.000Z',
  ...over,
});

describe('KioskList (FR-ATT-03.1)', () => {
  it('shows branch, last seen and status, and revokes after confirmation', async () => {
    const onRevoke = vi.fn().mockResolvedValue(undefined);
    render(<KioskList kiosks={[kiosk(), kiosk({ id: 'k2', name: 'Old tablet', lastSeenAt: null, revokedAt: '2026-11-17T00:00:00.000Z' })]} onRevoke={onRevoke} />);
    const rows = screen.getAllByTestId('kiosk-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Factory');
    expect(rows[0]).toHaveTextContent(localDateTime('2026-11-17T01:05:00.000Z'));
    expect(rows[0]).toHaveTextContent('HR Admin');
    expect(rows[1]).toHaveTextContent('ຍັງບໍ່ເຄີຍເຊື່ອມຕໍ່');
    expect(rows[1]).toHaveTextContent('ຖືກຖອນສິດ');
    // Only the active kiosk can be revoked.
    expect(screen.getAllByTestId('kiosk-revoke')).toHaveLength(1);

    await userEvent.click(screen.getByTestId('kiosk-revoke'));
    expect(screen.getByText(/Front door/, { selector: 'p' })).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('confirm-accept'));
    expect(onRevoke).toHaveBeenCalledWith('k1');
  });

  it('shows the API error of a failed revoke and an empty state', async () => {
    const onRevoke = vi.fn().mockRejectedValue(new ApiError(409, 'kiosk_already_revoked', 'x'));
    const { unmount } = render(<KioskList kiosks={[kiosk()]} onRevoke={onRevoke} />);
    await userEvent.click(screen.getByTestId('kiosk-revoke'));
    await userEvent.click(screen.getByTestId('confirm-accept'));
    expect(await screen.findByTestId('kiosk-error')).toHaveTextContent('ອຸປະກອນນີ້ຖືກຖອນສິດແລ້ວ');
    unmount();
    render(<KioskList kiosks={[]} onRevoke={onRevoke} />);
    expect(screen.getByText('ຍັງບໍ່ມີອຸປະກອນ Kiosk')).toBeInTheDocument();
  });
});

describe('EnrolKioskDialog', () => {
  const branches = [
    { value: 'b1', label: 'Factory' },
    { value: 'b2', label: 'Warehouse' },
  ];

  it('validates, enrols and shows the enrol code once', async () => {
    const onEnrol = vi.fn().mockResolvedValue({ kiosk: kiosk(), enrolCode: 'CODE-abcdefghijklmnopqrstuvwxyz0123456789' });
    render(<EnrolKioskDialog open branches={branches} onEnrol={onEnrol} onClose={vi.fn()} />);
    await userEvent.click(screen.getByTestId('kiosk-enrol-submit'));
    expect(onEnrol).not.toHaveBeenCalled();
    expect(screen.getAllByText('ຈຳເປັນຕ້ອງໃສ່')).toHaveLength(2);

    await userEvent.selectOptions(screen.getByLabelText(/ສາຂາ/), 'b2');
    await userEvent.type(screen.getByLabelText(/ຊື່ອຸປະກອນ/), ' Gate tablet ');
    await userEvent.click(screen.getByTestId('kiosk-enrol-submit'));
    expect(onEnrol).toHaveBeenCalledWith({ branchId: 'b2', name: 'Gate tablet' });
    expect(await screen.findByTestId('kiosk-enrol-code')).toHaveTextContent('CODE-abcdefghijklmnopqrstuvwxyz0123456789');
    expect(screen.getByTestId('kiosk-code-step')).toHaveTextContent('ສະແດງຄັ້ງດຽວເທົ່ານັ້ນ');
  });

  it('shows API errors and explains when no branch uses kiosk mode', async () => {
    const onEnrol = vi.fn().mockRejectedValue(new ApiError(400, 'kiosk_mode_disabled', 'x'));
    const { unmount } = render(<EnrolKioskDialog open branches={branches.slice(0, 1)} onEnrol={onEnrol} onClose={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/ຊື່ອຸປະກອນ/), 'Tab');
    await userEvent.click(screen.getByTestId('kiosk-enrol-submit'));
    expect(onEnrol).toHaveBeenCalledWith({ branchId: 'b1', name: 'Tab' });
    expect(await screen.findByText('ສາຂານີ້ຍັງບໍ່ໄດ້ເປີດໃຊ້ໂໝດ Kiosk')).toBeInTheDocument();
    unmount();
    render(<EnrolKioskDialog open branches={[]} onEnrol={onEnrol} onClose={vi.fn()} />);
    expect(screen.getByTestId('kiosk-no-branch')).toBeInTheDocument();
    expect(screen.getByTestId('kiosk-enrol-submit')).toBeDisabled();
  });
});

describe('nav', () => {
  it('shows Kiosk devices only with kiosk.manage', () => {
    expect(visibleNav(['kiosk.manage']).map((i) => i.href)).toContain('/settings/kiosks');
    expect(visibleNav(['org.write']).map((i) => i.href)).not.toContain('/settings/kiosks');
  });
});
