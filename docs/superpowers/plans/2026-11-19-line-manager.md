# Required Department and Line Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every employee has one department and either one line manager or the "top level, requests go to HR" flag, enforced on new data and shown on web and mobile.

**Architecture:** One shared rule `assignmentIssues(changes, stored?)` in `@hrm/shared` (same shape as the existing `missingContractEnd(after, before)`) is used by the zod create/update schemas (web form + Excel import), and by the API update path on the merged stored + patched values. A new `Employee.isTopLevel` column marks the top person. The API returns `isTopLevel`, a manager position name and a list flag; the web and mobile render them.

**Tech Stack:** Prisma/Postgres, Fastify, zod, Next.js + react-hook-form, Expo React Native, vitest/jest, Playwright, Maestro.

**Spec:** `docs/superpowers/specs/2026-11-19-line-manager-design.md`

## Global Constraints

- Error codes, verbatim: `department_required`, `manager_required`, `manager_conflicts_top_level`.
- DB: `Employee.isTopLevel Boolean @default(false)`. Additive migration only, no backfill. Never `prisma migrate reset` (use `pnpm db:start` for the local DB).
- Partial PATCHes that don't touch `departmentId`, `managerId` or `isTopLevel` are never blocked.
- Setting a non-null `managerId` without `isTopLevel` in the same input → stored `isTopLevel = false`. Setting `isTopLevel: true` without a manager → stored `managerId = null`.
- `manager` in responses stays `{ id, name }` and gains `positionName: string | null`.
- Approval routing, delegations and the leave calendar are unchanged.
- All Lao + English strings go in the shared i18n dictionaries (both locales, same keys).
- Commits only after the task's checks pass, and only once the user has OK'd committing (strict check-before-commit).

## Review Focus

1. Legacy employee with no manager is resigned through the web edit form → save succeeds (the PATCH has only `status`). Pinned in Task 3 (API) and Task 5 (web form test).
2. HR ticks "top level" on someone who had a manager → manager cleared, history shows both changes, their next request goes to HR. Pinned in Task 3.
3. Import file whose manager row comes later in the file → still imports (manager-first order is unchanged by the new rule). Pinned in Task 4.
4. Employee whose manager is top level → normal routing to that manager, unaffected. Covered by existing approval tests staying green (Task 7).
5. Mobile personal page for a top-level employee and for a legacy employee with no manager → no crash, correct text. Pinned in Task 6.

---

### Task 1: Shared rule, schemas, i18n, import column

**Files:**
- Modify: `packages/shared/src/schemas/employee.ts` (rule next to `missingContractEnd`; create/update schemas; `refSchema` usage for manager; summary/detail schemas)
- Modify: `packages/shared/src/schemas/employee-import.ts` (new column after `managerCode`)
- Modify: `packages/shared/src/i18n/areas/employees.ts` (lo + en)
- Test: `packages/shared/test/schemas.test.ts`

