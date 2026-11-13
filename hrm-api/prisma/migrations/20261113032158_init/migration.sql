-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('PROBATION', 'ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'DAILY', 'HOURLY', 'CONTRACT');

-- CreateEnum
CREATE TYPE "NationalityType" AS ENUM ('LAO', 'FOREIGN');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('WORK_PERMIT', 'VISA', 'PASSPORT', 'ID_CARD', 'FAMILY_BOOK', 'CONTRACT', 'MEDICAL_CERT', 'OTHER');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('ON_TIME', 'LATE', 'EARLY_LEAVE', 'ABSENT', 'ON_LEAVE', 'HOLIDAY', 'DAY_OFF');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('MOBILE', 'KIOSK', 'SCANNER', 'MANUAL');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveCategory" AS ENUM ('ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'PERSONAL', 'MARRIAGE', 'BEREAVEMENT', 'UNPAID');

-- CreateEnum
CREATE TYPE "HalfDay" AS ENUM ('NONE', 'AM', 'PM');

-- CreateEnum
CREATE TYPE "ScanImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('ONBOARDING', 'OFFBOARDING');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('DOCUMENT_EXPIRY', 'LEAVE_REQUEST', 'LEAVE_DECISION', 'CORRECTION_REQUEST', 'CORRECTION_DECISION', 'SUSPICIOUS_ATTENDANCE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Vientiane',
    "locale" TEXT NOT NULL DEFAULT 'lo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'trial',
    "seatLimit" INTEGER NOT NULL DEFAULT 50,
    "seatCredit" INTEGER NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "pinHash" TEXT,
    "mustChangeCredential" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "locale" TEXT NOT NULL DEFAULT 'lo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "workspaceId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceBinding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "model" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geofenceRadius" INTEGER NOT NULL DEFAULT 150,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "headEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nickname" TEXT,
    "gender" "Gender" NOT NULL,
    "dateOfBirth" DATE,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "nationalityType" "NationalityType" NOT NULL DEFAULT 'LAO',
    "nationality" TEXT,
    "idCardNo" TEXT,
    "socialSecurityNoEnc" TEXT,
    "familyBookNoEnc" TEXT,
    "hireDate" DATE NOT NULL,
    "employmentType" "EmploymentType" NOT NULL,
    "status" "EmploymentStatus" NOT NULL DEFAULT 'PROBATION',
    "hazardousWork" BOOLEAN NOT NULL DEFAULT false,
    "branchId" TEXT,
    "departmentId" TEXT,
    "positionId" TEXT,
    "managerId" TEXT,
    "workScheduleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "number" TEXT,
    "issuedAt" DATE,
    "expiresAt" DATE,
    "fileUrl" TEXT,
    "note" TEXT,
    "lastAlertDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentHistory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "fromValue" JSONB,
    "toValue" JSONB,
    "effectiveDate" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmploymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "lateGraceMinutes" INTEGER NOT NULL DEFAULT 5,
    "earlyGraceMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSchedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "shiftId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nameLo" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "womenOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "branchId" TEXT,
    "workDate" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInAccuracy" DOUBLE PRECISION,
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "status" "AttendanceStatus",
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "source" "AttendanceSource" NOT NULL DEFAULT 'MOBILE',
    "deviceCapturedAt" TIMESTAMP(3),
    "clientRef" TEXT,
    "deviceId" TEXT,
    "selfieUrl" TEXT,
    "suspicious" BOOLEAN NOT NULL DEFAULT false,
    "suspiciousReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceCorrection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceId" TEXT,
    "workDate" DATE NOT NULL,
    "requestedCheckIn" TIMESTAMP(3),
    "requestedCheckOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OvertimeRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "minutes" INTEGER NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OvertimeRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanImport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" "ScanImportStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanImportRow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "employeeCode" TEXT,
    "timestamp" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "error" TEXT,

    CONSTRAINT "ScanImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "LeaveCategory" NOT NULL,
    "nameLo" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT true,
    "gender" "Gender",
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "daysPerYear" DECIMAL(6,2) NOT NULL,
    "hazardousDays" DECIMAL(6,2),
    "minServiceDays" INTEGER NOT NULL DEFAULT 0,
    "carryOverMax" DECIMAL(6,2) NOT NULL DEFAULT 0,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "entitled" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "carried" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "used" DECIMAL(6,2) NOT NULL DEFAULT 0,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "halfDay" "HalfDay" NOT NULL DEFAULT 'NONE',
    "days" DECIMAL(6,2) NOT NULL,
    "reason" TEXT,
    "attachmentUrl" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "submittedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveApproval" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "actingForUserId" TEXT,
    "decision" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalDelegation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "delegatorUserId" TEXT NOT NULL,
    "delegateUserId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TaskKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTemplateTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueOffsetDays" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OnboardingTemplateTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "TaskKind" NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" DATE,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnboardingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offboarding" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "lastWorkingDate" DATE NOT NULL,
    "reason" TEXT,
    "leaveBalanceAtExit" JSONB,
    "otMinutesAtExit" INTEGER NOT NULL DEFAULT 0,
    "accessRevokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_code_key" ON "Workspace"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_workspaceId_key" ON "Subscription"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "User_workspaceId_email_key" ON "User"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_workspaceId_phone_key" ON "User"("workspaceId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Role_workspaceId_code_key" ON "Role"("workspaceId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "RolePermission_workspaceId_idx" ON "RolePermission"("workspaceId");

-- CreateIndex
CREATE INDEX "UserRole_workspaceId_idx" ON "UserRole"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_workspaceId_idx" ON "RefreshToken"("workspaceId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_entity_entityId_idx" ON "AuditLog"("workspaceId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "DeviceBinding_workspaceId_idx" ON "DeviceBinding"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceBinding_workspaceId_userId_deviceId_key" ON "DeviceBinding"("workspaceId", "userId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_workspaceId_name_key" ON "Branch"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_workspaceId_name_key" ON "Department"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Position_workspaceId_name_key" ON "Position"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Employee_workspaceId_status_idx" ON "Employee"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Employee_workspaceId_managerId_idx" ON "Employee"("workspaceId", "managerId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_workspaceId_employeeCode_key" ON "Employee"("workspaceId", "employeeCode");

-- CreateIndex
CREATE INDEX "EmployeeDocument_workspaceId_expiresAt_idx" ON "EmployeeDocument"("workspaceId", "expiresAt");

-- CreateIndex
CREATE INDEX "EmergencyContact_workspaceId_idx" ON "EmergencyContact"("workspaceId");

-- CreateIndex
CREATE INDEX "EmploymentHistory_workspaceId_employeeId_idx" ON "EmploymentHistory"("workspaceId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_workspaceId_name_key" ON "Shift"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSchedule_workspaceId_name_key" ON "WorkSchedule"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_workspaceId_date_key" ON "Holiday"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_workspaceId_workDate_idx" ON "AttendanceRecord"("workspaceId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_workDate_key" ON "AttendanceRecord"("employeeId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_workspaceId_clientRef_key" ON "AttendanceRecord"("workspaceId", "clientRef");

-- CreateIndex
CREATE INDEX "AttendanceCorrection_workspaceId_status_idx" ON "AttendanceCorrection"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "OvertimeRecord_workspaceId_employeeId_workDate_idx" ON "OvertimeRecord"("workspaceId", "employeeId", "workDate");

-- CreateIndex
CREATE INDEX "ScanImport_workspaceId_createdAt_idx" ON "ScanImport"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ScanImportRow_workspaceId_importId_idx" ON "ScanImportRow"("workspaceId", "importId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_workspaceId_code_key" ON "LeaveType"("workspaceId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "LeavePolicy_leaveTypeId_key" ON "LeavePolicy"("leaveTypeId");

-- CreateIndex
CREATE INDEX "LeavePolicy_workspaceId_idx" ON "LeavePolicy"("workspaceId");

-- CreateIndex
CREATE INDEX "LeaveBalance_workspaceId_idx" ON "LeaveBalance"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_employeeId_leaveTypeId_year_key" ON "LeaveBalance"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "LeaveRequest_workspaceId_status_idx" ON "LeaveRequest"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_workspaceId_employeeId_idx" ON "LeaveRequest"("workspaceId", "employeeId");

-- CreateIndex
CREATE INDEX "LeaveApproval_workspaceId_approverUserId_decision_idx" ON "LeaveApproval"("workspaceId", "approverUserId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveApproval_leaveRequestId_step_key" ON "LeaveApproval"("leaveRequestId", "step");

-- CreateIndex
CREATE INDEX "ApprovalDelegation_workspaceId_delegatorUserId_idx" ON "ApprovalDelegation"("workspaceId", "delegatorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingTemplate_workspaceId_name_key" ON "OnboardingTemplate"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "OnboardingTemplateTask_workspaceId_idx" ON "OnboardingTemplateTask"("workspaceId");

-- CreateIndex
CREATE INDEX "OnboardingTask_workspaceId_employeeId_idx" ON "OnboardingTask"("workspaceId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Offboarding_employeeId_key" ON "Offboarding"("employeeId");

-- CreateIndex
CREATE INDEX "Offboarding_workspaceId_idx" ON "Offboarding"("workspaceId");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_userId_readAt_idx" ON "Notification"("workspaceId", "userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_workspaceId_idx" ON "PushToken"("workspaceId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceBinding" ADD CONSTRAINT "DeviceBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_workScheduleId_fkey" FOREIGN KEY ("workScheduleId") REFERENCES "WorkSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentHistory" ADD CONSTRAINT "EmploymentHistory_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "AttendanceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRecord" ADD CONSTRAINT "OvertimeRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanImportRow" ADD CONSTRAINT "ScanImportRow_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ScanImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicy" ADD CONSTRAINT "LeavePolicy_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApproval" ADD CONSTRAINT "LeaveApproval_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTemplateTask" ADD CONSTRAINT "OnboardingTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingTask" ADD CONSTRAINT "OnboardingTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offboarding" ADD CONSTRAINT "Offboarding_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
