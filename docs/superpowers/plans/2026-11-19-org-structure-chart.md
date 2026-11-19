# Org Structure Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A department-based org structure (Chairman → CEO → departments + head → employees). On web it is a pannable/zoomable box chart with a detail panel and a `/org/manage` page; on mobile it is an expandable list.

**Architecture:** A pure `buildOrgStructure()` in `@hrm/shared` turns open departments plus active employees into a tree. The API serves it at `GET /org/structure`. Web renders it as a CSS flex tree inside a hand-written pan/zoom viewport (no new libs). Mobile flattens it into the existing virtualised-list pattern with expand state.

**Tech Stack:** Fastify + Prisma + zod (API), Next 15 + Tailwind + react-query (web), Expo RN + NativeWind (mobile), vitest / jest / Playwright / Maestro.

**Spec:** `docs/superpowers/specs/2026-11-19-org-structure-chart-design.md`

## Global Constraints

- No new dependencies in any package (approach A).
- `GET /org/chart` and `OrgChartNode` stay unchanged (mobile profile uses them).
- Read permission `ORG_READ`; manage page and mutations `ORG_WRITE`.
- Active employees = status in `PROBATION`, `ACTIVE`, `ON_LEAVE` (same as `orgChartRows`).
- Siblings (departments) and members sort by name (`localeCompare`).
- Zoom scale clamped to **0.3–2**. Default expansion: depth < 2 open (levels 0 and 1).
- Unassigned node: `id: 'unassigned'`, `kind: 'unassigned'`, added last, only when non-empty.
- Every new UI string goes in Lao and English in `packages/shared/src/i18n/areas/org.ts`.
- User rule: before each commit run `pnpm lint && pnpm typecheck && pnpm build && pnpm test` (plus `pnpm e2e` and Maestro in the final task). Update `docs/REQUIREMENT_TRACKING.md` in the same commit as the feature. Never push.
- Do not include the pre-existing unrelated modified files (`docs/REQUIREMENT_TRACKING.md` hunks not yours, `hrm-mobile/.maestro/flows/01*,04*`, `EmployeeForm.tsx`, `employees.test.tsx`) in these commits unless the user says so. Stage files explicitly.

## Review Focus

1. **Very wide level** (CEO with ~27 departments): the chart must not clip or wrap; "fit" must show the whole width. → Task 4 test `chart content is not width-constrained` (asserts the tree root has class `w-max`) and Task 3 `fitView` test for a 6000-px-wide content.
2. **Pointer down on a box button** (chevron/list icon) must click, not start a pan. → Task 4 test `clicking chevron toggles without panning`.
3. **Head is inactive or deleted** (`headEmployeeId` points at a TERMINATED employee): head is `null`, no crash. → Task 1 test `head null when head employee not active`.
4. **Empty workspace / only unassigned staff**: an empty state for no data; a lone Unassigned box when only that exists. → Task 1 test `only unassigned`, Task 4 test `empty state`.
5. **Structure changes on the manage page** must refresh the chart without a reload. → Task 5 test `saving invalidates structure query` (asserts `invalidateQueries` called with `orgKeys.structure`).

---

### Task 1: Shared structure type, builder, schema change, i18n

**Files:**
- Modify: `packages/shared/src/schemas/org.ts`
- Modify: `packages/shared/src/i18n/areas/org.ts`
- Test: `packages/shared/test/org-structure.test.ts` (create)

