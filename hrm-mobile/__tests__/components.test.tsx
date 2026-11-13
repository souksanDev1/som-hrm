import { fireEvent, render, screen } from '@testing-library/react-native';
import type { OrgChartNode } from '@hrm/shared';
import { Button, StateScreen, TextField } from '@/components/ui';
import { flattenOrg } from '@/features/org/OrgList';
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
  it('flags a work permit expiring within 30 days', () => {
    render(<ExpiryBadge expiresAt="2026-01-20" now={new Date('2026-01-01T00:00:00Z')} />);
    expect(screen.getByTestId('expiry-D30')).toBeTruthy();
  });
});

describe('flattenOrg', () => {
  it('flattens depth-first with depth', () => {
    const n = (id: string, children: OrgChartNode[] = []): OrgChartNode => ({ id, employeeCode: id, name: id, position: null, department: null, children });
    const rows = flattenOrg([n('a', [n('b', [n('c')]), n('d')])]);
    expect(rows.map((r) => `${r.node.id}${r.depth}`)).toEqual(['a0', 'b1', 'c2', 'd1']);
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