**Interfaces:**
- Produces:
  - `type AssignmentIssue = 'department_required' | 'manager_required' | 'manager_conflicts_top_level'`
  - `interface Assignment { departmentId?: string | null; managerId?: string | null; isTopLevel?: boolean | null }`
  - `effectiveAssignment(changes: Assignment, stored?: Assignment | null): { departmentId: string | null; managerId: string | null; isTopLevel: boolean }`: merges (a key present in `changes` wins, `undefined` = unchanged), then applies "manager given ⇒ isTopLevel false unless changes.isTopLevel is set" and "isTopLevel ⇒ managerId null".
  - `assignmentIssues(changes: Assignment, stored?: Assignment | null): AssignmentIssue[]`:
    1. `changes.isTopLevel === true && changes.managerId` → `['manager_conflicts_top_level']`;
    2. `stored` given and none of the three keys defined in `changes` → `[]`;
    3. otherwise, on `effectiveAssignment(changes, stored)`: `department_required` if no department; `manager_required` if not top level and no manager.
  - `createEmployeeSchema` gains `isTopLevel: z.boolean().default(false)`, plus a superRefine adding each issue at path `departmentId` (`department_required`) or `managerId` (the other two).
  - `updateEmployeeSchema` gains `isTopLevel: z.boolean().optional()`, plus a refine for the conflict only (path `managerId`).
  - `employeeSummarySchema` gains `assignmentIncomplete: z.boolean()`.
  - `employeeDetailSchema`: `isTopLevel: z.boolean()`, `manager: z.object({ id, name, positionName: z.string().nullable() }).nullable()`.
  - Import column `{ key: 'isTopLevel', labelKey: 'empx.import.col.isTopLevel', kind: 'boolean' }`.
  - i18n keys (lo/en): `error.department_required` ("ກະລຸນາເລືອກພະແນກ" / "Choose a department"), `error.manager_required` ("ກະລຸນາເລືອກຫົວໜ້າ ຫຼື ໝາຍວ່າເປັນຄົນເທິງສຸດ" / "Choose a line manager or mark as top level"), `error.manager_conflicts_top_level` ("ຄົນເທິງສຸດບໍ່ມີຫົວໜ້າ" / "A top-level employee has no line manager"), `employee.lineManager` ("ຫົວໜ້າສາຍງານ" / "Line manager"), `employee.isTopLevel` ("ບໍ່ມີຫົວໜ້າ (ຄົນເທິງສຸດ) — ຄຳຂໍໄປຫາ HR" / "No line manager (top level) — requests go to HR"), `employee.topLevelInfo` ("ຄົນເທິງສຸດ — ຄຳຂໍໄປຫາ HR" / "Top level — requests go to HR"), `employee.managerMissing` ("ຍັງບໍ່ໄດ້ກຳນົດ, ກະລຸນາຕິດຕໍ່ HR" / "Not assigned yet, contact HR"), `employee.assignmentIncomplete` ("ຂາດພະແນກ / ຫົວໜ້າ" / "Missing department / line manager"), `employee.assignmentIncompleteHint` ("ພະນັກງານນີ້ຍັງຂາດພະແນກ ຫຼື ຫົວໜ້າ. ກະລຸນາຕື່ມ." / "This employee is missing a department or line manager. Please fill it in."), `empx.import.col.isTopLevel` ("ຄົນເທິງສຸດ (ບໍ່ມີຫົວໜ້າ)" / "Top level (no manager)").

- [ ] **Step 1: Write failing tests** in `packages/shared/test/schemas.test.ts`, `describe('assignmentIssues')`:
  - `assignmentIssues({})` → `['department_required', 'manager_required']`
  - `assignmentIssues({ departmentId: 'd' })` → `['manager_required']`
  - `assignmentIssues({ departmentId: 'd', isTopLevel: true })` → `[]`
  - `assignmentIssues({ departmentId: 'd', managerId: 'm' })` → `[]`
  - `assignmentIssues({ departmentId: 'd', managerId: 'm', isTopLevel: true })` → `['manager_conflicts_top_level']`
  - legacy untouched: `assignmentIssues({ status: 'RESIGNED' } as never, { departmentId: null, managerId: null })` → `[]`
  - touched on legacy: `assignmentIssues({ managerId: 'm' }, { departmentId: null, managerId: null })` → `['department_required']`
  - clearing: `assignmentIssues({ managerId: null }, { departmentId: 'd', managerId: 'm', isTopLevel: false })` → `['manager_required']`
  - `effectiveAssignment({ managerId: 'm' }, { departmentId: 'd', managerId: null, isTopLevel: true })` → `{ departmentId: 'd', managerId: 'm', isTopLevel: false }`
  - `effectiveAssignment({ isTopLevel: true }, { departmentId: 'd', managerId: 'm', isTopLevel: false })` → `{ departmentId: 'd', managerId: null, isTopLevel: true }`
  - `createEmployeeSchema.safeParse(validBaseWithout dept/manager)` fails with messages `department_required` at `['departmentId']` and `manager_required` at `['managerId']`. The same input with `isTopLevel: true, departmentId: 'd'` passes.
  - `updateEmployeeSchema.safeParse({ status: 'RESIGNED' })` passes. `{ isTopLevel: true, managerId: 'm' }` fails with `manager_conflicts_top_level`.
  - Update any existing create-schema fixtures in this file to include `departmentId` and `managerId` (or `isTopLevel: true`).
