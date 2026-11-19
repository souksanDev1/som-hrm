import type { OrgStructureNode } from '@hrm/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { OrgStructureChart } from '@/features/org/components/OrgStructureChart';
import { StructureDetailPanel } from '@/features/org/components/StructureDetailPanel';
import { fitView, zoomAt } from '@/features/org/pan-zoom';
import { usePrefsStore } from '@/lib/i18n';

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
