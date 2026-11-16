-- Data-only migration: add the `employee.read_all` permission (B8 data scope) and grant it to the
-- built-in OWNER and HR_ADMIN roles of every existing workspace. MANAGER keeps `employee.read`
-- only and is limited to themselves and their reporting line.
-- FORCE RLS applies to the migrating owner too, so bypass for this transaction.
SELECT set_config('app.bypass_rls', 'on', true);

INSERT INTO "Permission" ("id", "key", "description")
VALUES ('perm_employee_read_all', 'employee.read_all', 'See every employee in the workspace')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("workspaceId", "roleId", "permissionId")
SELECT r."workspaceId", r."id", p."id"
FROM "Role" r
CROSS JOIN "Permission" p
WHERE p."key" = 'employee.read_all'
  AND r."code" IN ('OWNER', 'HR_ADMIN')
  AND r."isSystem" = true
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