**Interfaces:**
- Produces:
  ```ts
  interface OrgStructureMember { id: string; employeeCode: string; name: string; position: string | null }
  interface OrgStructureNode {
    id: string; kind: 'department' | 'unassigned'; name: string;
    head: OrgStructureMember | null; employeeCount: number;
    members: OrgStructureMember[]; children: OrgStructureNode[];
  }
  const orgStructureNodeSchema: z.ZodType<OrgStructureNode>   // lazy, like orgChartNodeSchema
  const UNASSIGNED_NODE_ID = 'unassigned';
  function buildOrgStructure(input: {
    departments: readonly { id: string; name: string; parentId: string | null; headEmployeeId: string | null }[]; // open only
    employees: readonly (OrgStructureMember & { departmentId: string | null })[];                                // active only
  }): OrgStructureNode[]
  ```
  `updateDepartmentSchema`: `headEmployeeId` becomes `z.string().nullable()` (null clears).
  i18n keys (lo/en): `org.structure.unassigned` (ບໍ່ໄດ້ຈັດພະແນກ / Unassigned), `org.structure.manager` (ຫົວໜ້າ / Manager), `org.structure.employees` (ພະນັກງານ / Employees), `org.structure.subUnits` (ໜ່ວຍງານຍ່ອຍ / Sub-units), `org.structure.detail` (ລາຍລະອຽດໂຄງສ້າງ / Structure detail), `org.structure.zoomIn`, `org.structure.zoomOut`, `org.structure.fit` (ພໍດີຈໍ / Fit), `org.structure.expand`, `org.structure.collapse`, `org.structure.empty` (ຍັງບໍ່ມີໂຄງສ້າງ / No structure yet), `org.manage.title` (ຈັດການໂຄງສ້າງ / Manage structure), `org.manage.addSub` (ເພີ່ມໜ່ວຍງານຍ່ອຍ / Add sub-unit), `orgx.department.head` (ຫົວໜ້າພະແນກ / Head).

- [ ] **Step 1: Write failing tests** in `packages/shared/test/org-structure.test.ts`:
  - `nests departments by parent and sorts by name`: depts Chairman(root), CEO(parent Chairman), B-dept & A-dept (parent CEO) → `roots.map(id)` = `['chairman']`; CEO children names `['A-dept','B-dept']`.
  - `head listed once, counts by departmentId`: head H in dept A, members M1, M2 in A → A.head.id `'H'`, A.members ids `['M1','M2']` (sorted by name), A.employeeCount `3`.
  - `head from another department appears as head and as member of own department`: CEO dept head = X, X.departmentId = chairman → ceo.head.id `'X'`, ceo.employeeCount `0`; chairman.members contains X, chairman.employeeCount `1`.
  - `head null when head employee not active`: headEmployeeId `'gone'` not in employees → head `null`.
  - `child of a closed parent becomes a root`: dept with parentId `'closed-id'` absent from input → it is a root.
  - `unassigned node collects staff without an open department, last`: employees with `departmentId: null` and `'closed-id'` → last root `{ id: 'unassigned', kind: 'unassigned', head: null, children: [], employeeCount: 2 }`.
  - `only unassigned`: no departments, one employee → exactly one root, kind `'unassigned'`.
  - `no unassigned node when everyone is placed`: no root with id `'unassigned'`.
  - `parent cycle does not loop`: A.parent=B, B.parent=A → returns without hanging and both appear exactly once in the tree.
- [ ] **Step 2: Run** `pnpm --filter @hrm/shared test org-structure` → FAIL (`buildOrgStructure` not exported).
- [ ] **Step 3: Implement** the types, schema, `buildOrgStructure` (map by id; a department whose parent is missing or whose parent chain loops is a root; reuse the `createsCycle` idea from `buildOrgTree`), the `headEmployeeId` nullable change, and the i18n keys. Export from the package index if `schemas/org.ts` is not already re-exported wholesale.
- [ ] **Step 4: Run** `pnpm --filter @hrm/shared test && pnpm --filter @hrm/shared typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(shared): org structure tree builder`.

### Task 2: API `GET /org/structure`, clear head, seed

**Files:**
- Modify: `hrm-api/src/modules/org/org.repository.ts` (add `orgStructureRows`)
- Modify: `hrm-api/src/modules/org/org.service.ts` (add `orgStructure`; `assertDepartmentRefs` must skip the check when `headEmployeeId === null`)
- Modify: `hrm-api/src/modules/org/org.routes.ts`
- Modify: `hrm-api/prisma/seed.ts`
- Test: `hrm-api/test/org.test.ts`

