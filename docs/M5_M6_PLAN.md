# SOM HRM — ແຜນ Implement M5 (Attendance + OT) ແລະ M6 (Leave)

> ຂຽນ 2026-11-17 ຈາກ `main` @ 3df9c96 (M2–M4 ສຳເລັດ). ໃຊ້ເປັນເອກະສານສົ່ງຕໍ່ໃຫ້ chat ໃໝ່.
> ອ້າງອີງ: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) · [REQUIREMENT_TRACKING.md](REQUIREMENT_TRACKING.md) (ID ທຸກຂໍ້) ·
> [TECHNICAL_ANALYSIS.md](TECHNICAL_ANALYSIS.md) §5 (A13 attendance model, A14 leave ledger) ແລະ §7 (ຄຳຖາມ).

---

## 0. ວິທີເລີ່ມໃນ chat ໃໝ່

Paste ຂໍ້ຄວາມນີ້ເປັນຂໍ້ຄວາມທຳອິດ:

```
ອ່ານ docs/M5_M6_PLAN.md ໃຫ້ຄົບກ່ອນ ແລ້ວເຮັດ M5 ຕາມແຜນ (ຂໍ້ 3 ກ່ອນ: ຖາມຄຳຖາມທີ່ຍັງບໍ່ມີຄຳຕອບ).
ປະຕິບັດຕາມ "ເງື່ອນໄຂບັງຄັບ" ຂໍ້ 2 ທຸກຂໍ້. ຕອບເປັນພາສາລາວ.
```

ເມື່ອ M5 commit ແລ້ວ ຈຶ່ງເລີ່ມ M6 (M6 ໃຊ້ attendance/schedule ຂອງ M5).

---

## 1. ສະພາບປັດຈຸບັນ — ສິ່ງທີ່ມີແລ້ວ ໃຫ້ໃຊ້ຄືນ (ຢ່າຂຽນຊ້ຳ)

| ສິ່ງທີ່ມີ | ຢູ່ໃສ | ໃຊ້ໃນ |
|---|---|---|
| Tenancy `db.tenant(ws, fn)` / `db.system(fn)` + FORCE RLS | `hrm-api/src/db/client.ts` | ທຸກຕາຕະລາງໃໝ່ຕ້ອງມີ `workspaceId` + policy RLS (ເບິ່ງ migration M3/M4) |
| Parameter registry effective-dated | `packages/shared/src/domain/parameters.ts`, `parameterReader.workspace(tx, ws, key)` | ທຸກຕົວເລກທຸລະກິດ (grace, OT cap, 5 ນາທີ, 72 ຊມ, ໃບແພດ…) — **ຫ້າມ hardcode** (FR-WS-08.1) |
| ກຳນົດມື້ເຮັດວຽກ: `resolveEmployeeWorkPatterns(tx, ws, ids, date)` | `hrm-api/src/modules/schedules/schedules.service.ts` | ຄິດ late/absent (M5), ນັບວັນລາ (M6) |
| ວັນພັກ: `holidaysFor(employee, holidays, range)`, `holidayAppliesTo` (8 ມີນາ ຍິງ, ສັນຊາດ) | `packages/shared/src/domain/holidays.ts` | OT ວັນພັກ (M5), ນັບວັນລາ/ປະຕິທິນ (M6) |
| Geofence: `haversineMetres`, `isWithinGeofence`, `hasGeofence` | `packages/shared/src/domain/geo.ts` | check-in (FR-ATT-15) |
| Approval engine: `submitApproval(tx, registry, input)`, handler `{summarize,onApproved,onRejected,link}`, delegation, escalation, `approval.levels` | `hrm-api/src/modules/approvals/*` | OT, correction, off-site, device change, leave, leave cancel |
| LEAVE handler (ແບບໜ້ອຍສຸດ) | `hrm-api/src/modules/leave/leave.approval.ts` | M6 ຂະຫຍາຍ |
| `ensureDelegationForAbsence` + `POST /approvals/delegations/absence` | `approvals/delegations.service.ts` | M6: ຖາມຜູ້ແທນເມື່ອຫົວໜ້າຍື່ນລາ (FR-ORG-03.2) |
| `approvals.repository.onLeave(...)` (route ໄປຂັ້ນເທິງເມື່ອຫົວໜ້າລາ) | `approvals/approvals.repository.ts` | M6 ຕ້ອງໃຫ້ອ່ານ leave ທີ່ອະນຸມັດແລ້ວຖືກຕ້ອງ |
| Notification: `notify()` + outbox + push/SMS; type `MISSING_PUNCH`, `SUSPICIOUS_ATTENDANCE`, `OFFLINE_UNSYNCED` ພ້ອມ template lo/en ແລ້ວ | `hrm-api/src/modules/notifications`, `shared/i18n/areas/notifications.ts` | M5 ພຽງແຕ່ເອີ້ນ |
| Deep link ຮ່ວມ: `resolveNotificationLink(link, 'web'|'mobile')`, `MOBILE_LINK_ROUTES` | `shared/src/domain/notifications.ts` | ເພີ່ມ route ໃໝ່ (attendance, leave) |
| Job runner pg-boss (cron + idempotency) | `hrm-api/src/jobs` | ຄິດໄລ່ປະຈຳວັນ, missing punch, accrual, carry-over |
| File storage (magic bytes, ຂະໜາດ) | `hrm-api/src/modules/files` | selfie, ໄຟລ໌ແນບແກ້ເວລາ, ໃບແພດ |
| Import pattern (preview rolled-back → HMAC token ຜູກ sha256 → confirm all-or-nothing, savepoint ຕໍ່ແຖວ, exceljs) | `employees/employee-import.*` | scanner import FR-ATT-02 |
| Prisma models (schema-only, ຍັງບໍ່ໃຊ້): `Shift`, `AttendanceRecord`, `AttendanceCorrection`, `OvertimeRecord`, `ScanImport(Row)`, `DeviceBinding`, `LeaveType`, `LeavePolicy`, `LeaveBalance`, `LeaveRequest` | `schema.prisma` | ປັບຕາມ A13/A14 (ຂໍ້ 4.1, 5.1) |
| Seed: owner/HR, manager@som.la / Manager1234 (E002, PIN 731594), leave types ລາວ, 7 pending leave | `prisma/seed.ts` | E2E/Maestro |

