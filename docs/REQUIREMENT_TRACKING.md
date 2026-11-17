# SOM HRM — Requirement Tracking (Phase 1)

Source of IDs: TOR v1.0 (draft, 11/11/2026) §3.2 — IDs copied exactly; they are stated to match the FRD, which has not been
provided yet (see [TECHNICAL_ANALYSIS.md](TECHNICAL_ANALYSIS.md) §7). Generated from the TOR inventory on 2026-11-16 and then
maintained by hand: update **Status** / **Test** in the same commit that implements or tests a requirement.

**Status:** Not Started · In Progress · Implemented · Testing · Completed · Blocked.  
**Test:** Pending · Partial (some automated coverage) · Completed (unit/API + E2E cover it).  
**Priority:** MUST = ຕ້ອງມີ (required for acceptance/UAT) · SHOULD = ຄວນມີ.  
**Milestone:** see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Summary

| Module | MUST | SHOULD | Implemented | In Progress | Not Started |
|---|---|---|---|---|---|
| FR-WS | 27 | 4 | 25 | 2 | 4 |
| FR-AUTH | 9 | 2 | 10 | 0 | 1 |
| FR-EMP | 34 | 2 | 34 | 2 | 0 |
| FR-ORG | 8 | 2 | 7 | 3 | 0 |
| FR-ATT | 49 | 11 | 0 | 0 | 60 |
| FR-LV | 33 | 4 | 0 | 0 | 37 |
| FR-OB | 18 | 2 | 0 | 0 | 20 |
| FR-NOTI | 10 | 5 | 10 | 5 | 0 |
| FR-PAYDATA | 10 | 1 | 0 | 0 | 11 |
| FR-RPT | 8 | 1 | 0 | 0 | 9 |
| **Total** | **206** | **34** | **86** | **12** | **142** |

"Implemented" here means the M1–M4 code covers it; none of these are UAT-accepted yet.

## FR-WS

