-- M6 leave (A14): balance ledger replaces the schema-only LeaveBalance counter; leave-type counting method,
-- quota period and eligibility; request half-day / certificate / proxy-filing / cancellation columns;
-- LEAVE_CANCEL approval subject; RLS and permission grants.
-- FORCE RLS applies to the migrating owner too, so bypass for this transaction.
SELECT set_config('app.bypass_rls', 'on', true);

-- CreateEnum
CREATE TYPE "LeaveCountingMethod" AS ENUM ('WORKING_DAYS', 'CALENDAR_DAYS');
CREATE TYPE "LeaveQuotaPeriod" AS ENUM ('YEARLY', 'PER_EVENT', 'UNLIMITED');
CREATE TYPE "LeaveLedgerKind" AS ENUM ('ENTITLEMENT', 'USAGE', 'CANCEL', 'ADJUST', 'CARRY', 'EXPIRE');
CREATE TYPE "LeaveFiledAs" AS ENUM ('SELF', 'HR', 'MANAGER');

-- AlterEnum (new values are not used in this transaction)
ALTER TYPE "LeaveCategory" ADD VALUE 'OTHER';
ALTER TYPE "NotificationType" ADD VALUE 'LEAVE_CERTIFICATE_DUE';
ALTER TYPE "ApprovalSubjectType" ADD VALUE 'LEAVE_CANCEL';

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "countingMethod" "LeaveCountingMethod" NOT NULL DEFAULT 'WORKING_DAYS',
ADD COLUMN     "isCustom" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quotaPeriod" "LeaveQuotaPeriod" NOT NULL DEFAULT 'YEARLY',
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- carryOverMax per policy is replaced by the workspace parameters leave.carryOverMaxDays / leave.carryOverExpiryMonth
-- (no screen ever edited it).
ALTER TABLE "LeavePolicy" DROP COLUMN "carryOverMax",
ADD COLUMN     "minServicePayTypes" "PayType"[] DEFAULT ARRAY[]::"PayType"[],
ADD COLUMN     "multipleBirthDays" DECIMAL(6,2);

-- attachmentUrl was never written (no leave filing before M6); certificates are StoredFile rows now.
ALTER TABLE "LeaveRequest" DROP COLUMN "attachmentUrl",
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "certificateDueDate" DATE,
ADD COLUMN     "certificateFileId" TEXT,
ADD COLUMN     "delegationId" TEXT,
ADD COLUMN     "filedAs" "LeaveFiledAs" NOT NULL DEFAULT 'SELF',
ADD COLUMN     "multipleBirth" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LeaveLedgerEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "kind" "LeaveLedgerKind" NOT NULL,
    "days" DECIMAL(6,2) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "leaveRequestId" TEXT,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeaveCancelRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveCancelRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveLedgerEntry_workspaceId_employeeId_leaveTypeId_periodY_idx" ON "LeaveLedgerEntry"("workspaceId", "employeeId", "leaveTypeId", "periodYear");
CREATE INDEX "LeaveLedgerEntry_leaveRequestId_idx" ON "LeaveLedgerEntry"("leaveRequestId");
CREATE INDEX "LeaveCancelRequest_workspaceId_leaveRequestId_idx" ON "LeaveCancelRequest"("workspaceId", "leaveRequestId");
CREATE INDEX "LeaveRequest_workspaceId_startDate_endDate_idx" ON "LeaveRequest"("workspaceId", "startDate", "endDate");

-- One grant / carry / expiry per employee, type and year (the yearly jobs are idempotent on it).
CREATE UNIQUE INDEX "LeaveLedgerEntry_one_periodic" ON "LeaveLedgerEntry"("employeeId", "leaveTypeId", "periodYear", "kind")
  WHERE "kind" IN ('ENTITLEMENT', 'CARRY', 'EXPIRE');
-- One usage / cancel row per request and year (the approval handlers are idempotent on it).
CREATE UNIQUE INDEX "LeaveLedgerEntry_one_per_request" ON "LeaveLedgerEntry"("leaveRequestId", "periodYear", "kind")
  WHERE "kind" IN ('USAGE', 'CANCEL');