**ໜີ້ທີ່ຕ້ອງແກ້ໃນ M5/M6** (TECHNICAL_ANALYSIS §4.2):
- `AttendanceRecord @@unique([employeeId, workDate])` ຂັດກັບກະຂ້າມມື້ → ປ່ຽນເປັນ Punch + Day (A13).
- `LeaveBalance` ເປັນ counter → ledger (A14), balance = ຜົນລວມ ledger.
- ທຸກ request ເປີດ 2 transaction (`plugins/auth.ts`) → ແກ້ກ່ອນ load test 1,000 check-in.
- `lao-labor.ts` ຍັງມີຄ່າກົດໝາຍ hardcode → ຍ້າຍໄປ parameter (ເຫຼືອເປັນ default ຂອງ seed ເທົ່ານັ້ນ).
- ຄ້າງຈາກ M4 ສຳລັບ M6: ຖາມຜູ້ແທນໃນຟອມລາ, ເອີ້ນ absence hook, LEAVE handler ຕັດ balance, API ຍົກເລີກ approval.

---

## 2. ເງື່ອນໄຂບັງຄັບ (ຈາກຜູ້ໃຊ້ — ຕ້ອງເຮັດທຸກຂໍ້)

**ວິທີເຮັດວຽກ**
- ຕອບເປັນ **ພາສາລາວ** ສະເໝີ.
- Clean code, reusable components, standard props; ຕໍ່ຍອດ code ເດີມ **ບໍ່ restructure ໂດຍບໍ່ຈຳເປັນ**; ບໍ່ມີ logic ທຸລະກິດຊ້ຳ — ຄິດໄລ່ຢູ່ backend/shared ຈຸດດຽວ, web/mobile ສະແດງຜົນ.
- Multi-tenant ຕັ້ງແຕ່ຕົ້ນ (workspaceId + RLS ທຸກຕາຕະລາງ). **MUST ກ່ອນ SHOULD**. Attendance ສຳຄັນສູງສຸດ.
- ຂະບວນການ: **review → implement → test → verify → commit**. ບໍ່ຊັດເຈນ → **ຖາມ** (ຢ່າສ້າງກົດເອງ; ຄ່າທີ່ບໍ່ຮູ້ ໃຫ້ເປັນ parameter + default ທີ່ມີແຫຼ່ງອ້າງອີງ).
- ແບ່ງວຽກໃຫ້ **ຫຼາຍ subagent** ເຮັດຂະໜານ (ເບິ່ງ "ລຳດັບ/ການແບ່ງ agent" ໃນແຕ່ລະ M).
- ທົດສອບ **Web + Android ກ່ອນ, iOS ພາຍຫຼັງ**. Android ໃຊ້ **debug build** ກໍ່ພໍ (ບໍ່ຕ້ອງ release APK).

**Definition of Done ກ່ອນທຸກ commit** (ຕ້ອງ run ແທ້ ແລະ ຜ່ານແທ້ — ຫ້າມອ້າງວ່າຜ່ານຖ້າບໍ່ໄດ້ run):
```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm e2e
```
+ `pnpm --filter hrm-mobile test` (Jest) + Maestro ຖ້າແຕະ mobile → ກວດ diff (review) → commit.
- Commit ເຂົ້າ `main` (ຜ່ານ integration branch ເຊັ່ນ `m5`) ເມື່ອທຸກຢ່າງຜ່ານ. **ຫ້າມ push** ຖ້າບໍ່ໄດ້ສັ່ງ.
- ທ້າຍ commit message: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- ອັບເດດ `docs/REQUIREMENT_TRACKING.md` (Status/Test ຂອງ ID ທີ່ເຮັດ) ໃນ commit ດຽວກັນ; ສະຫຼຸບທ້າຍ M ອັບເດດ IMPLEMENTATION_PLAN.