| ID | Pri | Requirement | Platform | Backend | DB | Milestone | Status | Test | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **FR-WS-01** | | **Create Workspace** (TOR p.2) | | | | | | | |
| FR-WS-01.1 | MUST | SOM Development creates a new Workspace for a customer company (**SOM super-admin function**) | Super Admin | Yes | Yes | M2 | Implemented | Completed | M2: /platform (PlatformUser, separate JWT scope) creates/suspends workspaces; API tests + e2e/platform.spec. |
| FR-WS-01.2 | MUST | Every table is segregated by `workspace_id` | Super Admin | Yes | Yes | M2 | Implemented | Partial | RLS on all tenant models incl. M2 tables (FORCE RLS); cross-tenant tests. 29 models still lack FK to Workspace. |
| **FR-WS-02** | | **Org structure and locations** (TOR p.2) | | | | | | | |
| FR-WS-02.1 | MUST | Add/edit/close branches | Web | Yes | Yes | M3 | Implemented | Partial | M3: edit (name/address/geofence) + close/reopen (POST /branches/:id/close|reopen); closed hidden from pickers (`?includeClosed=true` for settings), delete only when unused; audit with field changes. API + web unit tests; e2e/org-settings.spec written, not yet run. |
| FR-WS-02.2 | MUST | Add/edit/close departments | Web | Yes | Yes | M3 | Implemented | Partial | M3: edit name/parent (parent may be cleared) + close/reopen; closing blocked while open sub-departments exist; closed dept cannot become a parent. API + web unit tests; e2e pending run. |
| FR-WS-02.3 | MUST | Add/edit/close positions | Web | Yes | Yes | M3 | Implemented | Partial | M3: edit name/level + close/reopen, audited. API tests + e2e/org-settings.spec (close/reopen) written, not yet run. |
| FR-WS-02.4 | MUST | GPS geofence per branch (coordinates + radius) | Web | Yes | Yes | M3 | Implemented | Partial | M3: lat/lng/radius validated server-side (-90..90, -180..180, 20-5000 m int, both coordinates or none, also on partial PATCH); web numeric editor; shared `isWithinGeofence()` (haversine) unit-tested. Enforcement at check-in comes with attendance (M5). |
| **FR-WS-03** | | **Working days** (TOR p.2) | | | | | | | |
| FR-WS-03.1 | MUST | Workspace standard applies to all employees. Default is 6 days/week (Mon–Sat), 8 h/day, max 48 h/week | Web | Yes | Yes | M3 | Implemented | Partial | M3: effective-dated standard versions (WorkSchedule.isDefault + effectiveFrom, per-day hours); bootstrap/seed create Mon–Sat 8 h; limits from parameters `schedule.standardHoursPerDay` (legal max 8) / `schedule.maxHoursPerWeek` (legal max 48); /settings/work-schedule. API + shared tests; e2e/schedules.spec written, not yet run. |
| FR-WS-03.2 | MUST | Per-employee working-day override (for example 5 days, Saturday half-day, rest day not Sunday) | Web | Yes | Yes | M3 | Implemented | Partial | M3: ScheduleAssignment(employeeId, scheduleId null=standard, effectiveFrom); any 7-day pattern in half hours. Shared `resolveWorkPattern` + API `resolveEmployeeWorkPattern(tx, ws, employeeId, date)` with boundary tests. Legacy Employee.workScheduleId backfilled into assignments, no longer read. |
| FR-WS-03.3 | SHOULD | Bulk-select employees to apply an override | Web | Yes | Yes | M3 | Implemented | Partial | M3: POST /settings/work-schedule/overrides (up to 500 employees); web employee picker. API + web unit tests. |
| FR-WS-03.4 | SHOULD | "Revert to standard" button for employees with an override | Web | Yes | Yes | M3 | Implemented | Partial | M3: per-row and bulk revert, effective-dated; 409 `schedule_not_overridden` for employees already on the standard. |
| FR-WS-03.5 | MUST | Employee profile shows whether it uses the standard or an override | Web | Yes | Yes | M3 | Implemented | Partial | M3: work-schedule card on web employee detail (/employees/:id/work-schedule) and mobile profile (/me/work-schedule). Web vitest + mobile jest. |
| FR-WS-03.6 | MUST | Changing the standard does not affect employees who have an override | Web | Yes | Yes | M3 | Implemented | Partial | M3: guaranteed by the resolver (override assignment wins over any standard version); API + shared tests. |
| FR-WS-03.7 | MUST | Every change has an effective date and is recorded in the Audit Log | Web | Yes | Yes | M3 | Implemented | Partial | M3: effective date >= today on all changes; audit `schedule.standard.change/reschedule` (old/new pattern) and per-employee `schedule.override.apply/revert` (old/new, who, when). |
| **FR-WS-04** | | **Holiday calendar** (TOR p.3) | | | | | | | |
| FR-WS-04.1 | MUST | Default public holidays: 1 Jan, 14–16 Apr, 1 May, 2 Dec | Web | Yes | Yes | M3 | Implemented | Partial | M3: idempotent `ensureHolidayYear` on workspace creation, monthly `holiday-defaults` pg-boss job (current year + next year from December) and POST /holidays/ensure-year; HR-deleted defaults are not re-added. API + job tests; e2e/holidays.spec written, not yet run. |
| FR-WS-04.2 | MUST | 8 Mar is a holiday for female employees only | Web | Yes | Yes | M3 | Implemented | Partial | M3: `womenOnly` honoured by shared `holidaysFor()` (unit-tested) and GET /holidays/mine; engines (M5/M6) must call holidaysFor. |
| FR-WS-04.3 | MUST | HR adds traditional festival days | Web | Yes | Yes | M3 | Implemented | Partial | M3: Holiday.kind TRADITIONAL; CRUD API + web /settings/holidays; one holiday per date per workspace (409 date_taken). API + web unit tests. |
| FR-WS-04.4 | MUST | HR adds substitute (compensatory) holidays | Web | Yes | Yes | M3 | Implemented | Partial | M3: Holiday.kind SUBSTITUTE via the same CRUD. API tests; e2e pending run. |
| FR-WS-05 | SHOULD | Foreign employees get +1 day for their own national day, configured by nationality | Web | Yes | Yes | M3 | Implemented | Partial | M3: nullable Holiday.nationality (required for kind NATIONAL_DAY), matched case-insensitively against Employee.nationality by `holidaysFor()`; mobile "Holidays this year" shows the employee's own days. |
| **FR-WS-06** | | **Attendance mode per **branch**** (TOR p.3) | | | | | | | |
| FR-WS-06.1 | MUST | Mobile-app mode | Web | Yes | Yes | M5 | In Progress | Partial | M5 base: `Branch.attendanceModes` (default MOBILE), branch form checkboxes; enforced at mobile check-in (M5-C). |
| FR-WS-06.2 | MUST | Scanner-file upload mode | Web | Yes | Yes | M5 | In Progress | Partial | M5 base: mode configurable per branch; enforced by scanner import (M5-F). |
| FR-WS-06.3 | SHOULD | Kiosk mode | Web | Yes | Yes | M5 | In Progress | Partial | M5 base: mode configurable per branch; kiosk app M5-G. |
| FR-WS-06.4 | MUST | Multiple modes enabled at once in one branch | Web | Yes | Yes | M5 | Implemented | Passed | Per branch (client 2026-11-17 Q1); API `test/branch-attendance-modes.test.ts`, web form test. |
| **FR-WS-07** | | **Language** (TOR p.3) | | | | | | | |
| FR-WS-07.1 | MUST | System displays in Lao and English | Web/Mobile/Kiosk | Yes | — | M2 | In Progress | Partial | Shared lo/en dictionary; some hardcoded strings remain. |
| FR-WS-07.2 | MUST | Each user chooses their own language | Web/Mobile/Kiosk | Yes | Yes | M2 | Implemented | Partial | M2: PATCH /auth/me/locale; web account page + mobile profile switch. |
| **FR-WS-08** | | **Configurable parameters** (TOR p.3) | | | | | | | |
| FR-WS-08.1 | MUST | No hard-coded business numbers in the backend. All changeable numbers are read from a per-Workspace settings table | Web/Super Admin | Yes | Yes | M2 | In Progress | Partial | M2: effective-dated WorkspaceParameter/SystemParameter + shared registry; lockout/OTP/expiry days read from params. Further keys added per module. |
| FR-WS-08.2 | MUST | Admin/HR edit values in a settings screen. The frontend sends them to the backend as parameters via the API | Web/Super Admin | Yes | Yes | M2 | Implemented | Completed | M2: /settings/parameters API + web settings page. |
| FR-WS-08.3 | MUST | Backend validates type, min/max and the legal minimum before saving, and rejects with a reason message | Web/Super Admin | Yes | Yes | M2 | Implemented | Completed | M2: validateParameterValue (type/min/max) server-side, reason returned. |
| FR-WS-08.4 | MUST | A new Workspace starts with the defaults from the parameter table | Web/Super Admin | Yes | Yes | M2 | Implemented | Partial | M2: registry defaults apply when no row exists. |
| FR-WS-08.5 | MUST | Changes have an effective date. They do not alter historical data or closed periods | Web/Super Admin | Yes | Yes | M2 | Implemented | Completed | M2: effectiveFrom; reads are "as of" a date. |
| FR-WS-08.6 | MUST | Every change is audit-logged (old value, new value, who, when) | Web/Super Admin | Yes | Yes | M2 | Implemented | Completed | M2: audit old/new/who/when; AuditLog append-only trigger. |
| FR-WS-08.7 | MUST | System-level values (for example OTP, account lockout) are editable **only by SOM Development** (**SOM super-admin function**) | Web/Super Admin | Yes | Yes | M2 | Implemented | Completed | M2: /platform/parameters (platform scope only); SystemParameter writes bypass-only. |
## FR-AUTH

