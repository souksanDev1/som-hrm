# SOM HRM — ແຜນການ Implement (ເຟສ 1)

ອ້າງອີງ: PRD ລະບົບ HRM ເຟສ 1 + SOM HRM system design 1a (Minimal & Professional)

## ການຕັດສິນໃຈທີ່ຕົກລົງແລ້ວ
- Data model: ໃຊ້ model ຂອງ HRM (ບໍ່ມີ Product/Cart/Order)
- Mobile: Expo + Expo Router + NativeWind, E2E ດ້ວຍ Maestro
- ແບ່ງວຽກເປັນ Milestone; ແຕ່ລະອັນ lint + typecheck + build + unit + E2E ຜ່ານຈິງກ່ອນ commit
- ຕ້ອງເປີດ network ສຳລັບ package install ກ່ອນເລີ່ມ

## ໂຄງສ້າງ Repo (pnpm workspace, repo ດຽວ)
```
HRM/
├─ hrm-api/      Fastify + TS + Prisma + PostgreSQL + Zod + JWT  (routes → services → repositories)
├─ hrm-web/      Next.js (App Router) + TS + Tailwind + TanStack Query + Zustand + RHF + Zod + Playwright
├─ hrm-mobile/   Expo + TS + NativeWind + TanStack Query + RHF + Zod + Maestro
├─ packages/shared/  Zod schemas, types, enums, i18n keys (lo/en), ກົດການລາລາວ
├─ docs/
├─ pnpm-workspace.yaml, package.json, tsconfig.base.json, .github/workflows/ci.yml
```
Frontend ແຍກ features ຕາມ domain: auth, dashboard, employees, org, attendance, scan-import, leave, approvals, onboarding, notifications, settings.
Components: `components/ui` (Button, Input, Badge, Card, Table, Modal…), `components/layout` (Sidebar, Topbar, MobileTabBar), domain components ໃນແຕ່ລະ feature.

## Design tokens (ຈາກ design 1a)
Primary #1F5FD6 · Primary soft #EAF1FD · Ink #101828 · Muted #667085 · Canvas #F7F8FA · Border #E4E7EC
ສະຖານະ: ຕົງເວລາ (ຂຽວ) · ມາຊ້າ (ສົ້ມ) · ຂາດ (ແດງ) · ມີ Dark mode
Font: IBM Plex Sans + Noto Sans Lao · ມຸມໂຄ້ງ 8/12/16 px · Material Symbols Outlined · ຕົວເລກ tabular

## Data model (Prisma) — ທຸກຕາຕະລາງມີ workspace_id + PostgreSQL RLS
Workspace, Subscription/SeatCredit, User, Role, Permission, RolePermission, UserRole, AuditLog,
Branch (lat/lng/geofenceRadius), Department, Position, Employee, EmployeeDocument, EmergencyContact,
EmploymentHistory, Shift, WorkSchedule (6 ມື້/ອາທິດ), Holiday, AttendanceRecord, AttendanceCorrection,
ScanImport, ScanImportRow, DeviceBinding, LeaveType, LeavePolicy, LeaveBalance, LeaveRequest, LeaveApproval,
ApprovalDelegation, OvertimeRecord, OnboardingTemplate/Task, Offboarding (+ leaveBalanceAtExit, otBalanceAtExit),
Notification, PushToken

## ສະເພາະລາວ
- ປະເພດລາຕາມກົດໝາຍແຮງງານ (ເລກ 43/ສພຊ, 2013) — seed ເປັນຄ່າເລີ່ມຕົ້ນ, HR ປັບໄດ້:
  - ລາພັກປະຈຳປີ 15 ມື້ (18 ມື້ ວຽກອັນຕະລາຍ), ຫຼັງເຮັດວຽກຄົບ 1 ປີ
  - ລາປ່ວຍ 30 ມື້/ປີ ຕ້ອງມີໃບແພດ (ລາຍວັນ/ລາຍຊົ່ວໂມງ ຕ້ອງເຮັດວຽກ > 90 ມື້)
  - ລາເກີດລູກ 105 ມື້ (ຫຼັງເກີດຢ່າງໜ້ອຍ 42 ມື້), ລູກແຝດ 120 ມື້
  - ລາກິດທຸລະ/ແຕ່ງງານ/ເສຍຊີວິດ 3 ມື້
  - ວັນພັກລັດຖະການ: 1/1, 8/3 (ຍິງ), 14–16/4, 1/5, 2/12
