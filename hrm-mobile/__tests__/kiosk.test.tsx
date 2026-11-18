import { ApiError, type KioskInfo, type KioskPunchBatchInput, type KioskPunchBatchResponse } from '@hrm/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import type { QueuedPunch, QueueStore } from '@/features/checkin/queue';
import { KioskEnrol } from '@/features/kiosk/KioskEnrol';
import { KioskFlow } from '@/features/kiosk/KioskFlow';
import { outcomeFor } from '@/features/kiosk/KioskScreen';
import { Keypad } from '@/features/kiosk/Keypad';
import { enqueueKioskPunch, syncKioskQueue } from '@/features/kiosk/queue';
import { kioskQueueOwner } from '@/features/kiosk/store';
import { usePrefsStore } from '@/lib/i18n';
import { isKioskVariant } from '@/lib/variant';

// The kiosk always takes a photo (FR-ATT-03.3): a camera that is allowed and returns a picture.
jest.mock('expo-camera', () => {
  const { View } = jest.requireActual('react-native');
  return {
    CameraView: jest.requireActual('react').forwardRef((_props: object, ref: unknown) => {
      jest.requireActual('react').useImperativeHandle(ref, () => ({ takePictureAsync: async () => ({ uri: 'file:///photo.jpg' }) }));
      return <View testID="camera" />;
    }),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

const info = (over: Partial<KioskInfo> = {}): KioskInfo => ({
  id: 'k1',
  name: 'Front door',
  branch: { id: 'b1', name: 'ໂຮງງານ ນາໄຊ' },
  workspace: { name: 'SOM Demo', logoUrl: null },
  timeZone: 'Asia/Vientiane',
  serverTime: '2026-11-17T01:00:00.000Z',
  photoRequired: true,
  kioskEnabled: true,
  deviceTimeToleranceMinutes: 5,
  offlineAlertHours: 72,
  ...over,
});

/** In-memory QueueStore with the same contract as the SQLite one. */
const memoryStore = (): QueueStore & { rows: Map<string, QueuedPunch> } => {
  const rows = new Map<string, QueuedPunch>();
  return {
    rows,
    list: async (owner) => [...rows.values()].filter((r) => r.userId === owner).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
    add: async (p) => void (rows.has(p.clientRef) || rows.set(p.clientRef, { ...p })),
    update: async (ref, patch) => {
      const row = rows.get(ref);
      if (row) rows.set(ref, { ...row, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) });
    },
    remove: async (refs) => refs.forEach((r) => rows.delete(r)),
    getMeta: async () => null,
    setMeta: async () => undefined,
  };
};

beforeEach(() => {
  usePrefsStore.setState({ locale: 'lo' });
});

describe('variant', () => {
  it('is the employee app unless built with APP_VARIANT=kiosk', () => {
    expect(isKioskVariant()).toBe(false);
  });
});

describe('Keypad (FR-ATT-03.2)', () => {
  it('types digits and letters, deletes, clears and submits', () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    const { rerender } = render(<Keypad testID="pad" value="" onChange={onChange} onSubmit={onSubmit} maxLength={4} allowLetters />);
    fireEvent.press(screen.getByTestId('pad-toggle'));
    fireEvent.press(screen.getByTestId('pad-key-E'));
    expect(onChange).toHaveBeenLastCalledWith('E');
    rerender(<Keypad testID="pad" value="E00" onChange={onChange} onSubmit={onSubmit} maxLength={4} allowLetters />);
    fireEvent.press(screen.getByTestId('pad-toggle'));
    fireEvent.press(screen.getByTestId('pad-key-3'));
    expect(onChange).toHaveBeenLastCalledWith('E003');
    fireEvent.press(screen.getByTestId('pad-backspace'));
    expect(onChange).toHaveBeenLastCalledWith('E0');
    fireEvent.press(screen.getByTestId('pad-ok'));
    expect(onSubmit).toHaveBeenCalledWith('E00');
    expect(screen.getByTestId('pad-display')).toHaveTextContent('E00');
  });

  it('masks a PIN, ignores keys past the limit and submits automatically when full', () => {
    const onChange = jest.fn();
    const onSubmit = jest.fn();
    const { rerender } = render(<Keypad testID="pin" value="48291" onChange={onChange} onSubmit={onSubmit} maxLength={6} masked autoSubmit />);
    expect(screen.getByTestId('pin-display')).toHaveTextContent('•••••');
    fireEvent.press(screen.getByTestId('pin-key-3'));
    expect(onSubmit).toHaveBeenCalledWith('482913');
    rerender(<Keypad testID="pin" value="482913" onChange={onChange} onSubmit={onSubmit} maxLength={6} masked autoSubmit />);
    onChange.mockClear();
    fireEvent.press(screen.getByTestId('pin-key-1'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('pin-clear'));
    expect(onChange).toHaveBeenCalledWith('');
  });
});

const typeCode = (code: string) => {
  for (const ch of code) {
    const isLetter = /[A-Z]/.test(ch);
    if (isLetter) fireEvent.press(screen.getByTestId('kiosk-code-toggle'));
    fireEvent.press(screen.getByTestId(`kiosk-code-key-${ch}`));
    if (isLetter) fireEvent.press(screen.getByTestId('kiosk-code-toggle'));
  }
};

describe('KioskFlow (FR-ATT-03.1–03.3)', () => {
  it('runs idle → code → PIN → photo → confirmation with the name, then returns to idle', async () => {
    const submit = jest.fn().mockResolvedValue({ kind: 'done', employeeName: 'ບົວພັນ ສີສຸວັນ', punchKind: 'IN', capturedAt: '2026-11-17T01:02:00.000Z' });
    render(<KioskFlow info={info()} pending={2} submit={submit} resetAfterMs={50} />);
    expect(screen.getByTestId('kiosk-branch')).toHaveTextContent('ໂຮງງານ ນາໄຊ');
    expect(screen.getByTestId('kiosk-clock')).toBeTruthy();
    expect(screen.getByTestId('kiosk-pending')).toHaveTextContent('ລໍຖ້າສົ່ງ 2 ລາຍການ');

    fireEvent.press(screen.getByTestId('kiosk-start'));
    typeCode('E003');
    fireEvent.press(screen.getByTestId('kiosk-code-ok'));
    expect(screen.getByTestId('kiosk-pin-step')).toBeTruthy();
    for (const d of '482913') fireEvent.press(screen.getByTestId(`kiosk-pin-key-${d}`));

    // The photo is always taken (FR-ATT-03.3).
    fireEvent.press(await screen.findByTestId('selfie-take'));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ employeeCode: 'E003', pin: '482913', photoUri: 'file:///photo.jpg' }));
    expect(await screen.findByTestId('kiosk-result-name')).toHaveTextContent('ບົວພັນ ສີສຸວັນ');
    expect(screen.getByTestId('kiosk-result-kind')).toHaveTextContent('ລົງເວລາເຂົ້າ ສຳເລັດ');
    expect(screen.getByText('ເວລາ 08:02')).toBeTruthy();
    // Back to idle by itself.
    expect(await screen.findByTestId('kiosk-start')).toBeTruthy();
  });

  it('shows a refusal or an offline save, and cancels back to idle', async () => {
    const submit = jest
      .fn()
      .mockResolvedValueOnce({ kind: 'error', code: 'kiosk_invalid_credentials' })
      .mockResolvedValueOnce({ kind: 'queued', capturedAt: '2026-11-17T01:00:00.000Z' });
    render(<KioskFlow info={info()} pending={0} submit={submit} resetAfterMs={60_000} />);
    const punchOnce = async () => {
      fireEvent.press(screen.getByTestId('kiosk-start'));
      typeCode('123');
      fireEvent.press(screen.getByTestId('kiosk-code-ok'));
      for (const d of '111111') fireEvent.press(screen.getByTestId(`kiosk-pin-key-${d}`));
      fireEvent.press(await screen.findByTestId('selfie-take'));
    };
    await punchOnce();
    expect(await screen.findByTestId('kiosk-result-error')).toHaveTextContent('ລະຫັດພະນັກງານ ຫຼື PIN ບໍ່ຖືກຕ້ອງ');
    fireEvent.press(screen.getByTestId('kiosk-result'));
    await punchOnce();
    expect(await screen.findByTestId('kiosk-result-queued')).toHaveTextContent(/ຈະສົ່ງເມື່ອມີອິນເຕີເນັດ/);
    fireEvent.press(screen.getByTestId('kiosk-result'));

    fireEvent.press(screen.getByTestId('kiosk-start'));
    fireEvent.press(screen.getByTestId('kiosk-cancel'));
    expect(screen.getByTestId('kiosk-start')).toBeTruthy();
    expect(screen.queryByTestId('kiosk-pending')).toBeNull();
  });

  it('switches language on the idle screen and explains a disabled kiosk', () => {
    render(<KioskFlow info={info({ kioskEnabled: false })} pending={0} submit={jest.fn()} />);
    expect(screen.getByTestId('kiosk-disabled')).toHaveTextContent(/ສາຂານີ້ປິດໂໝດ Kiosk ແລ້ວ/);
    fireEvent.press(screen.getByTestId('kiosk-lang-en'));
    expect(screen.getByTestId('kiosk-disabled')).toHaveTextContent(/Kiosk mode is off for this branch/);
  });
});