| ID | Pri | Requirement | Platform | Backend | DB | Milestone | Status | Test | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **FR-AUTH-01** | | **Login** (TOR p.4) | | | | | | | |
| FR-AUTH-01.1 | MUST | Login with employee code + password | Web/Mobile | Yes | Yes | M2 | Implemented | Completed | M2: password credential without email (B3). |
| FR-AUTH-01.2 | MUST | Login with phone number + password | Web/Mobile | Yes | Yes | M2 | Implemented | Completed | M2: phone + password. |
| FR-AUTH-01.3 | MUST | Email is not mandatory to create an account | Web/Mobile | Yes | Yes | M2 | Implemented | Completed | M2: email optional for all credential types. |
| **FR-AUTH-02** | | **OTP via SMS** (TOR p.4) | | | | | | | |
| FR-AUTH-02.1 | MUST | Verify identity at first login | Web/Mobile | Yes | Yes | M2 | Implemented | Completed | M2: OTP phone verification gate (auto-off in production while only console SMS sender exists); Maestro flow 04. |
| FR-AUTH-02.2 | MUST | Forgotten-password reset | Web/Mobile | Yes | Yes | M2 | Implemented | Completed | M2: /auth/password/forgot|reset + /auth/pin/reset; web + mobile; Maestro flow 05. Real SMS gateway pending. |
| **FR-AUTH-03** | | **Password reset by HR** (TOR p.4) | | | | | | | |
| FR-AUTH-03.1 | MUST | HR resets the password for employees with no email and no phone | Web/Mobile | Yes | Yes | M2 | Implemented | Partial | POST /employees/:id/credentials issues temp PIN/password, revokes sessions. |
| FR-AUTH-03.2 | MUST | Force a password change at first login | Web/Mobile | Yes | Yes | M2 | Implemented | Completed | M2: API blocks other routes until credential changed (credential_change_required). |
| **FR-AUTH-04** | | **Quick app login** (TOR p.4) | | | | | | | |
| FR-AUTH-04.1 | SHOULD | Set a PIN | Web/Mobile | Yes | Yes | M2 | Implemented | Completed | PIN login + change-pin; Maestro flow on Android. |
| FR-AUTH-04.2 | SHOULD | Use the phone's fingerprint/face biometrics | Web/Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| FR-AUTH-05 | MUST | Temporary account lock after **5 consecutive wrong passwords** | Web/Mobile | Yes | Yes | M2 | Implemented | Completed | M2: 5 tries / 15 min from system params (auth.lockout.*). |
| FR-AUTH-06 | MUST | Auto-disable login when the employee leaves (separation) | Web/Mobile | Yes | Yes | M2 | Implemented | Completed | M2: resignation/termination deactivates login + revokes sessions; scheduled job for future dates. |
## FR-EMP

