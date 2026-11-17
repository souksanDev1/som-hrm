-- `employee.import` (FR-EMP-09): bulk import gets its own permission instead of riding on `employee.write`.
-- Every role that could import until now (it held `employee.write`) keeps that ability, so no access changes.
-- FORCE RLS applies to the migrating owner too, so bypass for this transaction.
SELECT set_config('app.bypass_rls', 'on', true);

INSERT INTO "Permission" ("id", "key", "description")
VALUES ('perm_employee_import', 'employee.import', 'Bulk-import employees from an Excel or CSV file')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "RolePermission" ("workspaceId", "roleId", "permissionId")
SELECT rp."workspaceId", rp."roleId", imp."id"
FROM "RolePermission" rp
JOIN "Permission" w ON w."id" = rp."permissionId" AND w."key" = 'employee.write'
CROSS JOIN "Permission" imp
WHERE imp."key" = 'employee.import'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
