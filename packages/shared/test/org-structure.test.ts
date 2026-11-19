import { describe, expect, it } from 'vitest';
import { buildOrgStructure, type OrgStructureNode } from '../src';

type Dept = { id: string; name: string; parentId: string | null; headEmployeeId: string | null };
const dept = (id: string, parentId: string | null = null, headEmployeeId: string | null = null, name = id): Dept => ({ id, name, parentId, headEmployeeId });
const emp = (id: string, departmentId: string | null, name = id) => ({ id, employeeCode: id, name, position: null, departmentId });

const find = (roots: OrgStructureNode[], id: string): OrgStructureNode | undefined => {
  for (const r of roots) {
    if (r.id === id) return r;
    const hit = find(r.children, id);
    if (hit) return hit;
  }
  return undefined;
};
const countIds = (roots: OrgStructureNode[]): string[] => roots.flatMap((r) => [r.id, ...countIds(r.children)]);

describe('buildOrgStructure', () => {
  it('nests departments by parent and sorts by name', () => {
    const roots = buildOrgStructure({
      departments: [dept('chairman'), dept('ceo', 'chairman'), dept('b', 'ceo', null, 'B-dept'), dept('a', 'ceo', null, 'A-dept')],
      employees: [],
    });
    expect(roots.map((r) => r.id)).toEqual(['chairman']);
    expect(find(roots, 'ceo')!.children.map((c) => c.name)).toEqual(['A-dept', 'B-dept']);
    expect(roots[0]!.kind).toBe('department');
  });

  it('head listed once, counts by departmentId', () => {
    const roots = buildOrgStructure({
      departments: [dept('a', null, 'H')],
      employees: [emp('M2', 'a', 'Zed'), emp('H', 'a'), emp('M1', 'a', 'Amy')],
    });
    const a = find(roots, 'a')!;
    expect(a.head?.id).toBe('H');
    expect(a.members.map((m) => m.id)).toEqual(['M1', 'M2']);
    expect(a.employeeCount).toBe(3);
  });

  it('head from another department appears as head and as member of own department', () => {
    const roots = buildOrgStructure({
      departments: [dept('chairman'), dept('ceo', 'chairman', 'X')],
      employees: [emp('X', 'chairman')],
    });
    const ceo = find(roots, 'ceo')!;
    const chairman = find(roots, 'chairman')!;
    expect(ceo.head?.id).toBe('X');
    expect(ceo.employeeCount).toBe(0);
    expect(chairman.members.map((m) => m.id)).toContain('X');
    expect(chairman.employeeCount).toBe(1);
  });

  it('head null when head employee not active', () => {
    const roots = buildOrgStructure({ departments: [dept('a', null, 'gone')], employees: [] });
    expect(roots[0]!.head).toBeNull();
  });

  it('child of a closed parent becomes a root', () => {
    const roots = buildOrgStructure({ departments: [dept('orphan', 'closed-id')], employees: [] });
    expect(roots.map((r) => r.id)).toEqual(['orphan']);
  });

  it('unassigned node collects staff without an open department, last', () => {
    const roots = buildOrgStructure({
      departments: [dept('a')],
      employees: [emp('E1', null), emp('E2', 'closed-id'), emp('E3', 'a')],
    });
    const last = roots[roots.length - 1]!;
    expect(last).toMatchObject({ id: 'unassigned', kind: 'unassigned', head: null, children: [], employeeCount: 2 });
    expect(last.members.map((m) => m.id)).toEqual(['E1', 'E2']);
  });

  it('only unassigned', () => {
    const roots = buildOrgStructure({ departments: [], employees: [emp('E1', null)] });
    expect(roots).toHaveLength(1);
    expect(roots[0]!.kind).toBe('unassigned');
  });

  it('no unassigned node when everyone is placed', () => {
    const roots = buildOrgStructure({ departments: [dept('a')], employees: [emp('E1', 'a')] });
    expect(roots.some((r) => r.id === 'unassigned')).toBe(false);
  });

  it('parent cycle does not loop', () => {
    const roots = buildOrgStructure({ departments: [dept('a', 'b'), dept('b', 'a')], employees: [] });
    expect(countIds(roots).sort()).toEqual(['a', 'b']);
  });
});
