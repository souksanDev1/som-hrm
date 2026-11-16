-- M2 foundation: SOM platform, parameters, OTP, files, notification outbox, PII blind indexes.
-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'SMS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('FIRST_LOGIN', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('EMPLOYEE_DOCUMENT', 'SELFIE', 'ATTACHMENT', 'IMPORT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'APPROVAL_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'APPROVAL_DECISION';
ALTER TYPE "NotificationType" ADD VALUE 'APPROVAL_ESCALATED';
ALTER TYPE "NotificationType" ADD VALUE 'MISSING_PUNCH';
ALTER TYPE "NotificationType" ADD VALUE 'PROBATION_ENDING';
ALTER TYPE "NotificationType" ADD VALUE 'OFFLINE_UNSYNCED';

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- AlterTable
-- Existing tokens become their own family. FORCE RLS applies to the migrating owner too, so bypass for this transaction.
SELECT set_config('app.bypass_rls', 'on', true);
ALTER TABLE "RefreshToken" ADD COLUMN     "familyId" TEXT;
UPDATE "RefreshToken" SET "familyId" = "id" WHERE "familyId" IS NULL;
ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "idCardNoEnc" TEXT,
ADD COLUMN     "idCardNoHash" TEXT,
ADD COLUMN     "socialSecurityNoHash" TEXT;

-- AlterTable
ALTER TABLE "EmployeeDocument" ADD COLUMN     "fileId" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "link" TEXT;

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceParameter" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemParameter" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformRefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationDelivery_workspaceId_status_idx" ON "NotificationDelivery"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");

-- CreateIndex
CREATE INDEX "StoredFile_workspaceId_purpose_idx" ON "StoredFile"("workspaceId", "purpose");

-- CreateIndex
CREATE INDEX "OtpChallenge_workspaceId_userId_purpose_createdAt_idx" ON "OtpChallenge"("workspaceId", "userId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceParameter_workspaceId_key_idx" ON "WorkspaceParameter"("workspaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceParameter_workspaceId_key_effectiveFrom_key" ON "WorkspaceParameter"("workspaceId", "key", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "SystemParameter_key_effectiveFrom_key" ON "SystemParameter"("key", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUser_email_key" ON "PlatformUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformRefreshToken_tokenHash_key" ON "PlatformRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PlatformRefreshToken_familyId_idx" ON "PlatformRefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_workspaceId_idCardNoHash_key" ON "Employee"("workspaceId", "idCardNoHash");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_workspaceId_socialSecurityNoHash_key" ON "Employee"("workspaceId", "socialSecurityNoHash");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_workspaceId_userId_dedupeKey_key" ON "Notification"("workspaceId", "userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformRefreshToken" ADD CONSTRAINT "PlatformRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ───────── Row-level security (same pattern as *_rls) ─────────
ALTER TABLE "NotificationDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationDelivery" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NotificationDelivery" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "StoredFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StoredFile" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StoredFile" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "OtpChallenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OtpChallenge" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OtpChallenge" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "WorkspaceParameter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceParameter" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkspaceParameter" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

-- Platform tables: reachable only from system (bypass) transactions, never from a tenant request.
ALTER TABLE "PlatformUser" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformUser" FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_only ON "PlatformUser" USING (current_setting('app.bypass_rls', true) = 'on') WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "PlatformRefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformRefreshToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_only ON "PlatformRefreshToken" USING (current_setting('app.bypass_rls', true) = 'on') WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

ALTER TABLE "PlatformAuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformAuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_only ON "PlatformAuditLog" USING (current_setting('app.bypass_rls', true) = 'on') WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

-- System parameters: readable by every request (tenant code needs OTP/lockout values), writable only by system.
ALTER TABLE "SystemParameter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SystemParameter" FORCE ROW LEVEL SECURITY;
CREATE POLICY system_parameter_read ON "SystemParameter" FOR SELECT USING (true);
CREATE POLICY system_parameter_write ON "SystemParameter" FOR ALL USING (current_setting('app.bypass_rls', true) = 'on') WITH CHECK (current_setting('app.bypass_rls', true) = 'on');

-- ───────── Append-only audit trails (NFR-06, FR-WS-08.6) ─────────
CREATE OR REPLACE FUNCTION hrm_forbid_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit log is append-only (% on %)', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION hrm_forbid_audit_mutation();
CREATE TRIGGER platform_audit_log_append_only BEFORE UPDATE OR DELETE ON "PlatformAuditLog" FOR EACH ROW EXECUTE FUNCTION hrm_forbid_audit_mutation();
-- Note: workspace deletion therefore never cascades into audit rows (AuditLog has no FK to Workspace by design).