**Interfaces:**
- Consumes: `buildOrgStructure`, `orgStructureNodeSchema` (Task 1).
- Produces: `GET /api/v1/org/structure` → `OrgStructureNode[]`; `orgRepository.orgStructureRows(tx, workspaceId): Promise<{ departments; employees }>`; `OrgService.orgStructure(ctx): Promise<OrgStructureNode[]>`. `PATCH /departments/:id { headEmployeeId: null }` clears the head.

- [ ] **Step 1: Write failing tests** in `hrm-api/test/org.test.ts` (same helpers as the existing tests):
  - `serves the department structure`: create Chairman, CEO(parent Chairman), Ops(parent CEO); employee E1 in Ops set as Ops head via PATCH; employee E2 in Ops → `GET /org/structure` 200; `[0].name` `'Chairman'`; Ops node `head.employeeCode === 'E1'`, `members.map(m=>m.employeeCode)` `['E2']`, `employeeCount` `2`.
  - `excludes closed departments and inactive staff`: close a leaf department holding an employee → that employee appears in the `'unassigned'` root; a TERMINATED employee appears nowhere.
  - `clears a department head with null`: PATCH `{ headEmployeeId: null }` → 200 and `headEmployeeId` `null`.
  - `employee role can read the structure`: an EMPLOYEE-role token gets 200 (copy how other tests log in a non-owner; see `helpers.ts`).
- [ ] **Step 2: Run** `pnpm db:start` (background, if not running) then `pnpm --filter @hrm/api test org.test` → new tests FAIL (404).
- [ ] **Step 3: Implement** the repository query (open departments: `id, name, parentId, headEmployeeId`; active employees: `id, employeeCode, firstName, lastName, departmentId, position.name`), the service method (name = `${firstName} ${lastName}`, same as `orgChart`), the route with response schema `z.array(orgStructureNodeSchema)`, and the null-head handling.
- [ ] **Step 4: Update the seed**: add departments `ປະທານ` (top) and `CEO` (parent ປະທານ); make the existing HR and ops departments children of CEO; set the head of HR to E001 and of ops to the seed supervisor. Keep employee codes and logins unchanged (Maestro and e2e depend on them).
- [ ] **Step 5: Run** `pnpm --filter @hrm/api test && pnpm --filter @hrm/api typecheck` → PASS (including `openapi.test.ts`).
- [ ] **Step 6: Commit** `feat(api): org structure endpoint and head clearing`.

### Task 3: Web pan/zoom hook

**Files:**
- Create: `hrm-web/src/features/org/pan-zoom.ts` (pure math + `usePanZoom` hook)
- Test: `hrm-web/test/org-chart.test.tsx` (create; later tasks add to it)

**Interfaces:**
- Produces:
  ```ts
  type View = { x: number; y: number; scale: number };
  const MIN_SCALE = 0.3, MAX_SCALE = 2;
  function zoomAt(view: View, px: number, py: number, factor: number): View  // keeps (px,py) fixed, clamps scale
  function fitView(content: { w: number; h: number }, viewport: { w: number; h: number }, padding?: number /*24*/): View // scale = min(1, fit), clamped; centred
  function usePanZoom(): {
    view: View; viewportRef: RefObject<HTMLDivElement>; contentRef: RefObject<HTMLDivElement>;
    zoomIn(): void; zoomOut(): void; fit(): void;   // zoomIn/out = factor 1.2 / 1/1.2 around the viewport centre
  }
  ```
  The hook attaches pointer handlers to `viewportRef`: single-pointer drag pans (with `setPointerCapture`), except when `event.target.closest('button,a')` is set. Two pointers pinch-zoom around their midpoint. `wheel` (non-passive, `preventDefault`) zooms at the cursor with factor `Math.exp(-deltaY * 0.001)`. `fit()` runs once after the first content measure. Content is transformed via `translate(x,y) scale(s)` with `transform-origin: 0 0`.

