import type { OrgStructureNode } from '@hrm/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import { flattenStructure, OrgStructureList } from '@/features/org/OrgStructureList';
import { usePrefsStore } from '@/lib/i18n';

beforeEach(() => usePrefsStore.setState({ locale: 'en' }));

const person = (id: string, name = id) => ({ id, employeeCode: `E-${id}`, name, position: null });
const node = (id: string, children: OrgStructureNode[] = [], extra: Partial<OrgStructureNode> = {}): OrgStructureNode => ({
  id,
  kind: 'department',
  name: id.toUpperCase(),
  head: null,
  employeeCount: 0,
  members: [],
  children,
  ...extra,
});
const key = (r: ReturnType<typeof flattenStructure>[number]) => (r.type === 'dept' ? `dept:${r.node.id}` : `person:${r.member.id}`);

describe('flattenStructure', () => {
  it('lists head, members, then sub-departments', () => {
    const ops = node('ops', [node('team')], { head: person('H'), members: [person('M')] });
    const rows = flattenStructure([ops], new Set(['ops']));
    expect(rows.map(key)).toEqual(['dept:ops', 'person:H', 'person:M', 'dept:team']);
    expect(rows[1]).toMatchObject({ type: 'person', isHead: true, depth: 1 });
    expect(rows[3]).toMatchObject({ depth: 1 });
  });

  it('collapsed department hides its contents', () => {
    const ops = node('ops', [node('team')], { head: person('H'), members: [person('M')] });
    expect(flattenStructure([ops], new Set()).map(key)).toEqual(['dept:ops']);
  });
});

describe('OrgStructureList', () => {
  const tree = () => [node('chairman', [node('ceo', [node('ops', [], { head: person('H', 'Hana'), members: [person('M', 'Mia')], employeeCount: 2 })])])];

  it('tapping a department expands it', () => {
    render(<OrgStructureList roots={tree()} />);
    expect(screen.getByTestId('org-dept-ops')).toBeTruthy();
    expect(screen.queryByTestId('org-person-H')).toBeNull();
    fireEvent.press(screen.getByTestId('org-dept-ops'));
    expect(screen.getByTestId('org-person-H')).toBeTruthy();
    expect(screen.getByText('Manager')).toBeTruthy();
    expect(screen.getByTestId('org-person-M')).toBeTruthy();
  });

  it('keeps exact virtualised row extents for mixed rows', () => {
    // A root starts expanded (first two levels open).
    render(<OrgStructureList roots={[node('ops', [], { head: person('H'), members: [person('M')] })]} />);
    const list = screen.UNSAFE_getByType(FlatList);
    // Rows: dept (88), head (72), member (72).
    expect(list.props.getItemLayout(list.props.data, 2)).toEqual({ length: 72, offset: 160, index: 2 });
  });

  it('gives unique keys to a person who heads another department than their own', () => {
    // The CEO heads "CEO" but sits in "Chairman": both levels are open, so they appear twice.
    const x = person('X', 'Xay');
    render(<OrgStructureList roots={[node('chairman', [node('ceo', [], { head: x })], { members: [x], employeeCount: 1 })]} />);
    const list = screen.UNSAFE_getByType(FlatList);
    const keys = (list.props.data as unknown[]).map((r) => list.props.keyExtractor(r));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('shows the translated unassigned name', () => {
    render(<OrgStructureList roots={[node('unassigned', [], { kind: 'unassigned', name: '', employeeCount: 1, members: [person('x')] })]} />);
    expect(screen.getByText('Unassigned')).toBeTruthy();
  });
});
