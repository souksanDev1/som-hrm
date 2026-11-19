# Org structure chart — design

Date: 2026-11-19 · Status: draft, awaiting approval

## Intent

Replace today's org chart, an indented list of employees by line manager, with an **organisation structure chart built from departments**, like the reference screenshot:

- Top: **Chairman** (ປະທານ) → **CEO** → each **department** with its **Manager** (head) → **employees** of that department.
- Web: boxes laid out as a top-down tree with connector lines. Each box has an expand/collapse (dropdown) button. The whole chart can be **panned and zoomed** for viewing (view only).
- Web: a **management page** where the structure is edited with forms (parent unit, head, name, add, close).
- Mobile: the same structure as an **expandable list** (not boxes).

Why: the user wants the chart to show the company's real hierarchy (Chairman → CEO → departments → staff), the way the old system did. The current employee-only list doesn't show departments at all.

## Goals

1. New read endpoint returning the department tree, with head, counts and members.
2. Web `/org`: box tree with connectors, collapse/expand per box, pan (drag) + zoom (wheel, pinch, +/−/fit buttons).
3. Web: clicking a box's list icon opens a right-side **Structure Detail** panel: department name, employee count, head first with a "Manager" badge, then the other members (name + position). Clicking a person goes to `/employees/{id}`.
4. Web `/org/manage` (ORG_WRITE): edit the structure with forms.
5. Mobile Org tab: expandable list in the same order.

## Non-goals

- Drag-and-drop to change structure (user chose view-only movement).
- Employee photos. There is no photo field; boxes show initials (the user was told this).
- Search inside the chart, minimap, export/print.
- Manual sibling ordering. Siblings sort by name (my call; a `sortOrder` can come later).
- Changing the line-manager (`managerId`) model or approval routing.

## Anti-goals

- Must not break the `/org/chart` API, which mobile profile still uses. It stays as is.
- The web `/org` page's line-manager tree UI (`OrgChartTree`) is **replaced**, not kept as a tab (my call). Line managers stay visible on employee profiles. Web e2e `org-and-states.spec.ts` and Maestro `03-org-and-logout.yaml` are updated to the new chart and list.
- Must not stay unreadable at large size. Pan/zoom must work on a ~50-department org with collapsed and expanded boxes.
- No new web or mobile libraries (approach A).

## Constraints / current state

- `Department` already has `parentId` (self-tree) and `headEmployeeId`. `Employee` has `departmentId`, `positionId`, `status`, `isTopLevel`.
- The API already prevents department cycles (`department_cycle`) and closing a parent that has open children (`has_open_children`).
- The settings page edits department name and parent only; there is no head picker yet.
- Permissions: `ORG_READ` (all roles, including EMPLOYEE) and `ORG_WRITE`.
- Web: Next 15, Tailwind, react-query. Mobile: Expo / React Native, NativeWind, react-query.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Hand-written CSS tree + own pan/zoom hook (pointer events, wheel, pinch) | No new deps, full control of the look; must write and test the gesture code (~100 lines) |
| B | CSS tree + `react-zoom-pan-pinch` | Polished gestures; adds a dep for little saving |
| C | React Flow + dagre | Minimap and auto layout; heavy, overkill for view-only, harder to match the look |

The user picked **A**. For mobile, the user picked an **expandable list** over a pannable box chart.

## Design

### Data / API

New shared type and schema in `packages/shared/src/schemas/org.ts`:

```ts
interface OrgStructureMember { id; employeeCode; name; position: string | null; }
interface OrgStructureNode {
  id; name;
  head: OrgStructureMember | null;   // from headEmployeeId, if that employee is active
  employeeCount: number;             // active members of this department only (not sub-units)
  members: OrgStructureMember[];     // active members, head excluded, sorted by name
  children: OrgStructureNode[];      // open sub-departments, sorted by name
}
```