**ຄວາມປອດໄພ/ສະພາບແວດລ້ອມ**
- Postgres: `pnpm db:start` (embedded, ບໍ່ມີ brew/Docker). **ຫ້າມ `prisma migrate reset`** ເດັດຂາດ.
- Test setup drop schema ໄດ້ສະເພາະ DB ຊື່ລົງທ້າຍ `_test` / `_e2e`. ແຕ່ລະ agent ໃຊ້ `TEST_DATABASE_URL` ຂອງຕົນ (ເຊັ່ນ `hrm_m5a_test`); ສ້າງ DB ດ້ວຍ script ຊົ່ວຄາວ (connect superuser postgres/postgres) ແລ້ວລຶບ script.
- Migration: ສ້າງດ້ວຍ `prisma migrate diff --from-schema-datamodel <old> --to-schema-datamodel prisma/schema.prisma --script` ແລ້ວແກ້ດ້ວຍມື; ຖ້າ UPDATE/INSERT ຂໍ້ມູນເກົ່າ ຕ້ອງມີ `SELECT set_config('app.bypass_rls','on',true);` ກ່ອນ; ເພີ່ມ RLS policy ຕາຕະລາງໃໝ່; ຂຽນ migration test (ແບບ `test/migration-m4.test.ts`).
- ຫຼັງ merge ທີ່ປ່ຽນ schema: `prisma generate` (ບໍ່ດັ່ງນັ້ນ 500 ເພາະ client ເກົ່າ); apply migration ໃສ່ `hrm` ແລະ `hrm_mobile_m4` ດ້ວຍ `prisma migrate deploy`.

**Subagent (worktree)**
- `isolation: "worktree"` ເລີ່ມຈາກ M1 → brief ຕ້ອງສັ່ງ `git reset --hard <base commit>` ກ່ອນ.
- Agent ບໍ່ run Playwright/Maestro — lead ເປັນຄົນ run. Lead merge ເຂົ້າ integration branch, ແກ້ test ທີ່ແຕກຂ້າມ branch, run ຄົບ, ແລ້ວ fast-forward `main`.
- **Schema/migration ໃຫ້ lead (ຫຼື agent ດຽວ) ເຮັດກ່ອນ** ແລ້ວ agent ອື່ນ reset ໄປ commit ນັ້ນ — ຫຼີກ conflict ໃນ `schema.prisma`.
- ແຕ່ລະ agent ມີ file ownership ຊັດເຈນ; ຈຸດຮ່ວມ (nav.ts, i18n index, shared index, bootstrap.ts, jobs index, registry.ts) ໃຫ້ "ເພີ່ມທ້າຍ" ເພື່ອ merge ງ່າຍ.

**Android / Maestro**
- ໂທລະສັບ Huawei YAL_L21, serial `SDEDU19904020073`.
- `adb reverse tcp:4000 tcp:4000` ແລະ `adb reverse tcp:8081 tcp:8081`.
- Build: `EXPO_PUBLIC_API_URL=http://localhost:4000/api/v1 npx expo run:android --device YAL_L21` (ໃຊ້ **ຊື່** ບໍ່ແມ່ນ serial; run background ເພາະ Metro ຄ້າງຢູ່). ເພີ່ມ native module (location/camera/sqlite) → ຕ້ອງ rebuild.
- API ສຳລັບມືຖື: preview `hrm-api-mobile` (`.claude/launch.json`) ໃຊ້ DB `hrm_mobile_m4`; web preview `hrm-web` port 3000.
- Maestro: `export JAVA_HOME=/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home PATH=$HOME/.maestro/bin:$PATH; maestro --device SDEDU19904020073 test -e API_URL=http://localhost:4000 .maestro`
- Dev build: `console.warn` ທຸກອັນ ເຮັດໃຫ້ LogBox toast ບັງ tab bar → Maestro ກົດບໍ່ໄດ້. ຫຼີກ warn ທີ່ຄາດໄວ້ ຫຼື `LogBox.ignoreLogs`. ຕັ້ງຊື່ flow ໃໝ່ຕໍ່ຈາກ `08`.

**E2E (Playwright) conventions**
- 3 project: desktop/tablet/mobile (port 3100/4100, DB `hrm_e2e`) → ຂໍ້ມູນ unique ຕໍ່ project (ເຊັ່ນ ປີ/ລະຫັດ ຕາມ `info.project.name`).
- Element ທີ່ຊ້ຳໃນ layout responsive → `:visible` / `filter({ visible: true })`. ໜ້າພະນັກງານ: `toHaveURL(/\/employees\/(?!new$)[^/]+$/)`.
- ໃຊ້ `data-testid` ແທນ `getByRole('status')` (spinner ກໍ່ເປັນ status).

---

## 3. ຄຳຖາມທີ່ຕ້ອງໄດ້ຄຳຕອບກ່ອນ/ລະຫວ່າງ (ຖາມຜູ້ໃຊ້ໃນ chat ໃໝ່)

ທຸກຂໍ້ຈະເປັນ **parameter** ຢູ່ແລ້ວ — ຄຳຕອບແມ່ນ "ຄ່າ default" ແລະ ກົດ. ຂໍ້ທີ່ມີ ★ ກະທົບ data model → ຖາມກ່ອນເລີ່ມ.