| ID | Pri | Requirement | Platform | Backend | DB | Milestone | Status | Test | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **FR-EMP-01** | | **Personal data** (TOR p.5) | | | | | | | |
| FR-EMP-01.1 | MUST | First/last name in Lao and English | Web/Mobile | Yes | Yes | M3 | Implemented | Partial | M3: firstName/lastName = Lao, new firstNameEn/lastNameEn (backfilled from plain-Latin names); searchable; web/mobile. Playwright/Maestro added, run pending. |
| FR-EMP-01.2 | MUST | Date of birth, gender, nationality | Web/Mobile | Yes | Yes | M3 | Implemented | Partial | Verified M3: DOB, gender, nationality (+country for foreign) on API/web; clearable. |
| FR-EMP-01.3 | MUST | Phone and email (email optional) | Web/Mobile | Yes | Yes | M3 | Implemented | Partial | Verified M3: Lao phone normalised, email optional; clearable. |
| FR-EMP-01.4 | MUST | Address: village (ບ້ານ), district (ເມືອງ), province (ແຂວງ) | Web/Mobile | Yes | Yes | M3 | Implemented | Partial | M3: village/district free text + province code from LAO_PROVINCES (18) picker; free-text detail kept. Playwright/Maestro added, run pending. |
| FR-EMP-01.5 | MUST | Emergency contact | Web/Mobile | Yes | Yes | M3 | Implemented | Partial | M3: add/update/delete (PATCH .../emergency-contacts/:id), all audited with contactId. Playwright/Maestro added, run pending. |
| **FR-EMP-02** | | **Lao documents** (TOR p.5) | | | | | | | |
| FR-EMP-02.1 | MUST | ID card number | Web | Yes | Yes | M3 | Implemented | Partial | Verified M3: AES-GCM encrypted + HMAC blind index unique per workspace; masked without employee.sensitive.read. |
| FR-EMP-02.2 | MUST | Family book (ສຳມະໂນຄົວ) number + household head name | Web | Yes | Yes | M3 | Implemented | Partial | M3: familyBookNo encrypted/masked + familyBookHolder (household head). |
| FR-EMP-02.3 | MUST | Social security number + registration date | Web | Yes | Yes | M3 | Implemented | Partial | M3: SSN encrypted/masked + ssnRegisteredAt. |
| **FR-EMP-03** | | **Employment data** (TOR p.5) | | | | | | | |
| FR-EMP-03.1 | MUST | Employee code | Web/Mobile | Yes | Yes | M3 | Implemented | Completed |  |
| FR-EMP-03.2 | MUST | Position, department, branch | Web/Mobile | Yes | Yes | M3 | Implemented | Completed |  |
| FR-EMP-03.3 | MUST | Direct manager | Web/Mobile | Yes | Yes | M3 | Implemented | Completed | Cycle prevention. |
| FR-EMP-03.4 | MUST | Start date | Web/Mobile | Yes | Yes | M3 | Implemented | Completed |  |
| FR-EMP-03.5 | MUST | Contract type: indefinite / fixed-term / probation | Web/Mobile | Yes | Yes | M3 | Implemented | Partial | M3: contractType INDEFINITE/FIXED_TERM/PROBATION + contractEndDate/probationEndDate (not before hire date); migrated from EmploymentType (dropped). Fixed-term needs contractEndDate for new data (create, import, switching to fixed-term or clearing the date; legacy rows without one stay editable) — `contract_end_required`. API/shared/web tests + Playwright pass (2026-11-17). |
| FR-EMP-03.6 | MUST | Pay type: monthly / daily / hourly | Web/Mobile | Yes | Yes | M3 | Implemented | Partial | M3: payType MONTHLY/DAILY/HOURLY, migrated from EmploymentType; tracked in history. Playwright/Maestro added, run pending. |
| FR-EMP-03.7 | MUST | Flag for hazardous-work employees | Web/Mobile | Yes | Yes | M3 | Implemented | Partial | hazardousWork flag. |
| **FR-EMP-04** | | **Foreign-employee documents** (TOR p.5) | | | | | | | |
| FR-EMP-04.1 | MUST | Passport | Web | Yes | Yes | M3 | Implemented | Partial | Verified M3: metadata + file upload (M2) for any document type. |
| FR-EMP-04.2 | MUST | Visa | Web | Yes | Yes | M3 | Implemented | Partial | Verified M3: metadata + file upload (M2) for any document type. |
| FR-EMP-04.3 | MUST | Work permit | Web | Yes | Yes | M3 | Implemented | Partial | Verified M3: metadata + file upload (M2) for any document type. |
| FR-EMP-04.4 | MUST | Residence (stay) permit | Web | Yes | Yes | M3 | Implemented | Partial | M3: DocumentType RESIDENCE_PERMIT (foreign-worker doc; file upload, expiry alerts, overview). |
| FR-EMP-04.5 | MUST | Each document stores number, issue date, expiry date and an attached file | Web | Yes | Yes | M2 | In Progress | Pending | Number/dates stored; file upload missing. |
| **FR-EMP-05** | | **Document-expiry alerts** (TOR p.6) | | | | | | | |
| FR-EMP-05.1 | MUST | Alert at **90, 60, 30 and 7 days** before expiry | Web/Mobile | Yes | Yes | M3 | In Progress | Partial | M2: 90/60/30/7 from workspace param + daily job; expiry status from API. Overview/UI polish in M3. |
| FR-EMP-05.2 | MUST | Send to both HR and the employee | Web/Mobile | Yes | Yes | M3 | Implemented | Partial | Verified M3: job notifies every active employee.write user + the employee (once, deduped); API test covers recipients. |
| FR-EMP-05.3 | SHOULD | HR configures the alert days | Web/Mobile | Yes | Yes | M3 | Implemented | Partial | Verified M3: document.expiryAlertDays on Settings > Parameters; editing via `editPermission`: OWNER (settings.manage) and HR_ADMIN (employee.write) may change it; other parameters stay settings.manage. API/shared/web tests pass (2026-11-17). |
| FR-EMP-05.4 | MUST | Red status once expired | Web/Mobile | Yes | — | M3 | Implemented | Partial | Verified M3: API status; red (danger) badge on web detail/overview and mobile profile. Playwright/Maestro added, run pending. |
| FR-EMP-06 | SHOULD | Expiring-documents overview, filterable by branch and document type | Web | Yes | Yes | M3 | Implemented | Partial | M3: GET /documents/expiring (branch/type/status filters, data scope) + web /documents/expiring. Playwright/Maestro added, run pending. |
| **FR-EMP-07** | | **Document upload** (TOR p.6) | | | | | | | |
| FR-EMP-07.1 | MUST | Upload contract, ID cards, education certificates | Web | Yes | Yes | M2 | Implemented | Completed | M2: PUT/GET /employees/:id/documents/:docId/file; web FileUpload. |
| FR-EMP-07.2 | MUST | Support PDF, JPG, PNG | Web | Yes | Yes | M2 | Implemented | Completed | M2: magic-byte validation PDF/JPG/PNG; size limit. |
| **FR-EMP-08** | | **Employment history** (TOR p.6) | | | | | | | |
| FR-EMP-08.1 | MUST | Record position changes | Web | Yes | Yes | M3 | Implemented | Partial | M3: position changes recorded; history shows resolved names on web detail. Playwright/Maestro added, run pending. |
| FR-EMP-08.2 | MUST | Record department/branch transfers | Web | Yes | Yes | M3 | Implemented | Partial | M3: department/branch changes recorded with names. Playwright/Maestro added, run pending. |
| FR-EMP-08.3 | MUST | Record manager changes | Web | Yes | Yes | M3 | Implemented | Partial | M3: manager changes recorded; web form now has a manager picker. Playwright/Maestro added, run pending. |
| FR-EMP-08.4 | MUST | Each entry has an effective date | Web | Yes | Yes | M3 | Implemented | Partial | M3: HR-chosen effective date (default today in workspace TZ) per entry. Playwright/Maestro added, run pending. |
| **FR-EMP-09** | | **Bulk import** (TOR p.6) | | | | | | | |
| FR-EMP-09.1 | MUST | Import via Excel/CSV | Web | Yes | Yes | M3 | Implemented | Partial | M3: .xlsx/CSV upload (magic bytes, zip-bomb + row limit `employee.importMaxRows`), Lao+English template, rows created via the single-create path in one all-or-nothing transaction with per-employee + summary audit. Own permission `employee.import` (granted by migration to every role holding employee.write); manager rows may appear in any order (managers created first, reporting loops → `manager_cycle`). API + web unit tests + Playwright pass (2026-11-17). |
| FR-EMP-09.2 | MUST | Report error rows before the import is confirmed | Web | Yes | Yes | M3 | Implemented | Partial | M3: preview (rolled-back dry run) lists row/column/translated reason incl. in-file and existing duplicates, unknown/closed org units, seat limit, formulas; confirm needs a signed token bound to the file hash and re-validates. Playwright added, run pending. |
| **FR-EMP-10** | | **Duplicate checks within a Workspace** (TOR p.6) | | | | | | | |
| FR-EMP-10.1 | MUST | Employee code | Web | Yes | Yes | M3 | Implemented | Completed | Unique (workspaceId, employeeCode). |
| FR-EMP-10.2 | MUST | Social security number | Web | Yes | Yes | M3 | Implemented | Partial | M3: 409 duplicate_social_security_no, also for the race (P2002 -> savepoint re-check). |
| FR-EMP-10.3 | MUST | ID card number | Web | Yes | Yes | M3 | Implemented | Partial | M3: 409 duplicate_national_id, also for the race (P2002 -> savepoint re-check). |
## FR-ORG