`GET /org/structure` (ORG_READ) returns `OrgStructureNode[]` roots: open departments with no parent, or whose parent is closed. "Active" employees use the same statuses as `orgChartRows` (PROBATION, ACTIVE, ON_LEAVE). Members are returned inline in one call (my call: simpler, fine for hundreds of staff).

Head (my call): an employee may head a department they are not a member of (e.g. the CEO heads "CEO" but sits in "Chairman"). They appear as **head** of the department they head, and as an ordinary **member** of their own department (`departmentId`). Counts follow `departmentId` only. Within one department the head is never listed twice: if the head is also a member, they appear only as head, and they are still counted.

Unreachable employees (my call): active employees with no department, or whose department is closed, go into a synthetic **"Unassigned"** root node (`id: "unassigned"`, `kind: "unassigned"`; real nodes have `kind: "department"`). It is added last and only when non-empty, so the chart's total matches the employee list. It has no head and no children, and the manage page doesn't list it.

Department head editing: `headEmployeeId` is already in `create/updateDepartmentSchema` and validated by the service. Add `headEmployeeId: null` support to clear it (the update schema needs `.nullable()`).

### Web chart (`/org`)

- `OrgStructureChart` component: recursive `<ul>` flex tree with CSS connector lines (a vertical line from the parent, a horizontal bar across siblings, a vertical line into each child).
- Box (about 210×80, primary navy like the screenshot): initials avatar of the head, department name in bold, head name below, then `🏢 n` sub-units, `👥 n` employees, a list icon (opens the panel) and a chevron (collapse/expand, shown only when there are children).
- Default expansion: first 2 levels open (Chairman, CEO, departments under CEO visible).
- `usePanZoom` hook: drag to pan (pointer capture, ignores drags that start on buttons), wheel to zoom toward the cursor, two-pointer pinch, scale clamped 0.3–2. Toolbar: +, −, "fit" (scales the content to the viewport). Starts centred on the root.
- Structure Detail panel: right-side drawer, closes on ✕ or Esc, full width on phones.
- Users with ORG_WRITE see a "Manage" button that goes to `/org/manage`.
- Empty state: if there are no departments, show a message with a link to manage (for writers).

### Web management (`/org/manage`, ORG_WRITE)

- An indented tree list of all departments (open and closed, with a toggle to show closed), showing name, head and count.
- Row actions: Edit, Add sub-unit, Close/Reopen, Delete (existing API, existing rules and errors).
- Edit/Add form: name, parent (select, excluding self and descendants), head (employee picker, searchable select over the employees list, optional).
- Uses the existing department endpoints; invalidates both the departments list and the structure queries.
- The existing settings department section stays; it gets the same head field for consistency (my call).

### Mobile (Org tab)

- Replace the employee list with `OrgStructureList`: rows for departments (name, head, counts) with a chevron. Tapping expands to show the head (with a "Manager" badge), the members, then the sub-departments, indented.
- Flattened and virtualised like today's `OrgList`, recomputed from expanded state. Default: first 2 levels expanded.
- Tapping a person does nothing new (no employee profile screen on mobile for others today).

### Setting up Chairman / CEO

Chairman and CEO are ordinary departments: "Chairman" at the top level, "CEO" with parent Chairman, the other departments with parent CEO, and heads set. Update the dev seed so the demo shows this shape (my call). There is no special data-migration for real data; admins arrange it on the manage page.

### i18n

All new strings in Lao and English via the shared i18n.

### Tests

- API: `/org/structure` tree shape, counts, closed departments excluded, inactive employees excluded, head clear with `null`, permission check.
- Shared: tree builder unit tests (orphans under a closed parent become roots).
- Web: chart renders boxes and connectors, collapse/expand, panel opens with head first, manage form saves parent/head; pan/zoom hook math (zoom toward a point, clamp).
- Mobile: list expand/collapse.

## Left to the builder

Exact box styling within the existing design tokens, the connector CSS technique, file and component names, and how the employee picker is implemented (reuse any existing select).
