import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button, StateScreen, TextField } from '@/components/ui';
import { ExpiryBadge } from '@/features/profile/ExpiryBadge';
import { usePrefsStore } from '@/lib/i18n';

beforeEach(() => usePrefsStore.setState({ locale: 'lo' }));

describe('StateScreen', () => {
  it.each([
    ['offline', 'ບໍ່ມີອິນເຕີເນັດ'],
    ['outOfZone', 'ຢູ່ນອກເຂດລົງເວລາ'],
    ['gpsOff', 'GPS ປິດຢູ່'],
    ['syncPending', 'ລໍຖ້າສົ່ງຂໍ້ມູນ'],
  ] as const)('%s shows its Lao title', (kind, title) => {
    render(<StateScreen kind={kind} />);
    expect(screen.getByTestId(`state-${kind}`)).toBeTruthy();
    expect(screen.getByText(title)).toBeTruthy();
  });

  it('offers retry and an extra action', () => {
    const onRetry = jest.fn();
    const onPress = jest.fn();
    render(<StateScreen kind="outOfZone" onRetry={onRetry} action={{ label: 'ຂໍແກ້ເວລາ', onPress }} />);
    fireEvent.press(screen.getByTestId('state-retry'));
    fireEvent.press(screen.getByText('ຂໍແກ້ເວລາ'));
    expect(onRetry).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalled();
  });
});

describe('Button', () => {
  it('does not fire while loading', () => {
    const onPress = jest.fn();
    render(<Button title="Save" loading onPress={onPress} testID="b" />);
    fireEvent.press(screen.getByTestId('b'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('ExpiryBadge', () => {
  it('renders the API status and threshold without computing dates', () => {
    render(<ExpiryBadge expiryStatus="EXPIRING" expiryThresholdDays={7} />);
    expect(screen.getByTestId('expiry-EXPIRING')).toBeTruthy();
    expect(screen.getByText('ໝົດອາຍຸພາຍໃນ 7 ມື້')).toBeTruthy();
  });
  it('renders expired documents', () => {
    render(<ExpiryBadge expiryStatus="EXPIRED" expiryThresholdDays={null} />);
    expect(screen.getByText('ໝົດອາຍຸແລ້ວ')).toBeTruthy();
  });
});

describe('TextField', () => {
  it('shows a Lao show/hide toggle for secure fields', () => {
    render(<TextField label="PIN" secureTextEntry testID="pin" value="482913" />);
    expect(screen.getByTestId('pin').props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByLabelText('ສະແດງລະຫັດ'));
    expect(screen.getByTestId('pin').props.secureTextEntry).toBe(false);
    fireEvent.press(screen.getByTestId('pin-toggle'));
    expect(screen.getByTestId('pin').props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('ສະແດງລະຫັດ')).toBeTruthy();
  });

  it('has no toggle for plain fields', () => {
    render(<TextField label="Name" testID="name" />);
    expect(screen.queryByTestId('name-toggle')).toBeNull();
  });
});