| ID | Pri | Requirement | Platform | Backend | DB | Milestone | Status | Test | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **FR-ORG-01** | | **Display org chart** (TOR p.7) | | | | | | | |
| FR-ORG-01.1 | MUST | Hierarchy Company > Branch > Department > Position | Web/Mobile | Yes | Yes | M1 | In Progress | Partial | Branch/Department/Position + reporting line exist. |
| FR-ORG-01.2 | MUST | View chart on web | Web/Mobile | Yes | — | M1 | Implemented | Completed | /org tree; Playwright spec. |
| FR-ORG-01.3 | MUST | View chart in mobile app | Web/Mobile | Yes | — | M1 | In Progress | Completed | Flat list, not virtualised; Maestro flow. |
| FR-ORG-02 | MUST | Chain of command is the default approval chain | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M4: generic approval engine (ApprovalRequest/ApprovalStep, replaces LeaveApproval) routes up the Employee.managerId chain for `approval.levels` (default 1); no manager → HR (`approval.hr_fallback`). Inbox/detail/approve/reject API, web /approvals, mobile screen. API/shared/web/mobile tests; E2E + Maestro written, not yet run. |
| **FR-ORG-03** | | **Delegate approver** (TOR p.7) | | | | | | | |
| FR-ORG-03.1 | MUST | Manager appoints a delegate with a date range | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M4: delegation API (no self, no overlap, active delegate in the same workspace, every change audited) + web account card + mobile screen; HR manages other managers' with `approval.delegate.manage`. |
| FR-ORG-03.2 | MUST | When a manager files leave, the system prompts for a delegate, who is auto-activated for the leave period | Web/Mobile | Yes | Yes | M4 | In Progress | Partial | M4: `ensureDelegationForAbsence()` + POST /approvals/delegations/absence (API-tested). Left for M6: prompt in the leave form, call the hook on leave submit, cancel the delegation when the leave is cancelled. |
| FR-ORG-04 | MUST | If the manager is on leave with no delegate, requests auto-route to the next-level manager | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M4: pure `resolveApprover()` (shared, unit-tested) skips an approver on approved leave without a delegate, at submission and at each level. |
| **FR-ORG-05** | | **Escalate stale requests** (TOR p.7) | | | | | | | |
| FR-ORG-05.1 | SHOULD | Requests unapproved for more than X working days (**default 2**) escalate upward | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M4: daily pg-boss `approval-escalation` job; working days from the approver's work pattern + holidays; idempotent; `approval.escalationWorkingDays` (default 2). |
| FR-ORG-05.2 | SHOULD | Notify HR on escalation | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M4: escalation notifies HR (`approval.hr_fallback` holders) and the new approver (APPROVAL_ESCALATED). |
| FR-ORG-06 | MUST | Record who approved and in what capacity (manager / delegate / upper level) | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M4: each ApprovalStep stores the decider and capacity MANAGER/DELEGATE/UPPER_LEVEL/HR; shown in web/mobile history and audited. |
## FR-ATT

| ID | Pri | Requirement | Platform | Backend | DB | Milestone | Status | Test | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **FR-ATT-01** | | **Mobile-app attendance** (TOR p.7) | | | | | | | |
| FR-ATT-01.1 | MUST | Check-in | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-01.2 | MUST | Check-out | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-01.3 | MUST | Record GPS on every punch | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-01.4 | MUST | Selfie photo (toggle on/off per Workspace) | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-02** | | **Scanner-file upload** (TOR p.8) | | | | | | | |
| FR-ATT-02.1 | MUST | ZKTeco file template | Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-02.2 | MUST | HIP file template | Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-02.3 | MUST | Generic Excel/CSV template for other brands | Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-02.4 | MUST | Auto-match employee codes | Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-02.5 | MUST | Show unmatched or duplicate rows | Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-02.6 | MUST | HR reviews and confirms before saving | Web | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-03** | | **Kiosk for employees without smartphones** (TOR p.8) | | | | | | | |
| FR-ATT-03.1 | SHOULD | Kiosk mode on a shared on-site tablet | Kiosk | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-03.2 | SHOULD | Punch with employee code + PIN | Kiosk | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-03.3 | SHOULD | Photo at punch | Kiosk | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-04** | | **HR punches on behalf** (TOR p.8) | | | | | | | |
| FR-ATT-04.1 | MUST | HR records time for an employee | Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-04.2 | MUST | Reason mandatory | Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-04.3 | MUST | Audit-logged | Web | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-05** | | **Offline check-in** (TOR p.8) | | | | | | | |
| FR-ATT-05.1 | MUST | Store time, GPS and photo on the device when offline | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-05.2 | MUST | Auto-sync when back online | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-06** | | **Offline-record display** (TOR p.8) | | | | | | | |
| FR-ATT-06.1 | MUST | Label "offline record" | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-06.2 | MUST | Show the actual submission time | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-07** | | **Device-time check** (TOR p.8) | | | | | | | |
| FR-ATT-07.1 | MUST | Compare device time with server time at submission | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-07.2 | MUST | Difference **> 5 minutes** is flagged suspicious | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-08 | SHOULD | Alert the employee when offline data has been unsent for **> 72 hours** | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-09** | | **Fake GPS** (TOR p.9) | | | | | | | |
| FR-ATT-09.1 | MUST | Detect mock-location apps | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-09.2 | MUST | Block check-in when detected | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-10** | | **Tampered devices** (TOR p.9) | | | | | | | |
| FR-ATT-10.1 | SHOULD | Detect rooted/jailbroken devices | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-10.2 | SHOULD | Flag their punches as suspicious | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-11** | | **Device binding** (TOR p.9) | | | | | | | |
| FR-ATT-11.1 | MUST | Bind 1 employee to 1 device | Mobile/Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-11.2 | MUST | Employee requests a device change | Mobile/Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-11.3 | MUST | HR approves the device change | Mobile/Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-12 | SHOULD | Optional branch Wi-Fi check as an extra verification layer | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-13 | SHOULD | Selfie liveness check (anti-photo spoofing) | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-14** | | **Suspicious-record review queue** (TOR p.9) | | | | | | | |
| FR-ATT-14.1 | MUST | All suspicious records in one queue | Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-14.2 | MUST | HR approves or rejects each item | Web | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-15** | | **Outside geofence** (TOR p.9) | | | | | | | |
| FR-ATT-15.1 | MUST | Block normal check-in outside the zone | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-15.2 | MUST | Show distance from the branch | Mobile | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-16** | | **Off-site work** (TOR p.9) | | | | | | | |
| FR-ATT-16.1 | MUST | HR grants an individual "off-site work" permission | Mobile/Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-16.2 | MUST | Permitted employees can check in out-of-zone with a reason | Mobile/Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-16.3 | MUST | Manager approves the out-of-zone check-in | Mobile/Web | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-17** | | **Shifts** (TOR p.10) | | | | | | | |
| FR-ATT-17.1 | MUST | Define normal shifts | Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-17.2 | MUST | Define night shifts crossing midnight | Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-17.3 | MUST | Rotating shift roster | Web | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-18** | | **Attendance calculation** (TOR p.10) | | | | | | | |
| FR-ATT-18.1 | MUST | Late arrival | Backend | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-18.2 | MUST | Early leave | Backend | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-18.3 | MUST | Absence | Backend | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-18.4 | MUST | Detect missing check-in/out | Backend | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-18.5 | MUST | Configurable grace period | Backend | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-19** | | **Time-correction requests** (TOR p.10) | | | | | | | |
| FR-ATT-19.1 | MUST | Employee submits a correction (forgot / wrong time) with reason + attachment | Mobile/Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-19.2 | MUST | Manager approves/rejects | Mobile/Web | Yes | Yes | M5 | Not Started | Pending |  |
| FR-ATT-19.3 | MUST | Keep both the original and the corrected time | Mobile/Web | Yes | Yes | M5 | Not Started | Pending |  |
| **FR-ATT-20** | | **OT requests** (TOR p.10) | | | | | | | |
| FR-ATT-20.1 | MUST | Pre-approval OT request | Mobile/Web | Yes | Yes | M5 | Implemented | Test Passed | `POST /overtime` kind PRE (filed before start), must be outside the scheduled shift; web /overtime, mobile /overtime/new; actual = overlap of approved window with worked time once punches are final |
| FR-ATT-20.2 | MUST | Post-hoc OT request | Mobile/Web | Yes | Yes | M5 | Implemented | Test Passed | kind POST (after end); given times stored as actual |
| FR-ATT-20.3 | MUST | Manager approves/rejects | Mobile/Web | Yes | Yes | M5 | Implemented | Test Passed | OVERTIME approval handler (summary: date, times, total + categories) via approval inbox |
| **FR-ATT-21** | | **OT hours recorded by category (payroll applies rates)** (TOR p.10) | | | | | | | |
| FR-ATT-21.1 | MUST | Workday, daytime | Backend/Web | Yes | Yes | M5 | Implemented | Test Passed | shared `splitOvertime`; 4 category minutes stored per request; `GET /overtime` + web /overtime/report per employee/category |
| FR-ATT-21.2 | MUST | Workday, night | Backend/Web | Yes | Yes | M5 | Implemented | Test Passed | night window `ot.nightStart`/`ot.nightEnd` (22:00–05:00) |
| FR-ATT-21.3 | MUST | Holiday/festival, daytime | Backend/Web | Yes | Yes | M5 | Implemented | Test Passed | holiday per employee (8 March women only) + weekly rest day when `ot.restDayCountsAsHoliday` |
| FR-ATT-21.4 | MUST | Holiday/festival, night | Backend/Web | Yes | Yes | M5 | Implemented | Test Passed | as 21.3, night window |
| **FR-ATT-22** | | **OT cap** (TOR p.11) | | | | | | | |
| FR-ATT-22.1 | SHOULD | Set OT cap per day and per month (**no numeric value given**) | Web/Mobile | Yes | Yes | M5 | Implemented | Test Passed | `ot.maxMinutesPerDay`/`ot.maxMinutesPerMonth` (180/2700); pending+approved counted; over cap = 409 `ot_cap_exceeded` (blocked) |
| FR-ATT-22.2 | SHOULD | Warn when nearing the cap | Web/Mobile | Yes | Yes | M5 | Implemented | Test Passed | `POST /overtime/preview` day/month cap status, warn at `ot.warnPercent`; web + mobile badges |
| FR-ATT-23 | SHOULD | Show approved OT hours in the employee app | Mobile | Yes | Yes | M5 | Implemented | Test Passed | mobile /overtime: approved hours by category + requests per month (`GET /overtime/me`) |
## FR-LV

