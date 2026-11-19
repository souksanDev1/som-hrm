# Department and line manager required — design

Date: 2026-11-19 · Status: draft for approval (builder check done)

## Intent and why

Every employee belongs to exactly **one department** and has exactly **one line manager**. The line manager is
the person who approves that employee's requests (leave, overtime, attendance corrections, device changes…).
Today both fields exist but are optional, so an employee can be saved without them. Their requests then
silently go to HR, and the employee can't see who their manager is. The owner wants this data to be complete
and visible, like the reference app's "Personal information → Line manager" card.

## What already exists (no change needed)

- `Employee.departmentId` and `Employee.managerId` are single-valued (one department, one manager). The web
  employee form already has both pickers, and the Excel import already has `managerCode`.
- Approvals already route step 1 to the direct manager (`ApprovalStep.chainIndex = 0`). With no manager they
  fall back to HR (`approverUserId = null`, `approval.hr_fallback`). Delegations already work.
- Manager cycles are already rejected (`assertNoManagerCycle`, import `manager_cycle`).
- **Leave calendar: decided, no change.** An employee sees their own department. A manager additionally sees
  their whole reporting tree, even people in other departments. HR sees every department (FR-LV-13.1/13.4).

## Goals

1. **Department required** for every employee: web form, create/update API and Excel import.
2. **Line manager required** unless the employee is marked **top of the organisation** with a new checkbox
   "No line manager (top level) — requests go to HR".
3. **Show the line manager** (avatar initials, name, position) and the department on:
   - mobile **Personal information** page (`/me/personal`), as a "Line manager" card;
   - web **My account** page (`/account`);
   - the web employee detail page, if it doesn't already show them.
4. HR can **find incomplete employees**: the web employee list shows a warning badge
   ("Missing department / line manager") on employees that break the rule.

## Non-goals

- No change to approval routing, approval levels, delegations or the leave calendar.
- No automatic reassignment when a manager resigns or is terminated (their reports keep the old manager
  until HR edits them). The list badge (goal 4) doesn't flag this case either.
- No "multiple managers" or matrix reporting.
- No requirement for department heads (`Department.headEmployeeId`) to match line managers.

## Anti-goals (would make this a failure even if it "works")

- Blocking HR from routine partial edits of existing, incomplete employees (status change, resignation,
  documents, credentials), which would lock them out of urgent work.
- An employee whose requests go nowhere: every request must still reach a manager or HR.
- Breaking existing seed/E2E flows (Playwright, Maestro) or the approval tests.

## Decisions (made with the owner)

| Question | Decision |
|---|---|
| Calendar for managers with reports in other departments | Keep seeing them (current behaviour) |
| Make department + manager mandatory? | Yes, except the top person |
| How is "top person" marked? | **A: explicit checkbox** on the employee (new DB field) |

## Approaches considered for the "top person" marker

- **A. Explicit boolean on Employee (chosen).** Clear in the UI and in the import, independent of other
  settings. Costs one migration.
- B. Implicit: allowed only for the head of a root department. No migration, but confusing; changing a
  department head could make saves fail with no obvious reason, and a workspace without department heads
  could never have a top person.
- C. Implicit by role (e.g. the workspace owner). Fragile: roles describe access, not the reporting line.

## Design

### Data

- New column `Employee.isTopLevel Boolean @default(false)`, the "no line manager, requests go to HR" flag.
  Migration only adds the column (default false). **No data backfill**: existing employees keep their data.
- Seed: the boss (E001) gets `isTopLevel: true`. Every seed employee must have a department (check E001 and
  any other seed employee; add one where missing).
- Invariant (enforced on writes as below, not as a DB constraint):
  `departmentId != null` **and** (`isTopLevel == true` **xor** `managerId != null`).
  When `isTopLevel` is set to true, `managerId` is cleared in the same write.

### Validation rule (shared)

One shared helper in `@hrm/shared`, used by the API, web form and import:

`assignmentIssues({ departmentId, managerId, isTopLevel }) → ('department_required' | 'manager_required')[]`

- `department_required` when there is no department;
- `manager_required` when there is no manager and `isTopLevel` is false;
- if `isTopLevel` is true and a manager is also given **in the same input**, that's an error
  `manager_conflicts_top_level` (never silently dropped).

The helper takes the **stored** values and the **changes** (`assignmentIssues(stored, changes)`), so callers can
tell "the employee is incomplete" apart from "this edit makes it incomplete".

### API (`hrm-api/src/modules/employees`)

