-- M5 attendance (A13): AttendancePunch (raw punches) + AttendanceDay (computed per employee/work date) replace
-- the schema-only AttendanceRecord; OvertimeRecord becomes OvertimeRequest (4 OT categories); shift roster,
-- branch attendance modes, device-change requests, off-site permissions, kiosk devices, scanner import columns.
-- Generated with `prisma migrate diff`, then by hand: emptiness guard, enum replacement, partial unique index for
-- one active device per user, shift grace -> parameter, RLS and permission grants.
-- FORCE RLS applies to the migrating owner too, so bypass for this transaction.
SELECT set_config('app.bypass_rls', 'on', true);

-- No code ever wrote these tables (schema-only before M5); refuse to drop real data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AttendanceRecord") OR EXISTS (SELECT 1 FROM "OvertimeRecord")
     OR EXISTS (SELECT 1 FROM "AttendanceCorrection") OR EXISTS (SELECT 1 FROM "ScanImport") THEN
    RAISE EXCEPTION 'Attendance tables hold rows: migrate them to AttendancePunch/OvertimeRequest before applying 20261119090000_m5_attendance';
  END IF;
END $$;

ALTER TABLE "AttendanceRecord" DROP CONSTRAINT "AttendanceRecord_employeeId_fkey";
ALTER TABLE "AttendanceRecord" DROP CONSTRAINT "AttendanceRecord_branchId_fkey";
ALTER TABLE "AttendanceCorrection" DROP CONSTRAINT "AttendanceCorrection_attendanceId_fkey";
ALTER TABLE "OvertimeRecord" DROP CONSTRAINT "OvertimeRecord_employeeId_fkey";
DROP TABLE "AttendanceRecord";
DROP TABLE "OvertimeRecord";

-- Both enums were only used by AttendanceRecord: replace them outright.
DROP TYPE "AttendanceStatus";
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'EARLY', 'ABSENT', 'MISSING_IN', 'MISSING_OUT', 'HOLIDAY', 'REST', 'LEAVE');
DROP TYPE "AttendanceSource";
CREATE TYPE "AttendanceSource" AS ENUM ('MOBILE', 'KIOSK', 'SCANNER', 'HR_ON_BEHALF', 'CORRECTION');

-- CreateEnum
CREATE TYPE "PunchKind" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "PunchReviewStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttendanceMode" AS ENUM ('MOBILE', 'SCANNER', 'KIOSK');

-- CreateEnum
CREATE TYPE "OvertimeKind" AS ENUM ('PRE', 'POST');

-- CreateEnum
CREATE TYPE "ScanFormat" AS ENUM ('ZKTECO', 'HIP', 'GENERIC');

-- CreateEnum
CREATE TYPE "ScanRowStatus" AS ENUM ('OK', 'UNMATCHED', 'DUPLICATE', 'INVALID');

-- AlterEnum
ALTER TYPE "ApprovalSubjectType" ADD VALUE 'OFFSITE_CHECKIN';
ALTER TYPE "ApprovalSubjectType" ADD VALUE 'DEVICE_CHANGE';





-- AlterTable
ALTER TABLE "DeviceBinding" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedById" TEXT;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "attendanceModes" "AttendanceMode"[] DEFAULT ARRAY['MOBILE']::"AttendanceMode"[];

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "code" TEXT,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "lateGraceMinutes" DROP NOT NULL,
ALTER COLUMN "lateGraceMinutes" DROP DEFAULT,
ALTER COLUMN "earlyGraceMinutes" DROP NOT NULL,
ALTER COLUMN "earlyGraceMinutes" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AttendanceCorrection" DROP COLUMN "attendanceId",
DROP COLUMN "reviewNote",
DROP COLUMN "reviewedAt",
DROP COLUMN "reviewerUserId",
ADD COLUMN     "attachmentFileId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "originalInPunchId" TEXT,
ADD COLUMN     "originalOutPunchId" TEXT;