- [ ] **Step 1: Write failing tests**:
  - `zoomAt keeps the anchor point fixed`: from `{x:0,y:0,scale:1}`, `zoomAt(v,100,50,2)` → `{x:-100,y:-50,scale:2}`.
  - `zoomAt clamps scale`: `zoomAt({x:0,y:0,scale:1.8},0,0,2).scale` = `2`; factor 0.01 → `0.3`.
  - `fitView centres small content without upscaling`: content 200×100 in viewport 1000×500 → scale `1`, x `400`, y `200`.
  - `fitView shrinks very wide content`: content 6000×400 in 1200×600 → scale `0.3` (clamped; (1200-48)/6000 = 0.192).
- [ ] **Step 2: Run** `pnpm --filter @hrm/web test org-chart` → FAIL.
- [ ] **Step 3: Implement** `pan-zoom.ts`.
- [ ] **Step 4: Run** the tests → PASS.
- [ ] **Step 5: Commit** `feat(web): pan and zoom viewport hook`.

### Task 4: Web chart page with detail panel

**Files:**
- Create: `hrm-web/src/features/org/components/OrgStructureChart.tsx` (viewport + toolbar + recursive tree)
- Create: `hrm-web/src/features/org/components/StructureDetailPanel.tsx`
- Modify: `hrm-web/src/features/org/api.ts` (add `structure: () => apiFetch<OrgStructureNode[]>('/org/structure')`)
- Modify: `hrm-web/src/features/org/hooks.ts` (add `orgKeys.structure = ['org','structure']`, `useOrgStructure()`)
- Modify: `hrm-web/src/app/(app)/org/page.tsx`
- Delete: `hrm-web/src/features/org/components/OrgChartTree.tsx` (and `useOrgChart` in web, if nothing else uses it — check with grep)
- Test: `hrm-web/test/org-chart.test.tsx`

**Interfaces:**
- Consumes: `usePanZoom` (Task 3), `OrgStructureNode`, i18n keys (Task 1).
- Produces: `<OrgStructureChart roots={OrgStructureNode[]} onOpenDetail={(n) => void} />`, `<StructureDetailPanel node={OrgStructureNode | null} onClose={() => void} />`. Test ids: `org-structure` (tree root `ul`, class includes `w-max`), `org-box-{id}`, `org-toggle-{id}`, `org-detail-{id}`, `org-detail-panel`, `org-zoom-in`, `org-zoom-out`, `org-fit`.

Box (from the spec): navy primary background, white text, initials avatar of the head (first letters of the name; the unassigned node shows an icon), bold department name (`t('org.structure.unassigned')` for the unassigned node), head name below, `account_tree` icon + `children.length`, `group` icon + `employeeCount`, a list button (opens the panel) and a chevron button (only when there are children). Long text truncates, with a `title` attribute. Connectors are pure CSS (`::before`/`::after` on `li`) in the existing Tailwind/global CSS; the line colour uses a theme token so dark mode works. Panel: right drawer `w-full sm:w-[380px]`, header `t('org.structure.detail')`, name, `employeeCount`, head row with a `Badge` "Manager", then members (name + position) as links to `/employees/{id}`. Close on ✕ and Escape. Page: `PageHeader` with a "Manage" button (`/org/manage`) shown only with `ORG_WRITE` (use the same permission check component or hook as other pages); the chart viewport fills the remaining height (`h-[calc(100vh-…)]`, min 480px).

- [ ] **Step 1: Write failing tests** (mock `orgApi.structure` the way other web tests mock their api modules):
  - `renders boxes for the first two levels`: tree Chairman → CEO → Ops → Team → `org-box-chairman`, `org-box-ceo` and `org-box-ops` visible; `org-box-team` absent (Ops is depth 2, collapsed).
  - `clicking chevron toggles without panning`: click `org-toggle-ops` → `org-box-team` visible; the content's transform is unchanged.
  - `detail panel lists the head first with a Manager badge`: click `org-detail-ops` → `org-detail-panel` first row has the head's name and text `Manager`/`ຫົວໜ້າ`; Escape closes it.
  - `chart content is not width-constrained`: `getByTestId('org-structure')` has class `w-max`.
  - `empty state`: `[]` → text of `org.structure.empty`.
  - `unassigned box uses the translated name`.
