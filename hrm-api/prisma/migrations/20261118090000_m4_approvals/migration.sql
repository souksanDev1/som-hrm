-- M4 approval engine (FR-ORG-02..06): generic ApprovalRequest + ApprovalStep, delegation audit columns,
-- permissions `approval.delegate.manage` and `approval.hr_fallback`. Generated with `prisma migrate diff`,
-- plus the LeaveApproval guard, RLS and permission grants by hand.
-- The schema-only LeaveApproval table and LeaveRequest.currentStep are replaced by the generic engine
-- (no code ever wrote them). FORCE RLS applies to the migrating owner too, so bypass for this transaction.
SELECT set_config('app.bypass_rls', 'on', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "LeaveApproval") THEN
    RAISE EXCEPTION 'LeaveApproval holds rows: move them to ApprovalRequest/ApprovalStep before applying 20261118090000_m4_approvals';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "ApprovalSubjectType" AS ENUM ('LEAVE', 'OVERTIME', 'ATTENDANCE_CORRECTION');

-- CreateEnum
CREATE TYPE "ApprovalCapacity" AS ENUM ('MANAGER', 'DELEGATE', 'UPPER_LEVEL', 'HR');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED');

-- DropForeignKey
ALTER TABLE "LeaveApproval" DROP CONSTRAINT "LeaveApproval_leaveRequestId_fkey";

-- AlterTable
ALTER TABLE "LeaveRequest" DROP COLUMN "currentStep";

-- AlterTable
ALTER TABLE "ApprovalDelegation" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "LeaveApproval";

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subjectType" "ApprovalSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "requesterEmployeeId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "requiredLevels" INTEGER NOT NULL DEFAULT 1,
    "submittedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "chainIndex" INTEGER,
    "approverUserId" TEXT,
    "delegateUserId" TEXT,
    "actingAs" "ApprovalCapacity" NOT NULL,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalRequest_workspaceId_status_idx" ON "ApprovalRequest"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_workspaceId_requesterEmployeeId_idx" ON "ApprovalRequest"("workspaceId", "requesterEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRequest_workspaceId_subjectType_subjectId_key" ON "ApprovalRequest"("workspaceId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ApprovalStep_requestId_idx" ON "ApprovalStep"("requestId");

-- CreateIndex
CREATE INDEX "ApprovalStep_workspaceId_decision_approverUserId_idx" ON "ApprovalStep"("workspaceId", "decision", "approverUserId");

-- CreateIndex
CREATE INDEX "ApprovalStep_workspaceId_decision_delegateUserId_idx" ON "ApprovalStep"("workspaceId", "decision", "delegateUserId");

-- CreateIndex
CREATE INDEX "ApprovalDelegation_workspaceId_delegateUserId_idx" ON "ApprovalDelegation"("workspaceId", "delegateUserId");

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterEmployeeId_fkey" FOREIGN KEY ("requesterEmployeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────── Row-level security (same pattern as *_rls; ApprovalDelegation already has it) ─────────
ALTER TABLE "ApprovalRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ApprovalRequest" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "ApprovalStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalStep" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ApprovalStep" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

-- ───────── Permissions for the built-in OWNER and HR_ADMIN roles ─────────
INSERT INTO "Permission" ("id", "key", "description")
VALUES
  ('perm_approval_delegate_manage', 'approval.delegate.manage', 'See and manage every manager''s approval delegations'),
  ('perm_approval_hr_fallback', 'approval.hr_fallback', 'Decide requests nobody in the chain of command can approve; notified on escalation')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("workspaceId", "roleId", "permissionId")
SELECT r."workspaceId", r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."key" IN ('approval.delegate.manage', 'approval.hr_fallback')
  AND r."code" IN ('OWNER', 'HR_ADMIN')
  AND r."isSystem" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
