import {
  PERMISSIONS,
  type CreateDocumentData as DocumentData,
  type CreateEmergencyContactData as ContactData,
  type CreateEmployeeData,
  type UpdateEmployeeData as UpdateData,
  type CreateEmployeeResponse,
  type CredentialIssued,
  type EmployeeDetail,
  type EmployeeListQuery,
  type EmployeeSummary,
  type Paginated,
} from '@hrm/shared';
import type { Prisma } from '@prisma/client';
import { isUniqueViolation, type Db, type Tx } from '../../db/client';
import { generatePin, generateTempPassword, type FieldCipher } from '../../lib/crypto';
import { optionalDate, parseIsoDate } from '../../lib/dates';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import { hashSecret } from '../../lib/password';
import type { AuthContext } from '../auth/auth.service';
import { auditRepository } from '../audit/audit.repository';
import { toEmployeeDetail, toEmployeeSummary } from './employees.mapper';
import { employeesRepository as repo } from './employees.repository';

/** Fields whose change is recorded in EmploymentHistory. */
const TRACKED_FIELDS = ['status', 'departmentId', 'positionId', 'branchId', 'managerId', 'employmentType'] as const;

export const createEmployeesService = (db: Db, cipher: FieldCipher) => {
  const canSeeSensitive = (ctx: AuthContext) => ctx.permissions.includes(PERMISSIONS.EMPLOYEE_SENSITIVE_READ);

  const assertRefs = async (tx: Tx, ws: string, refs: Parameters<typeof repo.refsExist>[2]) => {
    const missing = await repo.refsExist(tx, ws, refs);
    if (missing.length) throw badRequest('invalid_reference', { fields: missing });
  };

  const assertNoManagerCycle = async (tx: Tx, ws: string, employeeId: string, managerId: string | undefined | null) => {
    if (!managerId) return;
    if (managerId === employeeId) throw badRequest('manager_cycle');
    const chain = await repo.managerChain(tx, ws, managerId);
    if (chain.includes(employeeId)) throw badRequest('manager_cycle');
  };

  const loadDetail = async (tx: Tx, ctx: AuthContext, id: string): Promise<EmployeeDetail> => {
    const e = await repo.findDetail(tx, ctx.workspaceId, id);
    if (!e) throw notFound();
    return toEmployeeDetail(e, cipher, canSeeSensitive(ctx));
  };

  const encryptOptional = (v: string | undefined | null) => (v ? cipher.encrypt(v) : v === null ? null : undefined);

  /** Create (or replace) credentials for an employee's user. Returns the one-time secret. */
  const issueCredential = async (
    tx: Tx,
    ctx: AuthContext,
    employee: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null },
    method: 'PASSWORD' | 'PIN',
    roleCode: string,
  ): Promise<CredentialIssued> => {
    if (method === 'PASSWORD' && !employee.email) throw badRequest('email_required_for_password');
    const secret = method === 'PIN' ? generatePin() : generateTempPassword();
    const hash = await hashSecret(secret);
    const existing = await repo.findUserByEmployee(tx, employee.id);
    if (existing) {
      await repo.updateUser(tx, existing.id, {
        ...(method === 'PIN' ? { pinHash: hash } : { passwordHash: hash }),
        mustChangeCredential: true,
        failedAttempts: 0,
        lockedUntil: null,
      });
      await tx.refreshToken.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: 'user.credential_reset', entity: 'User', entityId: existing.id, meta: { method } });
      return { userId: existing.id, method, temporarySecret: secret };
    }
    const role = await repo.findRoleByCode(tx, ctx.workspaceId, roleCode);
    if (!role) throw badRequest('invalid_role');
    try {
      const user = await repo.createUser(tx, {
        workspaceId: ctx.workspaceId,
        employeeId: employee.id,
        displayName: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        phone: employee.phone,
        ...(method === 'PIN' ? { pinHash: hash } : { passwordHash: hash }),
        mustChangeCredential: true,
        roles: { create: { roleId: role.id, workspaceId: ctx.workspaceId } },
      });
      await auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: 'user.created', entity: 'User', entityId: user.id, meta: { method, roleCode } });
      return { userId: user.id, method, temporarySecret: secret };
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('login_identifier_taken');
      throw err;
    }
  };

  return {
    list: (ctx: AuthContext, q: EmployeeListQuery): Promise<Paginated<EmployeeSummary>> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const { items, total } = await repo.list(tx, ctx.workspaceId, q);
        return { items: items.map(toEmployeeSummary), total, page: q.page, pageSize: q.pageSize };
      }),

    get: (ctx: AuthContext, id: string) => db.tenant(ctx.workspaceId, (tx) => loadDetail(tx, ctx, id)),

    /** The signed-in user's own employee record; people may always see their own identifiers. */
    getOwn: (ctx: AuthContext) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        if (!ctx.employeeId) throw notFound('no_employee_profile');
        const e = await repo.findDetail(tx, ctx.workspaceId, ctx.employeeId);
        if (!e) throw notFound('no_employee_profile');
        return toEmployeeDetail(e, cipher, true);
      }),

    create: (ctx: AuthContext, input: CreateEmployeeData): Promise<CreateEmployeeResponse> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        await assertRefs(tx, ws, input);
        if ((await repo.countActive(tx, ws)) >= (await repo.seatLimit(tx, ws))) {
          throw new AppError(402, 'seat_limit_reached');
        }
        const { login, socialSecurityNo, familyBookNo, dateOfBirth, hireDate, ...rest } = input;
        let employee;
        try {
          employee = await repo.create(tx, {
            ...rest,
            workspaceId: ws,
            hireDate: parseIsoDate(hireDate),
            dateOfBirth: optionalDate(dateOfBirth),
            socialSecurityNoEnc: encryptOptional(socialSecurityNo),
            familyBookNoEnc: encryptOptional(familyBookNo),
          });
        } catch (err) {
          if (isUniqueViolation(err)) throw conflict('employee_code_taken');
          throw err;
        }
        await repo.createHistory(tx, {
          workspaceId: ws,
          employeeId: employee.id,
          changeType: 'HIRED',
          toValue: { status: employee.status, departmentId: employee.departmentId, positionId: employee.positionId },
          effectiveDate: employee.hireDate,
          createdById: ctx.userId,
        });
        await auditRepository.create(tx, { workspaceId: ws, actorUserId: ctx.userId, action: 'employee.created', entity: 'Employee', entityId: employee.id });
        const credential = login ? await issueCredential(tx, ctx, employee, login.method, login.roleCode) : null;
        return { employee: await loadDetail(tx, ctx, employee.id), credential };
      }),

    update: (ctx: AuthContext, id: string, input: UpdateData): Promise<EmployeeDetail> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        const before = await repo.findById(tx, ws, id);
        if (!before) throw notFound();
        await assertRefs(tx, ws, input);
        await assertNoManagerCycle(tx, ws, id, input.managerId);
        const { socialSecurityNo, familyBookNo, dateOfBirth, hireDate, ...rest } = input;
        const data: Prisma.EmployeeUncheckedUpdateInput = {
          ...rest,
          ...(hireDate ? { hireDate: parseIsoDate(hireDate) } : {}),
          ...(dateOfBirth ? { dateOfBirth: parseIsoDate(dateOfBirth) } : {}),
          ...(socialSecurityNo !== undefined ? { socialSecurityNoEnc: encryptOptional(socialSecurityNo) } : {}),
          ...(familyBookNo !== undefined ? { familyBookNoEnc: encryptOptional(familyBookNo) } : {}),
        };
        try {
          await repo.update(tx, id, data);
        } catch (err) {
          if (isUniqueViolation(err)) throw conflict('employee_code_taken');
          throw err;
        }
        const changed = TRACKED_FIELDS.filter((f) => input[f] !== undefined && input[f] !== before[f]);
        if (changed.length) {
          await repo.createHistory(tx, {
            workspaceId: ws,
            employeeId: id,
            changeType: 'UPDATED',
            fromValue: Object.fromEntries(changed.map((f) => [f, before[f]])),
            toValue: Object.fromEntries(changed.map((f) => [f, input[f]])),
            effectiveDate: new Date(new Date().toISOString().slice(0, 10)),
            createdById: ctx.userId,
          });
        }
        await auditRepository.create(tx, {
          workspaceId: ws,
          actorUserId: ctx.userId,
          action: 'employee.updated',
          entity: 'Employee',
          entityId: id,
          // Never log sensitive values — only which fields changed.
          meta: { fields: Object.keys(input) },
        });
        return loadDetail(tx, ctx, id);
      }),

    addDocument: (ctx: AuthContext, employeeId: string, input: DocumentData) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        if (!(await repo.findById(tx, ctx.workspaceId, employeeId))) throw notFound();
        await repo.createDocument(tx, {
          workspaceId: ctx.workspaceId,
          employeeId,
          type: input.type,
          number: input.number,
          issuedAt: optionalDate(input.issuedAt),
          expiresAt: optionalDate(input.expiresAt),
          note: input.note,
        });
        await auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: 'employee.document_added', entity: 'Employee', entityId: employeeId, meta: { type: input.type } });
        return loadDetail(tx, ctx, employeeId);
      }),

    removeDocument: (ctx: AuthContext, employeeId: string, documentId: string) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const { count } = await repo.deleteDocument(tx, ctx.workspaceId, employeeId, documentId);
        if (!count) throw notFound();
        await auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: 'employee.document_removed', entity: 'Employee', entityId: employeeId });
        return loadDetail(tx, ctx, employeeId);
      }),

    addContact: (ctx: AuthContext, employeeId: string, input: ContactData) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        if (!(await repo.findById(tx, ctx.workspaceId, employeeId))) throw notFound();
        await repo.createContact(tx, { workspaceId: ctx.workspaceId, employeeId, ...input });
        return loadDetail(tx, ctx, employeeId);
      }),

    removeContact: (ctx: AuthContext, employeeId: string, contactId: string) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const { count } = await repo.deleteContact(tx, ctx.workspaceId, employeeId, contactId);
        if (!count) throw notFound();
        return loadDetail(tx, ctx, employeeId);
      }),

    /** HR creates a login or resets the PIN/password (staff without email rely on this). */
    issueCredential: (ctx: AuthContext, employeeId: string, method: 'PASSWORD' | 'PIN', roleCode = 'EMPLOYEE') =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const employee = await repo.findById(tx, ctx.workspaceId, employeeId);
        if (!employee) throw notFound();
        return issueCredential(tx, ctx, employee, method, roleCode);
      }),
  };
};
export type EmployeesService = ReturnType<typeof createEmployeesService>;