- [ ] **Step 2: Run** `pnpm --filter @hrm/web test org-chart` → FAIL.
- [ ] **Step 3: Implement** the components, API/hook additions and page; remove `OrgChartTree`.
- [ ] **Step 4: Run** `pnpm --filter @hrm/web test && pnpm --filter @hrm/web typecheck && pnpm --filter @hrm/web lint` → PASS.
- [ ] **Step 5: Check it in a browser** (per memory: use Claude in Chrome for the web app). Start the API and web dev servers, log in as the seed admin, open `/org`: drag to pan, wheel and buttons zoom, fit, collapse/expand, panel. Take a screenshot as proof.
- [ ] **Step 6: Commit** `feat(web): department structure chart with pan/zoom and detail panel`.

### Task 5: Web manage page and head field in settings

**Files:**
- Create: `hrm-web/src/app/(app)/org/manage/page.tsx`
- Create: `hrm-web/src/features/org/components/DepartmentTreeEditor.tsx`
- Modify: `hrm-web/src/features/org/forms.ts` (`departmentFormValues` adds `headEmployeeId`; `parseDepartmentForm` maps `''` → `null`)
- Modify: `hrm-web/src/app/(app)/settings/page.tsx` (add the head select to the department form)
- Modify: navigation, if the app nav lists routes explicitly (add nothing; manage is reached from `/org`)
- Test: `hrm-web/test/org-chart.test.tsx`

**Interfaces:**
- Consumes: `useDepartments(true)`, `useEmployees` (from `features/employees/hooks.ts`, used as the head picker source with active statuses), `orgApi.createDepartment/updateDepartment/setActive/deleteDepartment`, `EntityFormDialog`, `ConfirmDialog`, `orgKeys.structure` (Task 4).
- Produces: `<DepartmentTreeEditor />`, test ids `dept-row-{id}`, `dept-edit-{id}`, `dept-add-sub-{id}`, `dept-toggle-active-{id}`, `dept-delete-{id}`, `dept-add-root`.

The page is wrapped in `RequirePermission permission={PERMISSIONS.ORG_WRITE}`. It shows a "show closed" toggle and an indented list built from `parentId` (reuse `buildOrgStructure` with no employees, or a small local helper), with each row's name, head name and `employeeCount`. Form fields: name, parent (`Select`; options exclude the department itself and its descendants), head (`Select` over employees, empty = none). Every mutation invalidates `orgKeys.departments` **and** `orgKeys.structure` (extend `useOrgMutation` to accept several keys, or call it with the `['org']` prefix; executor's choice). API errors (`department_cycle`, `has_open_children`, `in_use`, `name_taken`) show through the existing error translation path.

- [ ] **Step 1: Write failing tests**:
  - `parent options exclude self and descendants`: editing CEO → parent options do not contain CEO or Ops (child of CEO).
  - `add sub-unit pre-fills the parent`: click `dept-add-sub-ceo` → create called with `{ name, parentId: 'ceo' }`.
  - `clearing the head sends null`: `parseDepartmentForm({ name:'A', parentId:'', headEmployeeId:'' })` → `{ ok:true, data:{ name:'A', parentId:null, headEmployeeId:null } }`.
  - `saving invalidates structure query`: spy on `QueryClient.invalidateQueries` → called with a key matching `['org','structure']` (or the `['org']` prefix).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the web test, typecheck and lint → PASS. Check `/org/manage` in Chrome: edit a parent and see `/org` update.
- [ ] **Step 5: Commit** `feat(web): org structure manage page and department head`.

### Task 6: Mobile expandable structure list

