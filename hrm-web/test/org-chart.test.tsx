import type { Department, OrgStructureNode } from '@hrm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DepartmentTreeEditor } from '@/features/org/components/DepartmentTreeEditor';
import { OrgStructureChart } from '@/features/org/components/OrgStructureChart';
import { StructureDetailPanel } from '@/features/org/components/StructureDetailPanel';
import { parseDepartmentForm } from '@/features/org/forms';
import { fitView, zoomAt } from '@/features/org/pan-zoom';
import { usePrefsStore } from '@/lib/i18n';

const { orgApi, employeesApi } = vi.hoisted(() => ({
  orgApi: { departments: vi.fn(), structure: vi.fn(), createDepartment: vi.fn(), updateDepartment: vi.fn(), deleteDepartment: vi.fn(), setActive: vi.fn() },
  employeesApi: { list: vi.fn() },
}));
vi.mock('@/features/org/api', () => ({ orgApi }));
vi.mock('@/features/employees/api', () => ({ employeesApi }));

beforeEach(() => {
  usePrefsStore.setState({ locale: 'en' });
});

const person = (id: string, name = id, position: string | null = null) => ({ id, employeeCode: id, name, position });
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
const tree = () => [
  node('chairman', [
    node('ceo', [node('ops', [node('team')], { head: person('h1', 'Hana Boss', 'Director'), members: [person('m1', 'Mia Staff', 'Officer')], employeeCount: 2 })]),
  ]),
];

/** Chart + panel wired the way the page does it. */
function Harness({ roots }: { roots: OrgStructureNode[] }) {
  const [open, setOpen] = useState<OrgStructureNode | null>(null);
  return (
    <>
      <OrgStructureChart roots={roots} onOpenDetail={setOpen} />
      <StructureDetailPanel node={open} onClose={() => setOpen(null)} />
    </>
  );
}

describe('pan/zoom math', () => {
  it('zoomAt keeps the anchor point fixed', () => {
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 100, 50, 2)).toEqual({ x: -100, y: -50, scale: 2 });
  });

  it('zoomAt clamps scale', () => {
    expect(zoomAt({ x: 0, y: 0, scale: 1.8 }, 0, 0, 2).scale).toBe(2);
    expect(zoomAt({ x: 0, y: 0, scale: 1 }, 0, 0, 0.01).scale).toBe(0.3);
  });

  it('fitView centres small content without upscaling', () => {
    expect(fitView({ w: 200, h: 100 }, { w: 1000, h: 500 })).toEqual({ x: 400, y: 200, scale: 1 });
  });

  it('fitView shrinks very wide content', () => {
    expect(fitView({ w: 6000, h: 400 }, { w: 1200, h: 600 }).scale).toBe(0.3);
  });
});

describe('OrgStructureChart', () => {
  it('renders boxes for the first two levels', () => {
    render(<Harness roots={tree()} />);
    expect(screen.getByTestId('org-box-chairman')).toBeInTheDocument();
    expect(screen.getByTestId('org-box-ceo')).toBeInTheDocument();
    expect(screen.getByTestId('org-box-ops')).toBeInTheDocument();
    expect(screen.queryByTestId('org-box-team')).not.toBeInTheDocument();
  });

  it('clicking chevron toggles without panning', async () => {
    render(<Harness roots={tree()} />);
    const before = screen.getByTestId('org-canvas').style.transform;
    await userEvent.click(screen.getByTestId('org-toggle-ops'));
    expect(screen.getByTestId('org-box-team')).toBeInTheDocument();
    expect(screen.getByTestId('org-canvas').style.transform).toBe(before);
  });

  it('detail panel lists the head first with a Manager badge', async () => {
    render(<Harness roots={tree()} />);
    await userEvent.click(screen.getByTestId('org-detail-ops'));
    const panel = screen.getByTestId('org-detail-panel');
    const rows = within(panel).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Hana Boss');
    expect(rows[0]).toHaveTextContent('Manager');
    expect(rows[1]).toHaveTextContent('Mia Staff');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('org-detail-panel')).not.toBeInTheDocument();
  });

  it('chart content is not width-constrained', () => {
    render(<Harness roots={tree()} />);
    expect(screen.getByTestId('org-structure')).toHaveClass('w-max');
  });

  it('empty state', () => {
    render(<Harness roots={[]} />);
    expect(screen.getByText('No structure yet')).toBeInTheDocument();
  });

  it('unassigned box uses the translated name', () => {
    render(<Harness roots={[node('unassigned', [], { kind: 'unassigned', name: '', employeeCount: 1, members: [person('x')] })]} />);
    expect(screen.getByTestId('org-box-unassigned')).toHaveTextContent('Unassigned');
  });
});

describe('parseDepartmentForm', () => {
  it('clearing the head sends null', () => {
    expect(parseDepartmentForm({ name: 'A', parentId: '', headEmployeeId: '' })).toEqual({ ok: true, data: { name: 'A', parentId: null, headEmployeeId: null } });
  });
});

describe('DepartmentTreeEditor', () => {
  const dept = (id: string, parentId: string | null = null): Department => ({ id, name: id.toUpperCase(), parentId, headEmployeeId: null, isActive: true, employeeCount: 0 });
  const renderEditor = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(
      <QueryClientProvider client={client}>
        <DepartmentTreeEditor />
      </QueryClientProvider>,
    );
    return { invalidate };
  };
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    orgApi.departments.mockResolvedValue([dept('chairman'), dept('ceo', 'chairman'), dept('ops', 'ceo')]);
    orgApi.structure.mockResolvedValue([]);
    orgApi.createDepartment.mockResolvedValue(dept('new', 'ceo'));
    orgApi.updateDepartment.mockResolvedValue(dept('ceo', 'chairman'));
    employeesApi.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
  });

  it('parent options exclude self and descendants', async () => {
    renderEditor();
    await userEvent.click(await screen.findByTestId('dept-edit-ceo'));
    const select = document.getElementById('department-form-parentId') as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.text);
    expect(labels).toContain('CHAIRMAN');
    expect(labels).not.toContain('CEO');
    expect(labels).not.toContain('OPS');
  });

  it('add sub-unit pre-fills the parent', async () => {
    renderEditor();
    await userEvent.click(await screen.findByTestId('dept-add-sub-ceo'));
    await userEvent.type(document.getElementById('department-form-name')!, 'New');
    await userEvent.click(screen.getByTestId('department-form-save'));
    expect(orgApi.createDepartment).toHaveBeenCalledWith(expect.objectContaining({ name: 'New', parentId: 'ceo' }));
  });

  it('saving invalidates structure query', async () => {
    const { invalidate } = renderEditor();
    await userEvent.click(await screen.findByTestId('dept-edit-ceo'));
    await userEvent.click(screen.getByTestId('department-form-save'));
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['org'] }));
  });
});
