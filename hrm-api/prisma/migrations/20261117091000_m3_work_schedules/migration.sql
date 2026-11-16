-- M3 working schedules (FR-WS-03): effective-dated standard versions, per-employee overrides,
-- `schedule.manage` permission. Generated with `prisma migrate diff`, then reordered so data is
-- backfilled before `workingDays` is dropped, plus RLS and data migration by hand.
-- FORCE RLS applies to the migrating owner too, so bypass for this transaction.
SELECT set_config('app.bypass_rls', 'on', true);

-- DropIndex (standard versions share a name; uniqueness is now per effective date)
DROP INDEX "WorkSchedule_workspaceId_name_key";

-- AlterTable
ALTER TABLE "WorkSchedule" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "dayMinutes" INTEGER[],
ADD COLUMN     "effectiveFrom" DATE,
ADD COLUMN     "reason" TEXT;

-- Backfill: working days become 8 h (480 min) days, the rest 0 (index 0 = Sunday).
UPDATE "WorkSchedule"
SET "dayMinutes" = ARRAY(
  SELECT CASE WHEN d = ANY("workingDays") THEN 480 ELSE 0 END FROM generate_series(0, 6) AS d ORDER BY d
);
-- Backfill: the existing default schedule becomes the first standard version, in force from the
-- workspace's creation date in its own time zone (it also covers earlier dates, see the resolver).
UPDATE "WorkSchedule" s
SET "effectiveFrom" = ((w."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE w."timezone")::date
FROM "Workspace" w
WHERE s."workspaceId" = w."id" AND s."isDefault" = true;

ALTER TABLE "WorkSchedule" DROP COLUMN "workingDays";

-- CreateTable
CREATE TABLE "ScheduleAssignment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "effectiveFrom" DATE NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleAssignment_workspaceId_employeeId_idx" ON "ScheduleAssignment"("workspaceId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleAssignment_employeeId_effectiveFrom_key" ON "ScheduleAssignment"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "WorkSchedule_workspaceId_idx" ON "WorkSchedule"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSchedule_workspaceId_isDefault_effectiveFrom_key" ON "WorkSchedule"("workspaceId", "isDefault", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "WorkSchedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: an employee pointing at a non-default schedule (legacy Employee.workScheduleId) keeps it
-- as an override from their hire date. Employees on the default schedule need no row (standard).
INSERT INTO "ScheduleAssignment" ("id", "workspaceId", "employeeId", "scheduleId", "effectiveFrom", "reason")
SELECT gen_random_uuid()::text, e."workspaceId", e."id", s."id", e."hireDate", 'Migrated from Employee.workScheduleId'
FROM "Employee" e
JOIN "WorkSchedule" s ON s."id" = e."workScheduleId"
WHERE s."isDefault" = false;

-- ───────── Row-level security (same pattern as *_rls) ─────────
ALTER TABLE "ScheduleAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScheduleAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScheduleAssignment" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

-- ───────── Permission `schedule.manage` for the built-in OWNER and HR_ADMIN roles ─────────
INSERT INTO "Permission" ("id", "key", "description")
VALUES ('perm_schedule_manage', 'schedule.manage', 'Manage the standard working schedule and individual schedules')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("workspaceId", "roleId", "permissionId")
SELECT r."workspaceId", r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."key" = 'schedule.manage'
  AND r."code" IN ('OWNER', 'HR_ADMIN')
  AND r."isSystem" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