**Files:**
- Create: `hrm-mobile/src/features/org/OrgStructureList.tsx`
- Modify: `hrm-mobile/src/features/profile/api.ts` (add `useOrgStructure` → `/org/structure`; keep `useOrgChart`)
- Modify: `hrm-mobile/src/app/(tabs)/org.tsx`
- Delete: `hrm-mobile/src/features/org/OrgList.tsx`, if nothing else imports it
- Test: `hrm-mobile/__tests__/org-structure.test.tsx` (create)

**Interfaces:**
- Consumes: `OrgStructureNode`, i18n keys (Task 1).
- Produces: `flattenStructure(roots, expanded: ReadonlySet<string>): Row[]`, where `Row = { type: 'dept'; node; depth } | { type: 'person'; member; depth; isHead: boolean }`. Order inside an expanded department: head (isHead), members, then child departments. Exported for tests. `<OrgStructureList roots header? />`. Test ids `org-dept-{id}`, `org-person-{id}`, `org-list`.

Initial `expanded` = ids at depth < 2. Rows have a fixed height (dept 88, person 72) with `getItemLayout` computed from a prefix sum, same as `OrgList`. A department row shows name (translated for unassigned), head name, `children.length` and `employeeCount`, plus a chevron; tapping toggles. A person row is indented one level below its department and shows a "Manager" badge when `isHead`. Accessibility labels follow the current `OrgRow` pattern.

- [ ] **Step 1: Write failing tests**:
  - `flattenStructure lists head, members, then sub-departments`: Ops expanded with head H, member M, child Team → rows types/ids `['dept:ops','person:H','person:M','dept:team']`, H `isHead` true.
  - `collapsed department hides its contents`: Ops not in `expanded` → only `dept:ops`.
  - `tapping a department expands it` (render): Chairman → CEO → Ops; `org-person-…` of Ops absent at first; press `org-dept-ops` → visible.
- [ ] **Step 2: Run** `pnpm --filter @hrm/mobile test org-structure` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @hrm/mobile test && pnpm --filter @hrm/mobile typecheck && pnpm --filter @hrm/mobile lint` → PASS.
- [ ] **Step 5: Commit** `feat(mobile): expandable org structure list`.

### Task 7: E2E, Maestro, tracking doc, full checks

**Files:**
- Modify: `hrm-web/e2e/org-and-states.spec.ts` (replace the manager-nesting test)
- Modify: `hrm-web/e2e/org-settings.spec.ts` or add `hrm-web/e2e/org-structure.spec.ts` for the manage page
- Modify: `hrm-mobile/.maestro/flows/03-org-and-logout.yaml`
- Modify: `docs/REQUIREMENT_TRACKING.md` (only the org-chart rows: status and test references)

- [ ] **Step 1: Web e2e**:
  - `/org` shows `org-box-*` for ປະທານ and CEO, and the HR box with head `ສົມສັກ ພົມມະວົງ`. Open the HR detail panel → it lists that head with a Manager badge.
  - On `/org/manage`, add a sub-unit under CEO, then see it on `/org`. Clean up after (delete it).
- [ ] **Step 2: Maestro 03**: after `open-org`, assert `ປະທານ` and `CEO` are visible, tap the HR department row, assert `ສົມສັກ ພົມມະວົງ` is visible, keep the logout steps. Use the seeded mobile DB (reseed `hrm_mobile_m5`, since the seed changed).
- [ ] **Step 3: Run the full check**: `pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm e2e` → all pass. Then Maestro on the Huawei per memory (`adb reverse tcp:4001 tcp:4001; adb reverse tcp:8082 tcp:8082`, `maestro test -e API_URL=http://localhost:4001/api/v1 .maestro/flows/03-org-and-logout.yaml`) → pass. Report any skipped step to the user, with the reason.
- [ ] **Step 4: Update `REQUIREMENT_TRACKING.md`** (org chart rows only) and commit `test: org structure e2e and maestro; tracking`.