- [ ] **Step 2:** `pnpm --filter @hrm/shared test -- schemas` → new tests FAIL (not defined).
- [ ] **Step 3:** Implement the interfaces above. Add the i18n keys to both locales and the import column.
- [ ] **Step 4:** `pnpm --filter @hrm/shared test && pnpm --filter @hrm/shared exec tsc --noEmit` → all PASS (the i18n parity test included).
- [ ] **Step 5: Commit** `feat(shared): department + line manager assignment rule`

### Task 2: Database column and seed

**Files:**
- Modify: `hrm-api/prisma/schema.prisma` (`model Employee`: `isTopLevel Boolean @default(false)` near `managerId`)
- Create: migration via `pnpm --filter @hrm/api exec prisma migrate dev --name employee_is_top_level --create-only`, then apply with `migrate dev`
- Modify: `hrm-api/prisma/seed.ts` (boss E001 `isTopLevel: true`; make sure every seed employee has `departmentId`)
- Test: `hrm-api/test/migration-m6.test.ts` (or a new `migration-top-level.test.ts`, following its pattern)

**Interfaces:** Produces the `Employee.isTopLevel` column (Prisma field `isTopLevel: boolean`).

- [ ] **Step 1: Write failing test:** after migrations, an existing-style insert without `isTopLevel` reads back `false`. The seeded E001 has `isTopLevel === true` and `managerId === null`. Every seeded employee has a non-null `departmentId`.
- [ ] **Step 2:** run that test file → FAIL.
- [ ] **Step 3:** Schema change, migration, seed edits.
- [ ] **Step 4:** `pnpm --filter @hrm/api test -- migration` → PASS.
- [ ] **Step 5: Commit** `feat(db): Employee.isTopLevel`

### Task 3: API create/update, responses and list flag

**Files:**
- Modify: `hrm-api/src/modules/employees/employees.service.ts` (`createEmployee`, `update`, `TRACKED_FIELDS`)
- Modify: `hrm-api/src/modules/employees/employees.repository.ts` (detail include: `manager: { select: { id, firstName, lastName, position: { select: { name: true } } } }`; list select adds `departmentId`, `managerId`, `isTopLevel`)
- Modify: `hrm-api/src/modules/employees/employees.mapper.ts` (`toEmployeeSummary` → `assignmentIncomplete`; `toEmployeeDetail` → `isTopLevel`, `manager.positionName`)
- Test: `hrm-api/test/employees-m3.test.ts` (or new `hrm-api/test/employees-assignment.test.ts`, with the same helpers)

**Interfaces:**
- Consumes: `assignmentIssues`, `effectiveAssignment` (Task 1), `Employee.isTopLevel` (Task 2).
- Produces:
  - 400 `{ code: <AssignmentIssue>, fields: ['departmentId'|'managerId'] }`, following the existing `badRequest(code, { fields })` pattern.
  - `EmployeeSummary.assignmentIncomplete = isActiveStatus(status) && assignmentIssues({ departmentId, managerId, isTopLevel }).length > 0`.