-- AlterTable
ALTER TABLE "ScanImport" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "sha256" TEXT NOT NULL,
DROP COLUMN "format",
ADD COLUMN     "format" "ScanFormat" NOT NULL;

-- AlterTable
ALTER TABLE "ScanImportRow" DROP COLUMN "timestamp",
ADD COLUMN     "capturedAt" TIMESTAMP(3),
ADD COLUMN     "duplicateOfPunchId" TEXT,
ADD COLUMN     "matchedEmployeeId" TEXT,
ADD COLUMN     "punchId" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "ScanRowStatus" NOT NULL;



-- CreateTable
CREATE TABLE "DeviceChangeRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "model" TEXT,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KioskDevice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "enrolledById" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KioskDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftRoster" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shiftId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftRoster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendancePunch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT,
    "kind" "PunchKind" NOT NULL,
    "workDate" DATE NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyMetres" DOUBLE PRECISION,
    "distanceMetres" DOUBLE PRECISION,
    "source" "AttendanceSource" NOT NULL,
    "clientRef" TEXT,
    "deviceId" TEXT,
    "kioskDeviceId" TEXT,
    "selfieFileId" TEXT,
    "offline" BOOLEAN NOT NULL DEFAULT false,
    "offsite" BOOLEAN NOT NULL DEFAULT false,
    "offsiteReason" TEXT,
    "suspicious" BOOLEAN NOT NULL DEFAULT false,
    "suspiciousReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reviewStatus" "PunchReviewStatus" NOT NULL DEFAULT 'NONE',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdById" TEXT,
    "reason" TEXT,
    "scanImportId" TEXT,
    "supersededById" TEXT,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendancePunch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceDay" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "shiftId" TEXT,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "scheduledMinutes" INTEGER NOT NULL DEFAULT 0,
    "firstInPunchId" TEXT,
    "lastOutPunchId" TEXT,
    "firstInAt" TIMESTAMP(3),
    "lastOutAt" TIMESTAMP(3),
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "AttendanceStatus" NOT NULL,
    "missingNotifiedAt" TIMESTAMP(3),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OffsitePermission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "note" TEXT,
    "grantedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OffsitePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimeRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "kind" "OvertimeKind" NOT NULL,
    "plannedStart" TIMESTAMP(3) NOT NULL,
    "plannedEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "workdayDayMinutes" INTEGER NOT NULL DEFAULT 0,
    "workdayNightMinutes" INTEGER NOT NULL DEFAULT 0,
    "holidayDayMinutes" INTEGER NOT NULL DEFAULT 0,
    "holidayNightMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OvertimeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceChangeRequest_workspaceId_status_idx" ON "DeviceChangeRequest"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "DeviceChangeRequest_workspaceId_employeeId_idx" ON "DeviceChangeRequest"("workspaceId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "KioskDevice_tokenHash_key" ON "KioskDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "KioskDevice_workspaceId_branchId_idx" ON "KioskDevice"("workspaceId", "branchId");

-- CreateIndex
CREATE INDEX "ShiftRoster_workspaceId_date_idx" ON "ShiftRoster"("workspaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftRoster_employeeId_date_key" ON "ShiftRoster"("employeeId", "date");

-- CreateIndex
CREATE INDEX "AttendancePunch_workspaceId_employeeId_workDate_idx" ON "AttendancePunch"("workspaceId", "employeeId", "workDate");

-- CreateIndex
CREATE INDEX "AttendancePunch_workspaceId_workDate_idx" ON "AttendancePunch"("workspaceId", "workDate");

-- CreateIndex
CREATE INDEX "AttendancePunch_workspaceId_reviewStatus_idx" ON "AttendancePunch"("workspaceId", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AttendancePunch_workspaceId_clientRef_key" ON "AttendancePunch"("workspaceId", "clientRef");

-- CreateIndex
CREATE INDEX "AttendanceDay_workspaceId_workDate_idx" ON "AttendanceDay"("workspaceId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceDay_workspaceId_status_idx" ON "AttendanceDay"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceDay_employeeId_workDate_key" ON "AttendanceDay"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "OffsitePermission_workspaceId_employeeId_idx" ON "OffsitePermission"("workspaceId", "employeeId");

-- CreateIndex
CREATE INDEX "OvertimeRequest_workspaceId_employeeId_workDate_idx" ON "OvertimeRequest"("workspaceId", "employeeId", "workDate");

-- CreateIndex
CREATE INDEX "OvertimeRequest_workspaceId_status_idx" ON "OvertimeRequest"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_workspaceId_employeeId_workDate_idx" ON "AttendanceCorrection"("workspaceId", "employeeId", "workDate");

-- AddForeignKey
ALTER TABLE "DeviceChangeRequest" ADD CONSTRAINT "DeviceChangeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskDevice" ADD CONSTRAINT "KioskDevice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRoster" ADD CONSTRAINT "ShiftRoster_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftRoster" ADD CONSTRAINT "ShiftRoster_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePunch" ADD CONSTRAINT "AttendancePunch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceDay" ADD CONSTRAINT "AttendanceDay_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OffsitePermission" ADD CONSTRAINT "OffsitePermission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Shift grace now falls back to the workspace parameters (attendance.lateGraceMinutes / earlyGraceMinutes);
-- no screen ever edited the old per-shift defaults (5 / 0), so clear them.
UPDATE "Shift" SET "lateGraceMinutes" = NULL, "earlyGraceMinutes" = NULL;

-- FR-ATT-11.1: at most one active device binding per user.
UPDATE "DeviceBinding" d SET "isActive" = false
WHERE d."isActive" AND EXISTS (
  SELECT 1 FROM "DeviceBinding" o WHERE o."userId" = d."userId" AND o."isActive" AND o."createdAt" > d."createdAt"
);
CREATE UNIQUE INDEX "DeviceBinding_one_active_per_user" ON "DeviceBinding"("userId") WHERE "isActive";

-- ───────── Row-level security (same pattern as *_rls) ─────────
ALTER TABLE "DeviceChangeRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceChangeRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeviceChangeRequest" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "KioskDevice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KioskDevice" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "KioskDevice" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "ShiftRoster" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShiftRoster" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ShiftRoster" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "AttendancePunch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendancePunch" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AttendancePunch" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "AttendanceDay" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendanceDay" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AttendanceDay" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "OffsitePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OffsitePermission" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OffsitePermission" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "OvertimeRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OvertimeRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OvertimeRequest" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

-- ───────── Permissions for the built-in OWNER and HR_ADMIN roles ─────────
INSERT INTO "Permission" ("id", "key", "description")
VALUES
  ('perm_attendance_review', 'attendance.review', 'Review the suspicious-attendance queue (approve or reject punches)'),
  ('perm_attendance_punch_on_behalf', 'attendance.punch_on_behalf', 'Record a punch for an employee, with a reason'),
  ('perm_attendance_device_manage', 'attendance.device.manage', 'See and reset employees'' bound devices'),
  ('perm_attendance_offsite_manage', 'attendance.offsite.manage', 'Grant and revoke off-site work permissions'),
  ('perm_scan_import', 'scan.import', 'Import scanner attendance files'),
  ('perm_kiosk_manage', 'kiosk.manage', 'Enrol and revoke kiosk devices'),
  ('perm_shift_manage', 'shift.manage', 'Define shifts and the shift roster')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("workspaceId", "roleId", "permissionId")
SELECT r."workspaceId", r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."key" IN ('attendance.review', 'attendance.punch_on_behalf', 'attendance.device.manage', 'attendance.offsite.manage',
                  'scan.import', 'kiosk.manage', 'shift.manage')
  AND r."code" IN ('OWNER', 'HR_ADMIN')
  AND r."isSystem" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
