# SOM HRM — ລະບົບບໍລິຫານບຸກຄະລາກອນ

Monorepo (pnpm workspace) ສຳລັບ HRM ເຟສ 1 — ເບິ່ງແຜນລະອຽດທີ່ [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

| Folder | ເນື້ອໃນ |
| --- | --- |
| `hrm-api/` | Fastify + TypeScript + Prisma + PostgreSQL (RLS) + Zod + JWT |
| `hrm-web/` | Next.js 15 (App Router) + Tailwind + TanStack Query + Zustand + React Hook Form + Zod + Playwright |
| `hrm-mobile/` | Expo SDK 54 (React Native, iOS + Android) + Expo Router + NativeWind + Jest + Maestro |
| `packages/shared/` | Zod schemas, types, enums, ກົດແຮງງານລາວ, i18n (ລາວ/English), API client, design tokens |

## ເລີ່ມຕົ້ນ (Getting started)

```bash
pnpm install
cp hrm-api/.env.example hrm-api/.env      # ແລ້ວໃສ່ JWT_SECRET ແລະ ENCRYPTION_KEY (openssl rand -base64 32)
pnpm --filter @hrm/api db:start           # PostgreSQL 16 ໃນເຄື່ອງ (port 5432) — ເປີດຄ້າງໄວ້ໃນ terminal ອື່ນ
pnpm --filter @hrm/api db:deploy          # ສ້າງຕາຕະລາງ + RLS
pnpm db:seed                              # ຂໍ້ມູນຕົວຢ່າງ
pnpm dev:api                              # http://localhost:4000 (OpenAPI: /docs)
pnpm --filter @hrm/api worker             # background jobs (pg-boss): notification delivery, document expiry, deactivation
pnpm dev:web                              # http://localhost:3000
pnpm dev:mobile                           # Expo (i = iOS simulator, a = Android emulator)
```

`db:start` ໃຊ້ `embedded-postgres` (ບໍ່ຕ້ອງຕິດຕັ້ງໃສ່ລະບົບ). ຖ້າມີ PostgreSQL ຢູ່ແລ້ວ ໃຫ້ຕັ້ງ `DATABASE_URL` ເອງ —
**ຕ້ອງເປັນ role ທີ່ບໍ່ແມ່ນ superuser** ບໍ່ດັ່ງນັ້ນ row-level security ຈະບໍ່ເຮັດວຽກ.

### ບັນຊີທົດລອງ (development seed ເທົ່ານັ້ນ)

ເບິ່ງ [hrm-api/prisma/seed.ts](hrm-api/prisma/seed.ts) — ລະຫັດບໍລິສັດ `som-demo`, HR ເຂົ້າດ້ວຍອີເມວ/ລະຫັດຜ່ານ,
ພະນັກງານໜ້າງານ E003 ເຂົ້າດ້ວຍ ເບີໂທ/ລະຫັດພະນັກງານ + PIN.
SOM Super Admin (`/platform`): ເບິ່ງ seed ດຽວກັນ; ສ້າງບັນຊີໃໝ່ດ້ວຍ `pnpm --filter @hrm/api platform:create-admin`.

ຄ່າ env ໃໝ່ (ເບິ່ງ [hrm-api/.env.example](hrm-api/.env.example)): `REQUIRE_PHONE_VERIFICATION` (ປິດອັດຕະໂນມັດໃນ production
ຖ້າຍັງໃຊ້ SMS ແບບ console), `TRUST_PROXY`, `FILE_STORAGE_DIR`, `FILE_MAX_BYTES`, push provider ຂອງ worker.

## ຄຳສັ່ງກວດສອບ (ທຸກອັນຕ້ອງຜ່ານກ່ອນ commit)

```bash
pnpm lint && pnpm typecheck && pnpm build && pnpm test && pnpm e2e
```

- `pnpm test` — Vitest (shared, api ກັບ PostgreSQL ຈິງໃນ `hrm_test`, web) + Jest (mobile)
- `pnpm e2e` — Playwright (desktop / tablet / mobile viewport) ກັບ API + ຖານຂໍ້ມູນ `hrm_e2e` ທີ່ seed ໃໝ່ທຸກຄັ້ງ
- `pnpm e2e:mobile` — Maestro (ຕ້ອງ build app ລົງ simulator/emulator ແລະ ເປີດ API ທີ່ມີ seed ກ່ອນ):
  ```bash
  cd hrm-mobile && EXPO_PUBLIC_API_URL=http://localhost:4000/api/v1 npx expo run:ios --configuration Release
  pnpm e2e:mobile
  ```

ຖານຂໍ້ມູນທົດສອບຈະຖືກລ້າງສະເພາະຊື່ທີ່ລົງທ້າຍດ້ວຍ `_test` / `_e2e` ເທົ່ານັ້ນ.

## Push notifications (FR-NOTI-01.1) — credentials ທີ່ຕ້ອງມີ

ໂຄດພ້ອມແລ້ວ ແຕ່ push ຈິງຈະເຮັດວຽກເມື່ອມີ credentials ລຸ່ມນີ້ເທົ່ານັ້ນ (ຢ່າ commit ໄຟລ໌ secret ເຂົ້າ repo).
ຖ້າບໍ່ມີ, app ບໍ່ຂໍສິດແຈ້ງເຕືອນ, ບໍ່ crash ແລະ ບໍ່ສະແດງ error (log ເຕືອນຄັ້ງດຽວ) — Maestro/Jest ແລ່ນໄດ້ປົກກະຕິ.

1. **EAS project** (expo.dev): `npx eas init` → ເອົາ project ID ມາຕັ້ງ env `EAS_PROJECT_ID` ຕອນ build
   (`app.config.js` ໃສ່ໃຫ້ເປັນ `extra.eas.projectId`; app ເປີດ push ສະເພາະເມື່ອມີຄ່ານີ້).
2. **Android — FCM V1 service account**: Firebase project ທີ່ມີ Android app `la.som.hrm` →
   (a) `google-services.json` → ຕັ້ງ env `GOOGLE_SERVICES_FILE=<path>` ຕອນ build;
   (b) service account key JSON (role *Firebase Cloud Messaging API Admin*) → ອັບໂຫຼດດ້ວຍ `eas credentials` (Android → FCM V1).
3. **iOS — APNs key** (Apple Developer → Keys → Apple Push Notifications service, ໄຟລ໌ `.p8` + Key ID + Team ID)
   ສຳລັບ bundle `la.som.hrm` → ອັບໂຫຼດດ້ວຍ `eas credentials` (iOS → Push Notifications).
4. **API worker**: `PUSH_PROVIDER=expo`; ແນະນຳເປີດ *Enhanced push security* ໃນ EAS ແລ້ວຕັ້ງ `EXPO_ACCESS_TOKEN`.

Worker ສົ່ງເປັນ batch (100/request), ກວດ receipts ຫຼັງ 15 ນາທີ, ລຶບ token ທີ່ `DeviceNotRegistered` ແລະ retry ແບບ backoff
ຜ່ານ outbox (`NotificationDelivery`). SMS (FR-NOTI-02) ຍັງມີແຕ່ provider `console` ຈົນກວ່າລູກຄ້າເລືອກ gateway.

## ສະຖາປັດຕະຍະກຳ

- API: `routes` (HTTP + schema) → `service` (business logic) → `repository` (Prisma). ທຸກ query ແລ່ນຜ່ານ
  `db.tenant(workspaceId, …)` ທີ່ຕັ້ງ `app.workspace_id` ໃຫ້ PostgreSQL RLS; ການ login/seed ໃຊ້ `db.system(…)`.
- ເລກປະກັນສັງຄົມ / ສຳມະໂນຄົວ ເຂົ້າລະຫັດ AES-256-GCM, ສະແດງແບບປິດບັງຖ້າບໍ່ມີສິດ `employee.sensitive.read`.
- ພະນັກງານບໍ່ມີອີເມວ: login ດ້ວຍ ລະຫັດພະນັກງານ/ເບີໂທ + PIN; HR ອອກ/ຣີເຊັດ PIN (ສະແດງຄັ້ງດຽວ) ແລະ ບັງຄັບປ່ຽນ.
- ປ້ອງກັນ brute force: lock ບັນຊີຫຼັງຜິດຫຼາຍຄັ້ງ + rate limit ຕໍ່ (IP + ບໍລິສັດ + ຜູ້ໃຊ້) ເພື່ອບໍ່ບລັອກຄົນໜ້າງານທີ່ໃຊ້ເນັດດຽວກັນ.
- Web/Mobile ແຍກ `features/` ຕາມ domain, `components/ui` (reusable) ແລະ `components/layout`.

## ສະຖານະ Milestone

- **M1 (ສຳເລັດ)**: monorepo, shared, Prisma schema ທັງໝົດ + RLS, auth (password/PIN, refresh rotation, lockout),
  RBAC, audit log, ພະນັກງານ (ເອກະສານຕ່າງປະເທດ + ສະຖານະໝົດອາຍຸ 90/60/30), ຜັງອົງກອນ, ໜ້າ login/ແຈ້ງເຕືອນ/error/offline.
- **M2 (ສຳເລັດ)**: SOM Super Admin, parameter store (effective-dated), OTP (ຢືນຢັນເບີ/ລືມລະຫັດ), login ບໍ່ຕ້ອງ email,
  ປິດ login ຕອນອອກວຽກ, ໄຟລ໌ເອກະສານ (PDF/JPG/PNG), job runner, notification center, OpenAPI, audit log append-only.
- **M3 (ສຳເລັດ)**: ປິດ/ເປີດ ສາຂາ-ພະແນກ-ຕຳແໜ່ງ + geofence, ປະຕິທິນວັນພັກ (8 ມີນາ, ວັນຊາດຕ່າງປະເທດ), ມື້ເຮັດວຽກ
  ມາດຕະຖານ/ລາຍຄົນ (effective date), ຂໍ້ມູນພະນັກງານຄົບ (ຊື່ລາວ/ອັງກິດ, ທີ່ຢູ່, ສັນຍາ/ການຈ່າຍ), ເອກະສານໃກ້ໝົດອາຍຸ, import Excel/CSV.
- M4–M7: ເບິ່ງ [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