| # | ຄຳຖາມ | ຂໍ້ສະເໜີ (default) |
|---|---|---|
| ★Q1 | Attendance mode ຕໍ່ **branch** (TOR) ຫຼື ຕໍ່ workspace? | ຕໍ່ branch, ເປີດຫຼາຍ mode ພ້ອມກັນໄດ້ (FR-WS-06.4) |
| ★Q2 | Kiosk ຂັດກັບ device binding 1:1 — kiosk ເປັນ "ອຸປະກອນຂອງ branch" ທີ່ HR enrol ແຍກ, ບໍ່ນັບເປັນ device ຂອງພະນັກງານ? | ແມ່ນ: kiosk device token ແຍກ, ບໍ່ binding |
| Q3 | ເສັ້ນແບ່ງ OT **ກາງເວັນ/ກາງຄືນ** (ເວລາ)? | parameter `ot.nightStart`/`ot.nightEnd` — **ຕ້ອງຢືນຢັນຄ່າ** (ກວດກົດໝາຍແຮງງານ) |
| Q4 | OT cap ລາຍວັນ/ເດືອນ (TOR ບໍ່ໃຫ້ຕົວເລກ) | 3 ຊມ/ມື້, 45 ຊມ/ເດືອນ (ແຜນເກົ່າ) — ເຕືອນເມື່ອຮອດ 80% |
| Q5 | Grace ມາຊ້າ/ກັບກ່ອນ default | ມາຊ້າ 5 ນາທີ, ກັບກ່ອນ 0 (ຄືກັບ `Shift` ປັດຈຸບັນ) |
| Q6 | ເຮັດວຽກວັນ 8 ມີນາ (ຍິງ) / ວັນຊາດຕ່າງປະເທດ — OT ນັບເປັນ "ວັນພັກ" ສະເພາະຄົນທີ່ວັນນັ້ນເປັນວັນພັກຂອງຕົນ? | ແມ່ນ (ໃຊ້ `holidayAppliesTo`) |
| Q7 | ລືມກົດ check-out: ສະຖານະ "ລືມກົດ" + ແຈ້ງເຕືອນ ເວລາໃດ? | ຫຼັງໝົດກະ + 2 ຊມ (parameter) |
| Q8 | Selfie: ເປີດ/ປິດຕໍ່ workspace ເທົ່ານັ້ນ ຫຼື ຕໍ່ branch? Liveness (SHOULD) ເຮັດໃນເຟສ 1? | ຕໍ່ workspace; liveness ເລື່ອນ (SHOULD) |
| Q9 | Load test 1,000 check-in: ພາຍໃນຈັກວິນາທີ / p95 latency ເທົ່າໃດ? | 1,000 ພາຍໃນ 60 ວິ, p95 < 500 ms (local) |
| ★Q10 | ປີລາພັກ: ປີປະຕິທິນ ຫຼື ວັນຄົບຮອບເຂົ້າວຽກ? pro-rata ປີທຳອິດ? | ປີປະຕິທິນ; ສິດເກີດຫຼັງຄົບ 1 ປີ; ບໍ່ pro-rata (ຖາມ) |
| Q11 | ລາກິດທຸລະ/ແຕ່ງງານ/ເສຍຊີວິດ 3 ມື້ — ຕໍ່ປີ ຫຼື ຕໍ່ຄັ້ງ? | ຕໍ່ຄັ້ງ (ຖາມ) |
| Q12 | ໃບແພດ: ເກນ "> 1 ມື້" HR ຕັ້ງໄດ້; ແນບພາຍຫຼັງ "3 ມື້" = ວັນເຮັດວຽກ ຫຼື ປະຕິທິນ? | parameter ເກນ = 1; 3 ວັນເຮັດວຽກ |
| Q13 | Carry-over (SHOULD): ສູງສຸດຈັກມື້, ໝົດອາຍຸເມື່ອໃດ? | ປິດ (0) ເປັນ default; ໝົດອາຍຸ 31/03 ປີຖັດໄປ |
| Q14 | ລາເຄິ່ງມື້ ກັບ ຄົນທີ່ schedule ວັນນັ້ນບໍ່ເຖິງ 8 ຊມ — ນັບ 0.5 ມື້ສະເໝີ? | ແມ່ນ |
| Q15 | ລາປ່ວຍ: ຕ້ອງເຮັດວຽກ > 90 ມື້ ສະເພາະ pay type DAILY/HOURLY (ຕາມ lao-labor.ts)? | ແມ່ນ |

### 3.1 ຄຳຕອບຂອງຜູ້ໃຊ້ (2026-11-17)

| # | ຄຳຕອບ |
|---|---|
| Q1 | ຕໍ່ **branch**, ເປີດຫຼາຍ mode ພ້ອມກັນໄດ້ |
| Q2 | Kiosk = device token ຂອງ branch (HR enrol), **ບໍ່ນັບເປັນ device binding**; Kiosk **ຢູ່ໃນ scope M5** (Agent G ຫຼັງ MUST ຜ່ານ) |
| Q3 | ກາງຄືນ **22:00–05:00** (`ot.nightStart`/`ot.nightEnd`, HR ປ່ຽນໄດ້) |
| Q4 | **3 ຊມ/ມື້, 45 ຊມ/ເດືອນ**, ເຕືອນ 80%; ເກີນ cap → **ບລັອກການຍື່ນ** |
| Q5 | ມາຊ້າ 5 ນາທີ, ກັບກ່ອນ 0 ນາທີ |
| Q6 | ແມ່ນ — OT ວັນພັກ ສະເພາະຄົນທີ່ວັນນັ້ນເປັນວັນພັກຂອງຕົນ (`holidayAppliesTo`) |
| Q7 | ຫຼັງໝົດກະ **2 ຊມ** (`attendance.missingPunchAfterMinutes` = 120) |
| Q8 | Selfie ເປີດ/ປິດ **ຕໍ່ workspace**; liveness (FR-ATT-13) **ເລື່ອນ** (Deferred) |
| Q9 | 1,000 check-in ພາຍໃນ **60 ວິ, p95 < 500 ms** (local) |
| Q10 | (2026-11-18) **ປີປະຕິທິນ**; ສິດລາພັກເກີດຫຼັງຄົບ 1 ປີ; **ບໍ່ pro-rata** |
| Q11 | ລາກິດທຸລະ/ແຕ່ງງານ/ເສຍຊີວິດ 3 ມື້ **ຕໍ່ຄັ້ງ** (ບໍ່ມີ balance ປະຈຳປີ; ledger ບັນທຶກ USAGE ເພື່ອ audit) |
| Q12 | ໃບແພດ ເກນ > 1 ມື້ (`leave.certificateThresholdDays` = 1); ແນບພາຍຫຼັງພາຍໃນ **3 ວັນເຮັດວຽກ** |
| Q13 | Carry-over **ປິດ (0)** ເປັນ default; ໝົດອາຍຸ **31/03** ປີຖັດໄປ |
| Q14 | ເຄິ່ງມື້ = **0.5 ມື້ສະເໝີ** |
| Q15 | ລາປ່ວຍຕ້ອງເຮັດວຽກ > 90 ມື້ **ສະເພາະ pay type DAILY/HOURLY** |