- [ ] **Step 1: Write failing tests** (supertest, as HR):
  - POST without `departmentId` → 400 `department_required`.
  - POST with department, no manager, not top level → 400 `manager_required`.
  - POST with department + `isTopLevel: true` → 201, detail `isTopLevel: true`, `manager: null`.
  - PATCH `{ isTopLevel: true }` on an employee with a manager → 200, `manager: null`. The history entry's from/to include `managerId` and `isTopLevel`.
  - PATCH `{ managerId: <E002> }` on a top-level employee → 200, `isTopLevel: false`, `manager.id` = E002.
  - PATCH `{ isTopLevel: true, managerId: <E002> }` → 400 `manager_conflicts_top_level`.
  - PATCH `{ managerId: null }` on E003 → 400 `manager_required`.
  - Legacy row (create through Prisma directly with no dept/manager), then PATCH `{ status: 'RESIGNED' }` → 200.
  - GET `/employees/E003` and `/me/profile` (as E003) → `manager` = `{ id: E002, name: 'ບົວພັນ ສີສຸວັນ', positionName: <seed supervisor position name> }`.
  - GET `/employees` → the legacy active row has `assignmentIncomplete: true`. E003 has `false`. A legacy RESIGNED row has `false`.
  - Update existing employee-creating tests in `employees*.test.ts` that POST without department/manager so they send them.
- [ ] **Step 2:** `pnpm --filter @hrm/api test -- employees` → new tests FAIL.
- [ ] **Step 3: Implement.**
  - Create: compute `effectiveAssignment(input)` and write it.
  - Update: after the existing cross-field checks, `issues = assignmentIssues(input, storedAssignment)`; throw on the first issue. If any assignment key was in `input`, write `effectiveAssignment(input, stored)` (so the manager/top-level side effects persist).
  - `assertNoManagerCycle` runs on the effective manager.
  - Add `'isTopLevel'` to `TRACKED_FIELDS`. Change detection compares effective values, so the cleared manager is recorded too.
- [ ] **Step 4:** `pnpm --filter @hrm/api test` (whole suite, approvals included) and `pnpm --filter @hrm/api exec tsc --noEmit` → PASS. Update the OpenAPI snapshot if `openapi.test.ts` asks for it.
- [ ] **Step 5: Commit** `feat(api): require department and line manager`

### Task 4: Excel import

**Files:**
- Modify: `hrm-api/src/modules/employees/employee-import.service.ts` (pass `isTopLevel` through. Zod issue paths `departmentId`/`managerId` already map to columns via `REF_FIELD_COLUMN`.)
- Modify: the template generator, if it lists columns explicitly (`employee-import.file.ts`)
- Test: `hrm-api/test/employee-import.test.ts`

**Interfaces:** Consumes the Task 1 column and schema refinements. Row errors use `column: 'department' | 'managerCode'` with codes from Task 1.

- [ ] **Step 1: Write failing tests:**
  - A row without department → error `{ column: 'department', code: 'department_required' }`.
  - A row without managerCode, `isTopLevel` blank → `{ column: 'managerCode', code: 'manager_required' }`.
  - A row without managerCode, `isTopLevel` = `ແມ່ນ` → imported with `isTopLevel: true`.
  - A row whose manager appears later in the file → imported (Review Focus 3).
  - The template header includes the new column label.
  - Fix existing import fixtures so their valid rows have department + manager.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm --filter @hrm/api test -- import` → PASS.
- [ ] **Step 5: Commit** `feat(import): isTopLevel column and assignment errors`

### Task 5: Web form, list badge, profile and account

**Files:**
- Modify: `hrm-web/src/features/employees/components/EmployeeForm.tsx` (checkbox `isTopLevel` beside the manager picker; picker `disabled` + value cleared when ticked; required markers; edit resolver adds `assignmentIssues(changedFields, toUpdateFields(initial))` like `missingContractEnd`; non-blocking warning banner when `initial` already has issues)
- Modify: `hrm-web/src/features/employees/payload.ts` (`isTopLevel` is a boolean, not in `OPTIONAL_EMPLOYEE_FIELDS`. Keep `isTopLevel` and `managerId` together in `toUpdatePayload` when either changed, the same as the nationality pair.)
- Modify: `hrm-web/src/features/employees/components/EmployeeList.tsx` (warning badge when `assignmentIncomplete`)
- Modify: `hrm-web/src/features/employees/components/EmployeeProfile.tsx` (manager row → "Line manager" block: initials, name, `positionName`; or `employee.topLevelInfo`)
- Create: `hrm-web/src/features/employees/components/LineManagerCard.tsx` (used by the profile and the account page: `({ manager, isTopLevel, department }: Pick<EmployeeDetail,'manager'|'isTopLevel'|'department'>)`)
- Modify: `hrm-web/src/app/(app)/account/page.tsx` (query `GET /me/profile` through a hook in `hrm-web/src/features/employees/hooks.ts`, `useMyProfile()`. Render `LineManagerCard` on success; render nothing on 404 `no_employee_profile`.)
- Test: `hrm-web/test/employees.test.tsx`; `hrm-web/e2e/employees.spec.ts`, `employees-edit.spec.ts`

- [ ] **Step 1: Write failing tests** (`employees.test.tsx`):
  - Create form submitted without department → shows `error.department_required`. Without manager → `error.manager_required`.
  - Ticking the checkbox disables and clears the manager select. Submit then succeeds, and the payload has `isTopLevel: true` and no `managerId`.
  - Edit form for a legacy employee (no dept/manager): the warning banner shows; changing only status submits `{ status }` with no error (Review Focus 1).
  - Edit form: setting a manager on a top-level employee sends `{ managerId, isTopLevel: false }`.
  - The list renders the badge for `assignmentIncomplete: true` only.
  - `LineManagerCard` renders name + position, the top-level text, and the "not assigned" text for the three cases.
  - Update the e2e create flows to pick a department and a manager.
- [ ] **Step 2:** `pnpm --filter @hrm/web test -- employees` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm --filter @hrm/web test && pnpm --filter @hrm/web exec tsc --noEmit && pnpm --filter @hrm/web lint` → PASS.
- [ ] **Step 5: Commit** `feat(web): line manager in employee form, list and profile`

