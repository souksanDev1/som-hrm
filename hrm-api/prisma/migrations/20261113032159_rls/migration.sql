-- Row-level security: every tenant table is isolated by workspace.
-- The API sets `app.workspace_id` (tenant requests) or `app.bypass_rls` (sign-in, seed, jobs)
-- per transaction via set_config(..., true). FORCE makes the policy apply to the table owner too.
-- NOTE: superusers always bypass RLS — run the app as a normal role.

ALTER TABLE "Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workspace" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Workspace" USING (current_setting('app.bypass_rls', true) = 'on' OR "id" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "id" = current_setting('app.workspace_id', true));

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Subscription" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Role" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RolePermission" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "UserRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "UserRole" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "RefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RefreshToken" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "DeviceBinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceBinding" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeviceBinding" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "Branch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Branch" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Branch" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "Department" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Department" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Department" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "Position" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Position" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Position" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "Employee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Employee" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Employee" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "EmployeeDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmployeeDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EmployeeDocument" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "EmergencyContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmergencyContact" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EmergencyContact" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "EmploymentHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmploymentHistory" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "EmploymentHistory" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "Shift" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Shift" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Shift" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "WorkSchedule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkSchedule" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkSchedule" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "Holiday" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Holiday" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Holiday" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "AttendanceRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendanceRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AttendanceRecord" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "AttendanceCorrection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendanceCorrection" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AttendanceCorrection" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "OvertimeRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OvertimeRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OvertimeRecord" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "ScanImport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScanImport" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScanImport" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "ScanImportRow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ScanImportRow" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScanImportRow" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "LeaveType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveType" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LeaveType" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "LeavePolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeavePolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LeavePolicy" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "LeaveBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveBalance" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LeaveBalance" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "LeaveRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LeaveRequest" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "LeaveApproval" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeaveApproval" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LeaveApproval" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "ApprovalDelegation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalDelegation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ApprovalDelegation" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "OnboardingTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OnboardingTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OnboardingTemplate" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "OnboardingTemplateTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OnboardingTemplateTask" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OnboardingTemplateTask" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "OnboardingTask" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OnboardingTask" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OnboardingTask" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "Offboarding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Offboarding" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Offboarding" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Notification" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));

ALTER TABLE "PushToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PushToken" USING (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true)) WITH CHECK (current_setting('app.bypass_rls', true) = 'on' OR "workspaceId" = current_setting('app.workspace_id', true));
