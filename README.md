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
pnpm dev:api                              # http://localhost:4000
pnpm dev:web                              # http://localhost:3000
pnpm dev:mobile                           # Expo (i = iOS simulator, a = Android emulator)
```

`db:start` ໃຊ້ `embedded-postgres` (ບໍ່ຕ້ອງຕິດຕັ້ງໃສ່ລະບົບ). ຖ້າມີ PostgreSQL ຢູ່ແລ້ວ ໃຫ້ຕັ້ງ `DATABASE_URL` ເອງ —
**ຕ້ອງເປັນ role ທີ່ບໍ່ແມ່ນ superuser** ບໍ່ດັ່ງນັ້ນ row-level security ຈະບໍ່ເຮັດວຽກ.

### ບັນຊີທົດລອງ (development seed ເທົ່ານັ້ນ)

ເບິ່ງ [hrm-api/prisma/seed.ts](hrm-api/prisma/seed.ts) — ລະຫັດບໍລິສັດ `som-demo`, HR ເຂົ້າດ້ວຍອີເມວ/ລະຫັດຜ່ານ,
ພະນັກງານໜ້າງານ E003 ເຂົ້າດ້ວຍ ເບີໂທ/ລະຫັດພະນັກງານ + PIN.

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
- M2: ລົງເວລາ (offline queue, anti-fake-GPS, selfie), ກະ 6 ມື້, OT, ນຳເຂົ້າເຄື່ອງສະແກນ, ຄຳຂໍແກ້ເວລາ
- M3: ການລາ (ກົດລາວ), ອະນຸມັດ + ຜູ້ອະນຸມັດແທນ, push notification
- M4: Onboarding/Offboarding (ເກັບ OT/ວັນລາເຫຼືອ), ແຈ້ງເຕືອນເອກະສານອັດຕະໂນມັດ, ລາຍງານ, dashboard