| ID | Pri | Requirement | Platform | Backend | DB | Milestone | Status | Test | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **FR-LV-01** | | **Leave-day entitlements** (TOR p.11) | | | | | | | |
| FR-LV-01.1 | MUST | HR edits the day count per leave type | Web | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-01.2 | MUST | Block settings below the legal minimum | Web | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-02 | MUST | Custom leave types (for example ordination, exam leave) | Web | Yes | Yes | M6 | Not Started | Pending |  |
| **FR-LV-03** | | **Leave units** (TOR p.11) | | | | | | | |
| FR-LV-03.1 | MUST | Full day | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-03.2 | MUST | Half day, morning or afternoon | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-03.3 | MUST | Compute leave days from the employee's own working days (standard or override) | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| **FR-LV-04** | | **Day-counting method** (TOR p.12) | | | | | | | |
| FR-LV-04.1 | MUST | Maternity counted in calendar days | Backend | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-04.2 | MUST | Other types count working days only | Backend | Yes | Yes | M6 | Not Started | Pending |  |
| **FR-LV-05** | | **Medical certificate** (TOR p.12) | | | | | | | |
| FR-LV-05.1 | MUST | Certificate mandatory when sick leave **> 1 day** | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-05.2 | MUST | HR configures the day threshold for a certificate | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-05.3 | MUST | Certificate may be attached afterwards within **3 days** | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| **FR-LV-06** | | **Eligibility check before submit** (TOR p.12) | | | | | | | |
| FR-LV-06.1 | MUST | Check tenure | Backend | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-06.2 | MUST | Check remaining balance | Backend | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-06.3 | MUST | Check gender for maternity leave | Backend | Yes | Yes | M6 | Not Started | Pending |  |
| **FR-LV-07** | | **Leave balance ledger** (TOR p.12) | | | | | | | |
| FR-LV-07.1 | MUST | Record every movement: accrual/grant, use, cancel | Web | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-07.2 | MUST | HR adjusts the balance with a reason | Web | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-07.3 | MUST | View per-person ledger for audit | Web | Yes | Yes | M6 | Not Started | Pending |  |
| **FR-LV-08** | | **Annual-leave carry-over** (TOR p.12) | | | | | | | |
| FR-LV-08.1 | SHOULD | Carry-over policy for unused days into next year | Web | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-08.2 | SHOULD | Expiry date for carried-over days | Web | Yes | Yes | M6 | Not Started | Pending |  |
| **FR-LV-09** | | **Submit leave** (TOR p.12) | | | | | | | |
| FR-LV-09.1 | MUST | Via mobile app | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-09.2 | MUST | Via web | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| **FR-LV-10** | | **Proxy leave submission (for staff without smartphones)** (TOR p.12) | | | | | | | |
| FR-LV-10.1 | MUST | HR files on behalf | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-10.2 | MUST | Manager files on behalf of a team member | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| **FR-LV-11** | | **Approval chain** (TOR p.13) | | | | | | | |
| FR-LV-11.1 | MUST | 1–2 approval levels per the org chart | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-11.2 | MUST | Apply delegate rules FR-ORG-03 to FR-ORG-05 | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| **FR-LV-12** | | **Cancel leave** (TOR p.13) | | | | | | | |
| FR-LV-12.1 | MUST | Cancel an unapproved request immediately | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-12.2 | MUST | Request cancellation of approved leave (needs approval) | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| **FR-LV-13** | | **Leave calendar** (TOR p.13) | | | | | | | |
| FR-LV-13.1 | MUST | Employees view their own department's leave calendar in app and web | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-13.2 | MUST | "Today" view: who is on leave today, full or half day | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-13.3 | MUST | Toggle weekly/monthly views | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-13.4 | MUST | Managers at every level see all subordinates beneath them (all lower levels) | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-13.5 | SHOULD | Manager filters by department/sub-team and leave type | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-13.6 | MUST | Visibility: regular staff see only "on leave" (no type/reason). Managers and HR see the type | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-13.7 | MUST | Approved vs pending in different colours. Regular staff see approved only | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-13.8 | MUST | Show public holidays and weekly rest days | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-13.9 | MUST | HR views all departments | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
| FR-LV-13.10 | SHOULD | From the approval screen, the manager sees which team members are already on leave that day | Web/Mobile | Yes | Yes | M6 | Not Started | Pending |  |
## FR-OB

