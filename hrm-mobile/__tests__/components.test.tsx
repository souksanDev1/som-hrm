import { fireEvent, render, screen } from '@testing-library/react-native';
import type { OrgChartNode } from '@hrm/shared';
import { FlatList, Text } from 'react-native';
import { Button, StateScreen, TextField } from '@/components/ui';
import { flattenOrg, OrgList } from '@/features/org/OrgList';
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

describe('OrgList', () => {
  const n = (id: string, children: OrgChartNode[] = []): OrgChartNode => ({ id, employeeCode: `E-${id}`, name: id, position: null, department: null, children });

  it('flattens depth-first with depth', () => {
    const rows = flattenOrg([n('a', [n('b', [n('c')]), n('d')]), n('e')]);
    expect(rows.map((r) => `${r.node.id}${r.depth}`)).toEqual(['a0', 'b1', 'c2', 'd1', 'e0']);
    expect(flattenOrg([])).toEqual([]);
  });

  it('keeps fixed virtualized row extents including gaps and hierarchy indentation', () => {
    render(<OrgList roots={[n('a', [n('b', [n('c')]), n('d')])]} />);
    const list = screen.UNSAFE_getByType(FlatList);
    expect(list.props.initialNumToRender).toBe(20);
    expect(list.props.windowSize).toBe(7);
    expect(list.props.removeClippedSubviews).toBe(true);
    expect(list.props.getItemLayout(null, 2)).toEqual({ length: 96, offset: 192, index: 2 });
    expect(list.props.keyExtractor(list.props.data[2])).toBe('c');
    expect(screen.getAllByTestId('org-node').map((node) => node.props.children)).toEqual(['a', 'b', 'c', 'd']);
    expect(screen.getByTestId('org-row-a')).toHaveStyle({ height: 96, paddingBottom: 12, paddingLeft: 0 });
    expect(screen.getByTestId('org-row-c')).toHaveStyle({ height: 96, paddingBottom: 12, paddingLeft: 24 });
  });

  it('caps visual indentation but announces the full hierarchy level', () => {
    usePrefsStore.setState({ locale: 'en' });
    let tree = n('leaf');
    for (let depth = 7; depth >= 1; depth--) tree = n(`level-${depth}`, [tree]);
    render(<OrgList roots={[tree]} />);
    expect(screen.getByTestId('org-row-leaf')).toHaveStyle({ paddingLeft: 72 });
    expect(screen.getByLabelText('leaf, E-leaf, Organization level 8')).toBeTruthy();
  });

  it('renders the real subtitle or staff code and localizes the hierarchy label', () => {
    render(<OrgList roots={[{ ...n('Manager'), position: 'Director', department: 'Finance', children: [n('Staff')] }]} header={<Text>Organization</Text>} />);
    expect(screen.getByText('Organization')).toBeTruthy();
    expect(screen.getByText('Director · Finance')).toBeTruthy();
    expect(screen.getByText('E-Staff')).toBeTruthy();
    expect(screen.getByLabelText('Staff, E-Staff, ລະດັບໃນອົງກອນ 2')).toBeTruthy();
  });

  it('retains only an initial window for a large organization', () => {
    render(<OrgList roots={Array.from({ length: 250 }, (_, index) => n(`employee-${index}`))} />);
    expect(screen.UNSAFE_getByType(FlatList).props.data).toHaveLength(250);
    expect(screen.getAllByTestId('org-node').length).toBeLessThan(250);
    expect(screen.getByText('employee-0')).toBeTruthy();
    expect(screen.queryByText('employee-249')).toBeNull();
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