---

## 4. M5 — Attendance + Shift + OT + Scanner + Kiosk

ຂອບເຂດ ID: FR-WS-06, FR-ATT-01..23, FR-NOTI-03.3/03.6/03.7 (trigger), NFR-05/06 (offline, fake GPS), load test.

### 4.1 Data model (ເຮັດກ່ອນ — agent/lead ດຽວ, commit ເປັນ base)

ອີງ A13 — **ຢ່າໃຊ້ unique ຕໍ່ ຄົນ/ມື້**:
- `AttendancePunch` — ທຸກການກົດ (raw): employeeId, branchId, kind IN/OUT, `capturedAt` (device), `receivedAt` (server), lat/lng/accuracy, distanceMetres, source (MOBILE / KIOSK / SCANNER / HR_ON_BEHALF / CORRECTION), `clientRef` (idempotency, unique ຕໍ່ workspace), deviceId, selfieFileId, offline bool, `suspicious` + `suspiciousReasons[]` (DEVICE_TIME_SKEW, ROOTED, OUTSIDE_ZONE_OFFSITE, …), reviewStatus (NONE/PENDING/APPROVED/REJECTED), reviewer, createdById + reason (HR on behalf), `supersededById` (ການແກ້ ເກັບຕົ້ນສະບັບ — FR-ATT-19.3).
- `AttendanceDay` — ຜົນຄິດໄລ່ຕໍ່ ຄົນ / workDate / ກະ: scheduled start/end (ຈາກ shift, ຂ້າມທ່ຽງຄືນໄດ້), firstIn/lastOut punch, lateMinutes, earlyLeaveMinutes, workedMinutes, status (PRESENT/LATE/EARLY/ABSENT/MISSING_IN/MISSING_OUT/HOLIDAY/REST/LEAVE), computedAt. Unique (employeeId, workDate, shiftId?).
- `Shift` ເພີ່ມ: `crossesMidnight` (ຄິດຈາກ start>end), ສີ/ລະຫັດ; `ShiftRoster` (employeeId, date, shiftId) ສຳລັບກະໝູນວຽນ (FR-ATT-17.3); ຄວາມສຳພັນກັບ `WorkSchedule.shiftId` ທີ່ມີຢູ່.
- `Branch` ເພີ່ມ `attendanceModes` (MOBILE/SCANNER/KIOSK[]) — FR-WS-06.
- `DeviceBinding` ປັບ: active 1 ເຄື່ອງ/ຄົນ + `DeviceChangeRequest`.
- `OffsitePermission` (employeeId, from/to, ໝາຍເຫດ) — FR-ATT-16.1.
- `AttendanceCorrection` ປັບໃຫ້ຊີ້ punch/day + attachmentFileId; `OvertimeRecord` → `OvertimeRequest` (kind PRE/POST, plannedStart/End, actual minutes, ແຍກ 4 category minutes: WORKDAY_DAY / WORKDAY_NIGHT / HOLIDAY_DAY / HOLIDAY_NIGHT).
- `ScanImport`/`ScanImportRow` ປັບ (format ZKTECO/HIP/GENERIC, matchedEmployeeId, duplicateOf, sha256).
- `KioskDevice` (branchId, tokenHash, name, enrolledBy, revokedAt).
- `ApprovalSubjectType` ເພີ່ມ `OFFSITE_CHECKIN`, `DEVICE_CHANGE` (OVERTIME, ATTENDANCE_CORRECTION ມີແລ້ວ).
- Migration: ຍ້າຍ/ລຶບ `AttendanceRecord` (ບໍ່ມີຂໍ້ມູນຈິງ — ກວດກ່ອນ), RLS ທຸກຕາຕະລາງ, permission ໃໝ່ grant ໃຫ້ OWNER/HR_ADMIN (pattern M3/M4).
- **Parameters ໃໝ່** (registry, ມີ min/max): `attendance.lateGraceMinutes`, `attendance.earlyGraceMinutes`, `attendance.deviceTimeToleranceMinutes` (=5, FR-ATT-07.2), `attendance.offlineAlertHours` (=72, FR-ATT-08), `attendance.selfieRequired`, `attendance.missingPunchAfterMinutes`, `attendance.maxAccuracyMetres`, `ot.maxMinutesPerDay`, `ot.maxMinutesPerMonth`, `ot.warnPercent`, `ot.nightStart`, `ot.nightEnd`.
- **Permissions ໃໝ່**: `attendance.review` (suspicious queue), `attendance.punch_on_behalf`, `attendance.device.manage`, `attendance.offsite.manage`, `scan.import`, `kiosk.manage`, `shift.manage` (ໃຊ້ `attendance.read_all` / `attendance.manage` ທີ່ມີແລ້ວ ບ່ອນທີ່ເໝາະ).

