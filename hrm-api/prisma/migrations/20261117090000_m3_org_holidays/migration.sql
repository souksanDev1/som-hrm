-- M3 part A: close/reopen departments and positions (FR-WS-02), holiday kinds + nationality (FR-WS-04/05).
-- No new tables: Branch, Department, Position and Holiday already have ENABLE + FORCE RLS and the
-- tenant_isolation policy (20261113032159_rls), which also covers the new columns.

-- CreateEnum
CREATE TYPE "HolidayKind" AS ENUM ('PUBLIC', 'TRADITIONAL', 'SUBSTITUTE', 'NATIONAL_DAY');

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Holiday" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" "HolidayKind" NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "nationality" TEXT;

-- Backfill: holidays seeded by bootstrap before M3 sit on the statutory fixed dates
-- (1 Jan, 8 Mar, 14-16 Apr, 1 May, 2 Dec); mark them as defaults so `ensureYear` treats those years as seeded.
-- FORCE RLS applies to the migrating owner too, so bypass for this transaction.
SELECT set_config('app.bypass_rls', 'on', true);
UPDATE "Holiday" SET "isDefault" = true
WHERE (EXTRACT(MONTH FROM "date"), EXTRACT(DAY FROM "date")) IN ((1, 1), (3, 8), (4, 14), (4, 15), (4, 16), (5, 1), (12, 2));