-- At most one pending cancellation per leave request (FR-LV-12.2).
CREATE UNIQUE INDEX "LeaveCancelRequest_one_pending" ON "LeaveCancelRequest"("leaveRequestId") WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "LeaveLedgerEntry" ADD CONSTRAINT "LeaveLedgerEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveLedgerEntry" ADD CONSTRAINT "LeaveLedgerEntry_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveLedgerEntry" ADD CONSTRAINT "LeaveLedgerEntry_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_certificateFileId_fkey" FOREIGN KEY ("certificateFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveCancelRequest" ADD CONSTRAINT "LeaveCancelRequest_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────── Existing data ─────────
-- Statutory leave types seeded before M6 (codes from @hrm/shared DEFAULT_LEAVE_TYPES): counting method, quota
-- period and display order. Maternity counts calendar days (FR-LV-04.1); 3-day event leave is per request (Q11).
UPDATE "LeaveType" SET "countingMethod" = 'CALENDAR_DAYS', "quotaPeriod" = 'PER_EVENT', "sortOrder" = 3 WHERE "code" = 'MATERNITY';
UPDATE "LeaveType" SET "quotaPeriod" = 'PER_EVENT', "sortOrder" = 4 WHERE "code" = 'PERSONAL';
UPDATE "LeaveType" SET "quotaPeriod" = 'PER_EVENT', "sortOrder" = 5 WHERE "code" = 'MARRIAGE';
UPDATE "LeaveType" SET "quotaPeriod" = 'PER_EVENT', "sortOrder" = 6 WHERE "code" = 'BEREAVEMENT';
UPDATE "LeaveType" SET "quotaPeriod" = 'UNLIMITED', "sortOrder" = 7 WHERE "code" = 'UNPAID';
UPDATE "LeaveType" SET "sortOrder" = 1 WHERE "code" = 'ANNUAL';
UPDATE "LeaveType" SET "sortOrder" = 2 WHERE "code" = 'SICK';
UPDATE "LeavePolicy" p SET "multipleBirthDays" = 120 FROM "LeaveType" t WHERE p."leaveTypeId" = t."id" AND t."code" = 'MATERNITY';
-- Sick leave: daily/hourly workers need more than 90 days of service (Lao Labour Law; client Q15).
UPDATE "LeavePolicy" p SET "minServiceDays" = 90, "minServicePayTypes" = ARRAY['DAILY', 'HOURLY']::"PayType"[]
  FROM "LeaveType" t WHERE p."leaveTypeId" = t."id" AND t."code" = 'SICK' AND p."minServiceDays" = 0;

-- LeaveBalance counters → ledger rows (nothing wrote them before M6; kept for safety).
INSERT INTO "LeaveLedgerEntry" ("id", "workspaceId", "employeeId", "leaveTypeId", "periodYear", "kind", "days", "effectiveDate", "reason")
SELECT 'mig_' || md5(b."id" || k.kind), b."workspaceId", b."employeeId", b."leaveTypeId", b."year", k.kind::"LeaveLedgerKind", k.days,
       make_date(b."year", 1, 1), 'Migrated from LeaveBalance'
FROM "LeaveBalance" b
CROSS JOIN LATERAL (VALUES ('ENTITLEMENT', b."entitled"), ('CARRY', b."carried"), ('ADJUST', -b."used")) AS k(kind, days)
WHERE k.days <> 0;

-- Leave already approved through the M4 inbox: record its usage so balances are right.
INSERT INTO "LeaveLedgerEntry" ("id", "workspaceId", "employeeId", "leaveTypeId", "periodYear", "kind", "days", "effectiveDate", "leaveRequestId", "reason")
SELECT 'mig_' || md5(r."id" || 'USAGE'), r."workspaceId", r."employeeId", r."leaveTypeId", EXTRACT(YEAR FROM r."startDate")::int, 'USAGE',
       -r."days", r."startDate", r."id", 'Approved before M6'
FROM "LeaveRequest" r
WHERE r."status" = 'APPROVED';

-- DropTable
ALTER TABLE "LeaveBalance" DROP CONSTRAINT "LeaveBalance_employeeId_fkey";
ALTER TABLE "LeaveBalance" DROP CONSTRAINT "LeaveBalance_leaveTypeId_fkey";
DROP TABLE "LeaveBalance";

-- ───────── Row-level security (same pattern as *_rls) ─────────
ALTER TABLE "LeaveLedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveLedgerEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LeaveLedgerEntry" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "LeaveCancelRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveCancelRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LeaveCancelRequest" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

-- ───────── Permissions for the built-in OWNER and HR_ADMIN roles ─────────
INSERT INTO "Permission" ("id", "key", "description")
VALUES
  ('perm_leave_file_on_behalf', 'leave.file_on_behalf', 'File leave on behalf of any employee (staff without smartphones)'),
  ('perm_leave_ledger_adjust', 'leave.ledger.adjust', 'Adjust leave balances with a reason'),
  ('perm_leave_calendar_read_all', 'leave.calendar.read_all', 'See the leave calendar of every department')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("workspaceId", "roleId", "permissionId")
SELECT r."workspaceId", r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."key" IN ('leave.file_on_behalf', 'leave.ledger.adjust', 'leave.calendar.read_all')
  AND r."code" IN ('OWNER', 'HR_ADMIN')
  AND r."isSystem" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