### Task 6: Mobile personal page

**Files:**
- Modify: `hrm-mobile/src/app/me/personal.tsx` (after the documents card, a "Line manager" card: `EmployeeAvatar` initials, name, `positionName`; `employee.topLevelInfo` when top level; `employee.managerMissing` when null and not top level; testIDs `line-manager-card`, `line-manager-name`, `line-manager-top`, `line-manager-missing`)
- Test: `hrm-mobile/__tests__/profile-settings.test.tsx`; `hrm-mobile/.maestro/flows/01-login-pin.yaml`

- [ ] **Step 1: Write failing tests:** a profile with a manager → `line-manager-name` has the text 'ບົວພັນ ສີສຸວັນ' and the position is shown. `isTopLevel: true, manager: null` → `line-manager-top`. `isTopLevel: false, manager: null` → `line-manager-missing` (Review Focus 5). Update the test fixture with `isTopLevel` and `manager.positionName`.
- [ ] **Step 2:** `cd hrm-mobile && npx jest __tests__/profile-settings.test.tsx` → FAIL.
- [ ] **Step 3:** Implement. Maestro flow 01: after the personal-info asserts, `scrollUntilVisible` `line-manager-name`.
- [ ] **Step 4:** `npx jest && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(mobile): line manager card on personal information`

### Task 7: Full verification

- [ ] **Step 1:** `pnpm -r test`, `pnpm -r exec tsc --noEmit`, `pnpm -r lint` → all green. The approvals and leave-calendar suites are unchanged and pass (Review Focus 4).
- [ ] **Step 2:** Re-seed the local DB (`pnpm db:start`, apply migrations, run the seed; never `migrate reset`).
- [ ] **Step 3:** Web in Chrome as admin@som.la: create an employee without a manager (error), tick top level (saves), check the list badge on a legacy row, open E003's profile (Line manager = E002), open `/account`.
- [ ] **Step 4:** Mobile on the phone as E003: Profile → Personal information → Line manager card shows ບົວພັນ ສີສຸວັນ.
- [ ] **Step 5:** Run Playwright `employees*.spec.ts` + `employee-import.spec.ts`, and the Maestro flow 01.
- [ ] **Step 6:** Update `docs/REQUIREMENT_TRACKING.md` with a row for this change. Commit once the user OKs it.