### 4.2 Shared (pure functions + schemas, ມີ unit test ຄົບ)
- `domain/attendance.ts`: `workDateOf(instant, tz, shift)` (ກະກາງຄືນ → workDate ຂອງມື້ເລີ່ມ), `computeAttendanceDay(schedule, shift, holidays, punches, grace, leave?)` → late/early/absent/missing/worked, `deviceTimeSkew`, `suspicionReasons(...)`.
- `domain/overtime.ts`: `splitOvertime(start, end, nightWindow, isHolidayFor)` → 4 category; `capStatus(used, cap, warnPercent)`.
- `domain/scan-formats.ts`: parser ZKTeco / HIP / generic → `{employeeCode, timestamp}`.
- Zod schemas + i18n lo/en (`areas/attendance.ts`, `areas/overtime.ts`), `MOBILE_LINK_ROUTES` + web link rules ສຳລັບ attendance/OT/correction.

### 4.3 ລາຍການວຽກ (MUST ກ່ອນ) — ແຍກເປັນ agent

| Agent | ວຽກ | ID |
|---|---|---|
| **A — Base** (lead, ເຮັດກ່ອນ) | 4.1 schema + migration + migration test, parameters, permissions, shared calc functions 4.2 + unit test, Branch attendance mode (API + web settings) | FR-WS-06.1–06.4, FR-ATT-18 (engine) |
| **B — Shifts & ຄິດໄລ່** | Shift CRUD (ກະກາງຄືນ), roster ໝູນວຽນ (web), job ຄິດໄລ່ `AttendanceDay` ປະຈຳວັນ + recompute ເມື່ອມີ punch/correction, job missing punch → `notify(MISSING_PUNCH)`, ໜ້າ web ລາຍວັນ/ລາຍຄົນ (HR + manager ຕາມ data scope) | FR-ATT-17.1–17.3, 18.1–18.5, FR-NOTI-03.3 |
| **C — Mobile check-in** | `expo-location` (mocked flag → block), `expo-camera` selfie, `expo-sqlite` offline queue (+ clientRef, capturedAt), sync ອັດຕະໂນມັດ, ປ້າຍ "offline" + ເວລາສົ່ງຈິງ, ໄລຍະຫ່າງຈາກ branch + block ນອກເຂດ, device binding ທີ່ login, ໜ້າສະຖານະ (ນອກເຂດ/ບໍ່ມີເນັດ/GPS ປິດ/ລໍ sync), ເຕືອນ > 72 ຊມ; API `POST /attendance/punches` (batch, idempotent, ກວດເວລາເຄື່ອງ ≥ 5 ນາທີ → suspicious + `notify(SUSPICIOUS_ATTENDANCE)`) | FR-ATT-01, 05, 06, 07, 08, 09, 11.1, 15, FR-NOTI-03.6/03.7 |
| **D — HR & ຄຳຂໍ** | Suspicious queue (web: approve/reject), HR ບັນທຶກແທນ (reason ບັງຄັບ + audit), off-site permission + check-in ນອກເຂດພ້ອມເຫດຜົນ → approval `OFFSITE_CHECKIN`, device change request (mobile) → approval/HR `DEVICE_CHANGE`, time-correction (web+mobile, ໄຟລ໌ແນບ) → `ATTENDANCE_CORRECTION` handler ເກັບຕົ້ນສະບັບ + recompute | FR-ATT-04, 11.2–11.3, 14, 16, 19 |
| **E — OT** | OT ກ່ອນ/ຫຼັງ (web+mobile) → `OVERTIME` handler, ແຍກ 4 category ຈາກເວລາຈິງ, cap ຕໍ່ມື້/ເດືອນ + ເຕືອນ, ຊົ່ວໂມງ OT ອະນຸມັດແລ້ວໃນແອັບ | FR-ATT-20, 21, 22 (SHOULD), 23 (SHOULD) |
| **F — Scanner import** | Upload ZKTeco/HIP/CSV/Excel → preview (match ລະຫັດ, ແຖວບໍ່ match/ຊ້ຳ) → HR confirm (ໃຊ້ pattern token+sha256 ຂອງ employee import) → punches source SCANNER → recompute | FR-ATT-02.1–02.6 |
| **G — Kiosk** (SHOULD, ຫຼັງ MUST ຜ່ານ) | `APP_VARIANT=kiosk` (bundle id ແຍກ, route group `(kiosk)`), HR enrol device token, ລະຫັດພະນັກງານ + PIN, ຖ່າຍຮູບ, offline queue ດຽວກັບ C | FR-ATT-03.1–03.3 |
| **H — Hardening** (lead, ທ້າຍ) | ແກ້ 2-transaction ຕໍ່ request, load test 1,000 check-in (autocannon/k6 script ໃນ `hrm-api/scripts`), root/jailbreak flag (SHOULD), Wi-Fi check (SHOULD) | NFR, FR-ATT-10, 12 |