| ID | Pri | Requirement | Platform | Backend | DB | Milestone | Status | Test | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **FR-OB-01** | | **New-hire checklist** (TOR p.14) | | | | | | | |
| FR-OB-01.1 | MUST | Checklist templates per position | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-01.2 | MUST | Standard items: documents, equipment, accounts, social-security registration | Web | Yes | Yes | M7 | Not Started | Pending |  |
| **FR-OB-02** | | **Checklist task tracking** (TOR p.14) | | | | | | | |
| FR-OB-02.1 | MUST | Assign an owner per task | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-02.2 | MUST | Due date per task | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-02.3 | MUST | Alert when overdue | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-03 | SHOULD | Probation-ending alert to manager and HR **7 days** before | Web/Mobile | Yes | Yes | M7 | Not Started | Pending |  |
| **FR-OB-04** | | **Separation record** (TOR p.14) | | | | | | | |
| FR-OB-04.1 | MUST | Type: resignation / contract end / termination | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-04.2 | MUST | Reason | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-04.3 | MUST | Notice date | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-04.4 | MUST | Last working day | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-05 | SHOULD | Check the notice period and warn HR if shorter than policy | Web | Yes | Yes | M7 | Not Started | Pending |  |
| **FR-OB-06** | | **Exit Snapshot up to the last day** (TOR p.14) | | | | | | | |
| FR-OB-06.1 | MUST | Remaining annual-leave balance | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-06.2 | MUST | Approved but unpaid OT | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-06.3 | MUST | Absence days and unpaid-leave days | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-06.4 | MUST | Tenure (years and months) | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-06.5 | MUST | Lock the snapshot after HR confirmation | Web | Yes | Yes | M7 | Not Started | Pending |  |
| **FR-OB-07** | | **Close-out** (TOR p.14) | | | | | | | |
| FR-OB-07.1 | MUST | Equipment-return checklist | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-07.2 | MUST | Account-closure checklist | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-07.3 | MUST | Disable login on the last day | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-OB-08 | MUST | Retain leavers' data (no deletion) for audit and rehire | Web | Yes | Yes | M7 | Not Started | Pending |  |
## FR-NOTI

| ID | Pri | Requirement | Platform | Backend | DB | Milestone | Status | Test | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **FR-NOTI-01** | | **Channels** (TOR p.15) | | | | | | | |
| FR-NOTI-01.1 | MUST | Mobile push notifications | Web/Mobile | Yes | Yes | M4 | In Progress | Partial | M4: Expo push provider (HTTP, 100/request), receipts after 15 min, DeviceNotRegistered → token removed, retry/backoff via outbox; mobile asks permission after sign-in, registers/unregisters the Expo token; gated on EAS projectId. Blocked on EAS project + FCM V1 + APNs credentials (README). API + Jest tests; no real-device test yet. |
| FR-NOTI-01.2 | MUST | In-app notification centre | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M2 tab; M4: unread badge on the tab, tap marks read + opens link, pull to refresh. Jest tests; Maestro 07-notification-deep-link written, not yet run. |
| FR-NOTI-01.3 | MUST | Web notification centre | Web/Mobile | Yes | Yes | M4 | Implemented | Completed | M2: web NotificationCenter + /notifications. |
| **FR-NOTI-02** | | **SMS** (TOR p.15) | | | | | | | |
| FR-NOTI-02.1 | SHOULD | Send OTP via SMS | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M2 OTP (FR-AUTH-02) already sends via SmsSender (console provider only; real gateway TBD by customer). API tests (auth-otp). |
| FR-NOTI-02.2 | SHOULD | SMS key events to employees without the app | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M4: key events (APPROVAL_DECISION, DOCUMENT_EXPIRY, PROBATION_ENDING) queue an SMS for users with a phone and no registered app device; per-type lo/en template rendered at queue time, ≤160 chars. Console provider only. API tests. Employees with no login at all are not reachable (Notification needs a user). |
| FR-NOTI-02.3 | SHOULD | Enable/disable SMS per Workspace | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M4: `notification.smsEnabled` editable on /settings/parameters (effective-dated) and re-checked by the delivery job (pending SMS SKIPPED when off). API tests; Playwright written, not yet run. |
| **FR-NOTI-03** | | **Notified events** (TOR p.15) | | | | | | | |
| FR-NOTI-03.1 | MUST | Request pending approval | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M4: APPROVAL_PENDING to the approver + delegate (or HR) with link /approvals/:id. |
| FR-NOTI-03.2 | MUST | Approval result | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M4: APPROVAL_DECISION to the requester on the final approve/reject. |
| FR-NOTI-03.3 | MUST | Missing check-in/out | Web/Mobile | Yes | Yes | M4 | In Progress | Pending | M4: type MISSING_PUNCH + lo/en templates (notif.missingPunch.*, SMS) ready for M5 to call notify(); trigger is M5. |
| FR-NOTI-03.4 | MUST | Document expiring | Web/Mobile | Yes | Yes | M4 | In Progress | Partial | M2: document-expiry job notifies HR + employee (dedupe). |
| FR-NOTI-03.5 | MUST | Probation ending | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M4: daily job probation-ending-alerts (07:05 Asia/Vientiane) notifies HR (employee.write) + manager at `probation.alertDays` (default 14/7), workspace timezone, dedupe per end date + stage; no end date → skipped. API tests. |
| FR-NOTI-03.6 | MUST | Suspicious record (to HR) | Web/Mobile | Yes | Yes | M4 | In Progress | Pending | M4: type SUSPICIOUS_ATTENDANCE + lo/en templates (notif.suspicious.*) ready for M5; trigger is M5. |
| FR-NOTI-03.7 | MUST | Offline data not yet synced | Web/Mobile | Yes | Yes | M4 | In Progress | Pending | M4: type OFFLINE_UNSYNCED + lo/en templates (notif.offlineUnsynced.*) ready for M5; trigger is M5. |
| **FR-NOTI-04** | | **Notification management** (TOR p.15) | | | | | | | |
| FR-NOTI-04.1 | SHOULD | Mark as read | Web/Mobile | Yes | Yes | M4 | Implemented | Completed | M2: read / read-all. |
| FR-NOTI-04.2 | SHOULD | Deep-link to the related screen | Web/Mobile | Yes | Yes | M4 | Implemented | Partial | M4: one shared mapping `resolveNotificationLink` (packages/shared) used by web, the mobile list and push taps; unknown/unsafe links stay on the list. Shared/web/Jest tests; Playwright + Maestro written, not yet run. |
## FR-PAYDATA