- **Create (POST /employees):** reject with 400 and the codes above when the rule fails.
- **Update (PATCH /employees/:id):** validate the **resulting** record (stored values merged with the patch),
  but **only when the patch touches** `departmentId`, `managerId` or `isTopLevel`. Patches that don't touch
  those fields (status, resignation, documents, contacts, credentials) are never blocked. This protects the
  anti-goal: legacy incomplete employees stay editable, and HR fixes them through the full form.
  - Clearing the department or manager on an employee that has one is rejected.
  - Setting `isTopLevel: true` (with no manager in the patch) clears `managerId` and records the change in the
    existing employee history (`TRACKED_FIELDS` gains `isTopLevel`).
  - *(Builder-check call)* Setting a non-null `managerId` on a top-level employee **automatically sets
    `isTopLevel: false`**. Giving a manager means the person now reports to someone, so requests go to that
    manager, never silently to HR. Sending `isTopLevel: true` together with a non-null `managerId` → 400
    `manager_conflicts_top_level`.
- Existing manager checks stay: the manager must be in the same workspace and must not create a cycle.
- **Detail / me responses** (`GET /employees/:id`, `GET /me/profile`) add `isTopLevel` and enrich `manager`
  with its position name: `{ id, name, positionName: string | null }`. Keep `id` and `name` as they are, so
  existing consumers keep working.
- **List response** (`GET /employees`) adds a boolean `assignmentIncomplete` per row, computed from the same
  rule, for the badge.

### Excel import

- New optional column `isTopLevel`, parsed with the import's existing boolean parser (it already accepts
  `ແມ່ນ/ບໍ່` and the English forms). Add it to the template and the column docs.
- Each row is validated with the shared rule. Missing department → row error `department_required`. Missing
  manager without top-level → `manager_required`. The existing behaviour (rows with errors aren't imported,
  errors listed per row) stays as it is.

### Web (`hrm-web`)

- **Employee form:** on **create**, department and manager-or-top-level are required (asterisk,
  client-side error). On **edit**, *(builder-check call)* they're required only when the edit touches
  department, manager or the checkbox (the form's PATCH already sends only changed fields, the same pattern
  as the existing `missingContractEnd` check). For a legacy incomplete employee, the edit form shows a
  non-blocking warning banner ("Missing department / line manager, please fill in") instead. So HR can still
  resign or terminate someone through the form without inventing a manager (anti-goal 1). Add the checkbox
  "No line manager (top level) — requests go to HR" next to the manager picker. When ticked, the picker is
  disabled and cleared. When unticked, the manager is required. Show API error codes in the existing error
  display (`e('managerId')`, `e('departmentId')`).
- **Employee list:** a small warning badge on rows with `assignmentIncomplete`. *(Builder-check call)* Only
  employees with an active status are flagged, since resigned or terminated people don't need fixing. Optionally a filter for it,
  at the builder's discretion (see below).
- **Employee detail page and My account (`/account`):** show department and a "Line manager" block (initials
  avatar, name, position), or "Top level, requests go to HR" when `isTopLevel`. *(Builder-check call)*
  `/account` loads `GET /me/profile`. For users without an employee profile (404 `no_employee_profile`,
  e.g. a pure HR login), the block is simply not shown.

### Mobile (`hrm-mobile`)

- `/me/personal`: add a "Line manager" card at the bottom (initials avatar via `EmployeeAvatar`, name,
  position), matching the reference screenshot's layout. When the employee is top level, show
  "Top level, requests go to HR". When the manager is missing (legacy data), show "Not assigned yet,
  contact HR".
- Department is already shown on that page; keep it.

### i18n

New Lao and English keys in the shared dictionaries: the checkbox label, the two error codes, the list badge,
the "Line manager" heading, the top-level text, the "not assigned" text and the import column label.

## Testing (required: "no bugs")

- **Shared:** unit tests for `assignmentIssues` covering all combinations.
- **API:** create without department → 400; create without manager and not top-level → 400; create
  top-level without manager → 201; PATCH that sets top-level clears the manager and writes history; PATCH
  setting a manager on a top-level employee unticks top level; PATCH with both top-level and a manager →
  400 `manager_conflicts_top_level`; PATCH clearing the manager → 400; PATCH status change on a legacy incomplete employee → 200 (not blocked);
  detail/me include `manager.positionName` and `isTopLevel`; list `assignmentIncomplete` is correct.
  Existing approval routing tests still pass unchanged.
- **Import:** rows missing department or manager fail with the right code. A top-level row without a manager
  imports. The `isTopLevel` column parses.
- **Web:** form tests for the required department, the checkbox disabling and clearing the manager, and the
  list badge. Update the Playwright employee flows that create employees so they fill in department and
  manager.
- **Mobile:** jest test for the Line manager card (manager / top level / missing). Maestro flow 01 asserts the
  card on the personal page.
- Full suites green: api, shared, web, mobile (`pnpm -r test`), lint and typecheck.

## Left to the builder

- Exact placement and styling of the badge and the Line manager blocks, following existing components.
- Whether to add an "incomplete only" filter to the employee list (nice to have, only if cheap).