ລຳດັບ: **A** → (B, C, D, E, F ຂະໜານ) → merge `m5` → G → H → ກວດຄົບ → commit.
SHOULD ທີ່ເລື່ອນໄດ້ຖ້າເວລາບໍ່ພໍ: FR-ATT-10, 12, 13 (liveness), 22, 23, Kiosk (ຖາມຜູ້ໃຊ້ກ່ອນເລື່ອນ).

### 4.4 Test ທີ່ຕ້ອງມີ
- Shared: ກະຂ້າມທ່ຽງຄືນ, grace ຂອບເຂດ (=, +1 ນາທີ), ວັນພັກສະເພາະຍິງ/ຕ່າງປະເທດ, OT ຂ້າມ 22:00 ແລະ ຂ້າມວັນພັກ, cap.
- API (Postgres ຈິງ): idempotent replay offline (clientRef ຊ້ຳ = ບໍ່ສ້າງຊ້ຳ), skew > 5 ນາທີ → suspicious, ນອກເຂດ → 4xx ພ້ອມໄລຍະຫ່າງ, off-site ຕ້ອງອະນຸມັດ, binding ເຄື່ອງທີ 2 → ປະຕິເສດ, correction ເກັບຕົ້ນສະບັບ, tenant isolation, ສິດ/data scope, scanner preview/confirm/tamper, migration test.
- Web (Vitest + Playwright 3 viewport): shift/roster, suspicious queue, HR on behalf, correction/OT approve, scanner import, attendance report.
- Mobile (Jest + Maestro ເທິງ YAL_L21): check-in ໃນເຂດ/ນອກເຂດ (Maestro `setLocation`), offline → online sync (airplane mode ຫຼື mock network), OT request, correction. **Mock-location detection ກວດເທິງເຄື່ອງຈິງ** (ເປີດ developer mock app) — ບັນທຶກຜົນໃຫ້ຜູ້ໃຊ້.
- Load test: ລາຍງານ throughput/p95 ຈິງ.

### 4.5 ເງື່ອນໄຂສຳເລັດ M5
- ທຸກ MUST ຂອງ FR-WS-06 / FR-ATT ເປັນ Implemented + test; tracking ອັບເດດ.
- DoD ຂໍ້ 2 ຜ່ານທັງໝົດ + Maestro ເທິງໂທລະສັບ + load test ມີຕົວເລກ.
- ບໍ່ມີຕົວເລກທຸລະກິດ hardcode (ທຸກຢ່າງຜ່ານ parameter).

---

## 5. M6 — Leave

ຂອບເຂດ ID: FR-LV-01..13, FR-ORG-03.2 (ຖາມຜູ້ແທນ), FR-NOTI-03 (leave events), ຄ້າງຈາກ M4.

### 5.1 Data model (agent/lead ດຽວ, ກ່ອນ)
ອີງ A14:
- `LeaveLedgerEntry` (employeeId, leaveTypeId, periodYear, kind ENTITLEMENT/USAGE/CANCEL/ADJUST/CARRY/EXPIRE, days ±, effectiveDate, leaveRequestId?, reason, createdBy). Balance = ຜົນລວມ; `LeaveBalance` ເປັນ cache ຫຼື ລຶບ.
- `LeaveType` ເພີ່ມ: `countingMethod` (WORKING_DAYS / CALENDAR_DAYS — ລາເກີດລູກ = CALENDAR, FR-LV-04), `legalMinDays` (ກັນຕັ້ງຕ່ຳກວ່າກົດໝາຍ FR-LV-01.2), `isCustom`, certificate rule, eligibility (minServiceDays, payTypes, gender).
- `LeaveRequest` ເພີ່ມ: `halfDayPart` (MORNING/AFTERNOON) ສຳລັບມື້ທຳອິດ/ສຸດທ້າຍ, `certificateFileId` + `certificateDueDate`, `filedByUserId` + capacity (HR / MANAGER — FR-LV-10), `cancelStatus`; `days` ຄິດຢູ່ backend ເທົ່ານັ້ນ.
- `ApprovalSubjectType` ເພີ່ມ `LEAVE_CANCEL`.
- Parameters: `leave.certificateThresholdDays` (1), `leave.certificateGraceDays` (3), `leave.yearBasis`, `leave.carryOverMaxDays`, `leave.carryOverExpiry`, `leave.sickMinServiceDays` (90). Default ຂອງ leave type ຈາກ `lao-labor.ts` (15/18, 30, 105/120, 3).
- Permissions: `leave.manage` / `leave.approve` ມີແລ້ວ; ເພີ່ມ `leave.file_on_behalf`, `leave.ledger.adjust`, `leave.calendar.read_all`.

### 5.2 ລາຍການວຽກ — ແຍກເປັນ agent

