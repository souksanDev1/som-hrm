-- M3 employee data (FR-EMP-01.1, 01.4, 02.2, 02.3, 03.5, 03.6, 04.4).
-- Generated with `prisma migrate diff` and then edited by hand so existing rows are backfilled
-- before the new NOT NULL columns are enforced and the old EmploymentType column is dropped.

-- FORCE RLS applies to the migrating owner too, so bypass it for this transaction (UPDATEs below).
SELECT set_config('app.bypass_rls', 'on', true);

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('INDEFINITE', 'FIXED_TERM', 'PROBATION');

-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('MONTHLY', 'DAILY', 'HOURLY');

-- AlterEnum (FR-EMP-04.4 residence / stay permit)
ALTER TYPE "DocumentType" ADD VALUE 'RESIDENCE_PERMIT';

-- AlterTable: new columns are added nullable first and tightened after the backfill.
ALTER TABLE "Employee"
ADD COLUMN     "contractEndDate" DATE,
ADD COLUMN     "contractType" "ContractType",
ADD COLUMN     "district" TEXT,
ADD COLUMN     "familyBookHolder" TEXT,
ADD COLUMN     "firstNameEn" TEXT,
ADD COLUMN     "lastNameEn" TEXT,
ADD COLUMN     "payType" "PayType",
ADD COLUMN     "probationEndDate" DATE,
ADD COLUMN     "province" TEXT,
ADD COLUMN     "ssnRegisteredAt" DATE,
ADD COLUMN     "village" TEXT;

-- Backfill FR-EMP-03.5/03.6: split the old EmploymentType (contract + pay mixed) into two axes.
--   FULL_TIME -> INDEFINITE + MONTHLY
--   PART_TIME -> INDEFINITE + HOURLY
--   DAILY     -> INDEFINITE + DAILY
--   HOURLY    -> INDEFINITE + HOURLY
--   CONTRACT  -> FIXED_TERM + MONTHLY (end date unknown: left NULL for HR to fill in)
UPDATE "Employee" SET
  "contractType" = (CASE "employmentType"
    WHEN 'CONTRACT' THEN 'FIXED_TERM'
    ELSE 'INDEFINITE'
  END)::"ContractType",
  "payType" = (CASE "employmentType"
    WHEN 'DAILY' THEN 'DAILY'
    WHEN 'HOURLY' THEN 'HOURLY'
    WHEN 'PART_TIME' THEN 'HOURLY'
    ELSE 'MONTHLY'
  END)::"PayType";

-- Backfill FR-EMP-01.1: firstName/lastName hold the Lao name. Rows whose name is written only in
-- plain Latin letters were entered in English: copy it over. (ASCII-only pattern on purpose, so it
-- behaves the same on UTF8 and SQL_ASCII databases; names with accents are left for HR.)
UPDATE "Employee" SET
  "firstNameEn" = "firstName",
  "lastNameEn" = "lastName"
WHERE ("firstName" || ' ' || "lastName") ~ '^[A-Za-z][A-Za-z .''-]*$';

ALTER TABLE "Employee"
ALTER COLUMN "contractType" SET NOT NULL,
ALTER COLUMN "payType" SET NOT NULL;

-- The old column is fully replaced by contractType + payType. Historic EmploymentHistory JSON keeps
-- its `employmentType` values; clients still translate them (employmentType.* i18n keys).
ALTER TABLE "Employee" DROP COLUMN "employmentType";

-- DropEnum
DROP TYPE "EmploymentType";