describe('kiosk offline queue (FR-ATT-03 + FR-ATT-05)', () => {
  const owner = kioskQueueOwner({ id: 'k1' });
  const draft = (code: string, pin = '482913') => ({ employeeCode: code, pin, photoUri: 'file:///p.jpg', capturedAt: '2026-11-17T01:00:00.000Z' });

  it('queues with the PIN in SecureStore, uploads the photo, sends without a kind and forgets answered PINs', async () => {
    const store = memoryStore();
    const ok = await enqueueKioskPunch(store, owner, draft('E003'));
    const bad = await enqueueKioskPunch(store, owner, draft('E004', '111111'));
    expect(store.rows.get(ok)).toMatchObject({ employeeCode: 'E003', selfieUri: 'file:///p.jpg', status: 'pending' });
    expect(JSON.stringify([...store.rows.values()])).not.toContain('482913');
    expect(await SecureStore.getItemAsync(`hrm.kiosk.pin.${ok}`)).toBe('482913');

    const submit = jest.fn(async (body: KioskPunchBatchInput): Promise<KioskPunchBatchResponse> => ({
      serverTime: '2026-11-17T01:00:05.000Z',
      results: body.items.map((i) =>
        i.employeeCode === 'E003'
          ? { clientRef: i.clientRef, result: 'created', employee: { code: 'E003', name: 'Somchai' } }
          : { clientRef: i.clientRef, result: 'rejected', error: 'kiosk_invalid_credentials' },
      ),
    }));
    const uploadPhoto = jest.fn().mockResolvedValue('file-1');
    const outcome = await syncKioskQueue({ store, ownerId: owner, submit, uploadPhoto });

    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    const sent = submit.mock.calls[0]![0];
    expect(sent.items[0]).toEqual({ clientRef: ok, employeeCode: 'E003', pin: '482913', capturedAt: '2026-11-17T01:00:00.000Z', offline: false, selfieFileId: 'file-1' });
    expect(sent.items[0]).not.toHaveProperty('kind');
    expect(outcome.accepted.map((r) => r.clientRef)).toEqual([ok]);
    expect(outcome.rejected.map((r) => r.clientRef)).toEqual([bad]);
    // Answered punches leave the tablet, with their PINs.
    expect(store.rows.size).toBe(0);
    expect(await SecureStore.getItemAsync(`hrm.kiosk.pin.${ok}`)).toBeNull();
    expect(await SecureStore.getItemAsync(`hrm.kiosk.pin.${bad}`)).toBeNull();
  });

  it('keeps punches (and PINs) queued as offline records when the server cannot be reached', async () => {
    const store = memoryStore();
    const ref = await enqueueKioskPunch(store, owner, draft('E003'));
    const outcome = await syncKioskQueue({
      store,
      ownerId: owner,
      submit: jest.fn().mockRejectedValue(new ApiError(0, 'network', 'offline')),
      uploadPhoto: jest.fn().mockResolvedValue('file-1'),
    });
    expect(outcome.offline).toBe(true);
    expect(store.rows.get(ref)).toMatchObject({ status: 'pending', offline: true, selfieFileId: 'file-1' });
    expect(await SecureStore.getItemAsync(`hrm.kiosk.pin.${ref}`)).toBe('482913');
  });

  it('maps a sync answer to the confirmation', () => {
    expect(outcomeFor(undefined, 't')).toEqual({ kind: 'queued', capturedAt: 't' });
    expect(outcomeFor({ clientRef: 'r', result: 'rejected', error: 'account_locked' }, 't')).toEqual({ kind: 'error', code: 'account_locked' });
    expect(
      outcomeFor(
        {
          clientRef: 'r', result: 'replayed', employee: { code: 'E1', name: 'A B' },
          punch: {
            id: 'p', clientRef: 'r', kind: 'OUT', workDate: '2026-11-17', capturedAt: 'c', receivedAt: 'r', source: 'KIOSK', offline: true, offsite: false,
            offsiteReason: null, distanceMetres: null, accuracyMetres: null, suspicious: false, suspiciousReasons: [], reviewStatus: 'NONE',
          },
        },
        't',
      ),
    ).toEqual({ kind: 'done', employeeName: 'A B', punchKind: 'OUT', capturedAt: 'c' });
  });
});