| Agent | ວຽກ | ID |
|---|---|---|
| **A — Base** (lead) | 5.1 schema + migration (ຍ້າຍ LeaveBalance ເດີມເປັນ ledger) + test; shared `countLeaveDays(employee, range, halfDay, pattern, holidays, method)`, `checkEligibility(...)` + unit test | FR-LV-03.3, 04, 06 (engine) |
| **B — Policy & ledger** | ຕັ້ງຄ່າ leave type (web, ບລັອກຕ່ຳກວ່າກົດໝາຍ), custom type, job ໃຫ້ສິດປະຈຳປີ (accrual), HR adjust + ເຫດຜົນ, ledger ລາຍຄົນ (audit view), carry-over + ໝົດອາຍຸ (SHOULD) | FR-LV-01, 02, 07, 08 |
| **C — ຍື່ນລາ** | ຟອມ web + mobile (ເຕັມ/ເຄິ່ງມື້, ສະແດງຈຳນວນມື້ ແລະ balance ຈາກ API ກ່ອນສົ່ງ), eligibility (tenure/balance/gender), ໃບແພດ (ບັງຄັບເມື່ອເກີນເກນ, ແນບພາຍຫຼັງພາຍໃນ 3 ມື້ + ແຈ້ງເຕືອນ), HR/ຫົວໜ້າຍື່ນແທນ, ຫົວໜ້າຍື່ນ → ຖາມຜູ້ແທນ (`ensureDelegationForAbsence`) | FR-LV-03, 05, 06, 09, 10, FR-ORG-03.2 |
| **D — Approval & cancel** | `submitApproval(LEAVE)` 1–2 ຂັ້ນຕາມ `approval.levels`; LEAVE handler: ອະນຸມັດ → ledger USAGE + `AttendanceDay` = LEAVE; ຍົກເລີກກ່ອນອະນຸມັດ (ທັນທີ) / ຫຼັງອະນຸມັດ → `LEAVE_CANCEL` → ledger CANCEL; ກວດ `onLeave()` ຂອງ approval routing ອ່ານ leave ອະນຸມັດແລ້ວ; ໜ້າອະນຸມັດສະແດງຄົນໃນທີມທີ່ລາມື້ດຽວກັນ | FR-LV-11, 12, 13.10 |
| **E — ປະຕິທິນ** | today/week/month (web + mobile), ສິດການເບິ່ງ: ພະນັກງານເຫັນແຕ່ "ລາ" + ອະນຸມັດແລ້ວ; ຫົວໜ້າ/HR ເຫັນປະເພດ + pending (ສີຕ່າງ); ຫົວໜ້າເຫັນທຸກລະດັບລຸ່ມ; HR ທຸກພະແນກ; filter (SHOULD); ວັນພັກ + ວັນພັກປະຈຳອາທິດ | FR-LV-13.1–13.9 |

ລຳດັບ: **A** → (B, C, D, E ຂະໜານ) → merge `m6` → ກວດຄົບ → commit.

### 5.3 Test ທີ່ຕ້ອງມີ
- Shared: ນັບມື້ຂ້າມວັນພັກ/ວັນພັກປະຈຳອາທິດ, schedule ລາຍຄົນ, ເຄິ່ງມື້, ລາເກີດລູກ 105 ວັນປະຕິທິນ, eligibility ທຸກກໍລະນີ.
- API: ledger ລວມຖືກ (grant → use → cancel → adjust), ບລັອກຕ່ຳກວ່າກົດໝາຍ, ຍື່ນແທນ (capacity + audit), 2 ຂັ້ນ + delegate + escalation, ຍົກເລີກທັງ 2 ແບບ, ໃບແພດໝົດກຳນົດ, ສິດປະຕິທິນ (ພະນັກງານບໍ່ເຫັນປະເພດ/ເຫດຜົນ), tenant isolation, migration.
- Web Playwright 3 viewport + Mobile Jest + Maestro: ຍື່ນລາ, ອະນຸມັດ, ຍົກເລີກ, ປະຕິທິນ.

### 5.4 ເງື່ອນໄຂສຳເລັດ M6
- ທຸກ MUST ຂອງ FR-LV + FR-ORG-03.2 Implemented + test; ວຽກຄ້າງ M4 ປິດ; tracking ອັບເດດ.
- ລາຍງານ attendance ສະແດງວັນລາຖືກ (ບໍ່ນັບເປັນຂາດ).
- DoD ຂໍ້ 2 ຜ່ານທັງໝົດ + Maestro.

---

## 6. ຄວາມສ່ຽງ ແລະ ຂໍ້ຄວນລະວັງ

- **Expo SDK 54 + native module ໃໝ່** (location/camera/sqlite): ໃຊ້ version ທີ່ `npx expo install` ເລືອກ, rebuild dev client, ທົດສອບເທິງ YAL_L21 ໄວ. ການ upgrade SDK ເປັນການຕັດສິນໃຈແຍກ — ຖາມຜູ້ໃຊ້ກ່ອນ.
- Huawei ບໍ່ມີ Google Play Services ຄົບ → `expo-location` ອາດຊ້າ/ບໍ່ມີ fused provider; ກວດ accuracy ແລະ fallback.
- ເວລາ: ເກັບ UTC `timestamptz`, workDate ຄິດດ້ວຍ `Workspace.timezone` ຜ່ານ helper ດຽວ (`lib/dates.ts`) — ຢ່າໃຊ້ `new Date()` local ໃນ logic.
- Push ຈິງຍັງລໍ EAS projectId/FCM/APNs; SMS gateway ຍັງເປັນ log adapter — test ຜ່ານ outbox.
- FRD (ໜ້າຈໍ M-xx/W-xx, ຕາຕະລາງ parameter §15) ຍັງບໍ່ໄດ້ຮັບ — ຖ້າໄດ້ມາລະຫວ່າງທາງ ໃຫ້ກວດ default ຄືນ.