| ID | Pri | Requirement | Platform | Backend | DB | Milestone | Status | Test | Notes |
|---|---|---|---|---|---|---|---|---|---|
| FR-PAYDATA-01 | MUST | Approved OT hours by the 4 categories and by period | Web | Yes | Yes | M7 | Not Started | Pending |  |
| **FR-PAYDATA-02** | | **Attendance data per period** (TOR p.16) | | | | | | | |
| FR-PAYDATA-02.1 | MUST | Absence days | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-PAYDATA-02.2 | MUST | Late time (minutes) | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-PAYDATA-02.3 | MUST | Unpaid-leave days | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-PAYDATA-02.4 | MUST | Leave days by type | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-PAYDATA-03 | MUST | Exit Snapshot per FR-OB-06 | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-PAYDATA-04 | MUST | Social-security number, pay type, start date, position history | Web | Yes | Yes | M7 | Not Started | Pending |  |
| **FR-PAYDATA-05** | | **Period close** (TOR p.16) | | | | | | | |
| FR-PAYDATA-05.1 | MUST | HR closes the period (for example month-end) and locks the data | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-PAYDATA-05.2 | MUST | Reopen the period for corrections with a mandatory reason | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-PAYDATA-05.3 | MUST | Audit-log period open/close | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-PAYDATA-06 | SHOULD | Export period data to Excel for use with the customer's existing payroll system | Web | Yes | Yes | M7 | Not Started | Pending |  |
## FR-RPT

| ID | Pri | Requirement | Platform | Backend | DB | Milestone | Status | Test | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **FR-RPT-01** | | **Attendance reports** (TOR p.16) | | | | | | | |
| FR-RPT-01.1 | MUST | Daily report | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-RPT-01.2 | MUST | Monthly report | Web | Yes | Yes | M7 | Not Started | Pending |  |
| **FR-RPT-02** | | **Leave reports** (TOR p.17) | | | | | | | |
| FR-RPT-02.1 | MUST | Leave report by date range | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-RPT-02.2 | MUST | Per-person remaining leave balance | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-RPT-03 | MUST | OT report by category | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-RPT-04 | MUST | Expiring-documents report | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-RPT-05 | SHOULD | Suspicious-records report (fake GPS, offline, time mismatch) | Web | Yes | Yes | M7 | Not Started | Pending |  |
| **FR-RPT-06** | | **Report tools** (TOR p.17) | | | | | | | |
| FR-RPT-06.1 | MUST | Filter by branch, department, date range | Web | Yes | Yes | M7 | Not Started | Pending |  |
| FR-RPT-06.2 | MUST | Export to Excel | Web | Yes | Yes | M7 | Not Started | Pending |  |

## Non-functional requirements (TOR §4 — provisional IDs, no priority stated)

| ID | Requirement | Milestone | Status | Notes |
|---|---|---|---|---|
| NFR-01 | Single cloud instance, workspace per customer, no on-prem | M7 | Not Started | Deployment target not chosen yet. |
| NFR-02 | Single DB, workspace_id on every table, RLS | M1/M2 | Implemented | FORCE RLS on 36 models; add FKs + remove app-controlled bypass in M2. |
| NFR-03 | No hardcoded business numbers; FRD §15 parameter table | M2 | Not Started | Constants in packages/shared/domain/lao-labor.ts must move to effective-dated params. |
| NFR-04 | Lao + English on every screen; Noto Sans Lao | All | In Progress |  |
| NFR-05 | iOS + Android, offline, low-end phones, slow networks | M5 | In Progress | Expo app; offline queue not built. |
| NFR-06 | HTTPS, PII encryption, RBAC, audit log, fake-GPS detection | M2/M5 | In Progress | National ID plaintext; audit log mutable. |
| NFR-07 | 1,000 concurrent check-ins/workspace; main page ≤ 3 s | M5/M7 | Not Started | Needs load test (k6) in M5. |
| NFR-08 | Daily automatic backup + tested restore | M7 | Not Started |  |
| NFR-09 | OpenAPI documentation for every endpoint | M2 | Not Started |  |
| NFR-10 | Popular, hireable stack with rationale | M1 | Implemented | TypeScript / Fastify / Prisma / Next.js / Expo. |