describe('KioskEnrol (FR-ATT-03.1)', () => {
  it('requires a code, shows API errors and enrols with a valid one', async () => {
    const verify = jest.fn().mockRejectedValueOnce(new ApiError(401, 'kiosk_not_enrolled', 'x')).mockResolvedValue(info());
    const onEnrolled = jest.fn();
    render(<KioskEnrol verify={verify} onEnrolled={onEnrolled} />);
    fireEvent.press(screen.getByTestId('kiosk-enrol-submit'));
    expect(await screen.findByTestId('kiosk-enrol-code-error')).toHaveTextContent('ຈຳເປັນຕ້ອງໃສ່');
    fireEvent.changeText(screen.getByTestId('kiosk-enrol-code'), '  bad-code  ');
    fireEvent.press(screen.getByTestId('kiosk-enrol-submit'));
    expect(await screen.findByText('ອຸປະກອນນີ້ບໍ່ໄດ້ລົງທະບຽນ ຫຼື ລະຫັດບໍ່ຖືກຕ້ອງ')).toBeTruthy();
    expect(verify).toHaveBeenCalledWith('bad-code');
    fireEvent.changeText(screen.getByTestId('kiosk-enrol-code'), 'good-code');
    fireEvent.press(screen.getByTestId('kiosk-enrol-submit'));
    await waitFor(() => expect(onEnrolled).toHaveBeenCalledWith('good-code', info()));
  });
});