- ເຮັດວຽກ 6 ມື້/ອາທິດ, ສູງສຸດ 8 ຊມ/ມື້ 48 ຊມ/ອາທິດ; OT ສູງສຸດ 3 ຊມ/ມື້, 45 ຊມ/ເດືອນ
- ເລກປະກັນສັງຄົມ, ເລກສຳມະໂນຄົວ (ເຂົ້າລະຫັດ)
- ແຮງງານຕ່າງປະເທດ: Work permit / Visa / Passport + ວັນໝົດອາຍຸ, ແຈ້ງເຕືອນ 90/60/30 ມື້ກ່ອນໝົດ

## ຄົນໜ້າງານ
- ບໍ່ມີອີເມວ: login ດ້ວຍ ລະຫັດພະນັກງານ/ເບີໂທ + PIN; HR reset PIN ໄດ້
- ບໍ່ມີສະມາດໂຟນ: ໃຊ້ເຄື່ອງສະແກນ (import), Kiosk mode ໃນແທັບເລັດສາຂາ, HR ຍື່ນລາແທນ
- ເນັດຫຼຸດ: ເກັບ check-in ໃນເຄື່ອງ (offline queue + timestamp ຈາກ device + server) ແລ້ວ sync ພາຍຫຼັງ
- GPS ປອມ: ກວດ mock location (Android), accuracy, ຄວາມໄວເດີນທາງບໍ່ສົມເຫດຜົນ, device binding, selfie; ໝາຍ "ສົງໄສ" ໃຫ້ HR ກວດ
- ຫົວໜ້າລາພັກ: ApprovalDelegation (ກຳນົດຜູ້ອະນຸມັດແທນ + ຊ່ວງວັນ), escalate ຂຶ້ນຂັ້ນຖັດໄປອັດຕະໂນມັດ
- ເກັບ OT ແລະ ວັນລາເຫຼືອຕອນລາອອກ ໄວ້ສຳລັບໂມດູນເງິນເດືອນ

## ໜ້າຈໍ
Mobile: Login(+PIN), ໜ້າແລກ, ເຊັກອິນ/ເອົາ, ຍື່ນລາ, ອະນຸມັດ, ຂໍ້ມູນສ່ວນຕົວ, ຜັງອົງກອນ, ແຈ້ງເຕືອນ, ຂໍແກ້ເວລາ,
ສະຖານະບັນຫາ (ຢູ່ນອກເຂດ, ບໍ່ມີເນັດ, GPS ປິດ, sync ລໍຖ້າ)
Web: Login, Dashboard, ລາຍຊື່ພະນັກງານ, ປະຫວັດພະນັກງານ, ລາຍງານລົງເວລາ, ນຳເຂົ້າໄຟລ໌ສະແກນ, ຕັ້ງຄ່າການລາ,
Onboarding/Offboarding, ຜັງອົງກອນ, ແຈ້ງເຕືອນ, ຄຳຂໍແກ້ເວລາ, ຕັ້ງຄ່າ Workspace/ສິດ, ໜ້າ error/empty
ທຸກໜ້າ Responsive; ພາສາລາວ/ອັງກິດ

## Milestones
- M1: Monorepo + shared + Prisma schema + RLS + Auth (email/ລະຫັດ+PIN, JWT refresh) + RBAC + Audit log + Employees + Org chart
- M2: Attendance (app + offline + anti-fake-GPS + selfie) + Shift/6 ມື້ + ຄຳນວນມາຊ້າ/ກັບກ່ອນ/ຂາດ + OT + Scan import (ZKTeco/HIP/CSV) + ຄຳຂໍແກ້ເວລາ
- M3: Leave (ກົດລາວ, ເຕັມ/ເຄິ່ງມື້, ແນບເອກະສານ) + ອະນຸມັດ 1–2 ຂັ້ນ + ຜູ້ອະນຸມັດແທນ + Push/ແຈ້ງເຕືອນ + ປະຕິທິນ
- M4: Onboarding/Offboarding (ປິດສິດອັດຕະໂນມັດ, ເກັບ OT/ວັນລາຕອນອອກ) + ແຈ້ງເຕືອນເອກະສານຕ່າງປະເທດ + ລາຍງານ Excel + Dashboard

## Definition of Done (ແຕ່ລະ Milestone)
pnpm lint · pnpm typecheck · pnpm build · pnpm test (Vitest, API ໃຊ້ Postgres ຈິງ) · pnpm e2e (Playwright web; Maestro mobile)
ທັງໝົດຜ່ານຈິງ → ກວດ diff → commit
