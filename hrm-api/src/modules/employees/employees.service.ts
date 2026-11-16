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
  type EmploymentHistoryEntry,
  type EmploymentHistoryQuery,
  type Paginated,
} from '@hrm/shared';
import type { EmploymentStatus, Prisma } from '@prisma/client';
import { isUniqueViolation, type Db, type Tx } from '../../db/client';
import { generatePin, generateTempPassword, type FieldCipher } from '../../lib/crypto';
import { DEFAULT_TIME_ZONE, optionalDate, parseIsoDate, todayInTimeZone, toIsoDate } from '../../lib/dates';
import { AppError, badRequest, conflict, notFound } from '../../lib/errors';
import { hashSecret } from '../../lib/password';
import type { FileStorage } from '../../lib/storage';
import type { AuthContext } from '../auth/auth.service';
import { auditRepository } from '../audit/audit.repository';
import { parameterReader } from '../parameters/parameters.service';
import { toEmployeeDetail, toEmployeeSummary, type ExpiryContext } from './employees.mapper';
import { employeesRepository as repo, isActiveStatus } from './employees.repository';

/** Fields whose change is recorded in EmploymentHistory. */
const TRACKED_FIELDS = ['status', 'departmentId', 'positionId', 'branchId', 'managerId', 'employmentType'] as const;

type Access = Pick<AuthContext, 'workspaceId' | 'employeeId' | 'permissions'>;

/**
 * Employee data scope (B8), reusable by other modules (e.g. file downloads).
 * - `employee.read_all`: the whole workspace.
 * - `employee.read` only (e.g. MANAGER): themselves plus direct and indirect reports.
 * - otherwise: only their own record.
 * Out-of-scope ids must be answered with 404 so their existence is not revealed.
 */
export const employeeAccess = {
  /** Employee ids the caller may see, or `null` for the whole workspace. */
  async scope(tx: Tx, auth: Access): Promise<string[] | null> {
    if (auth.permissions.includes(PERMISSIONS.EMPLOYEE_READ_ALL)) return null;
    if (!auth.employeeId) return [];
    if (!auth.permissions.includes(PERMISSIONS.EMPLOYEE_READ)) return [auth.employeeId];
    return repo.reportingTreeIds(tx, auth.workspaceId, auth.employeeId);
  },

  async canRead(tx: Tx, auth: Access, employeeId: string): Promise<boolean> {
    const ids = await employeeAccess.scope(tx, auth);
    if (ids) return ids.includes(employeeId);
    return !!(await repo.findById(tx, auth.workspaceId, employeeId));
  },

  /** Throws 404 when the employee is outside the caller's scope (or does not exist). */
  async assertCanRead(tx: Tx, auth: Access, employeeId: string): Promise<void> {
    if (!(await employeeAccess.canRead(tx, auth, employeeId))) throw notFound();
  },
};

type UniqueKeys = { employeeCode?: string; idCardNoHash?: string | null; socialSecurityNoHash?: string | null };

/**
 * Stable 409 codes for Employee unique keys (FR-EMP-10.2/10.3). Checked up front because Postgres
 * does not report which index failed through Prisma; a concurrent insert that slips past the check
 * still hits the unique index and becomes a generic `conflict`.
 */
const assertUnique = async (tx: Tx, workspaceId: string, excludeId: string | null, keys: UniqueKeys) => {
  const taken = await repo.findUniqueConflicts(tx, workspaceId, excludeId, keys);
  if (taken.includes('employeeCode')) throw conflict('employee_code_taken');
  if (taken.includes('idCardNoHash')) throw conflict('duplicate_national_id');
  if (taken.includes('socialSecurityNoHash')) throw conflict('duplicate_social_security_no');
};

export interface EmployeesServiceDeps {
  /** Used to remove a deleted document's file bytes; optional so tests/tools can omit it. */
  storage?: Pick<FileStorage, 'delete'>;
}

export const createEmployeesService = (db: Db, cipher: FieldCipher, deps: EmployeesServiceDeps = {}) => {
  const canSeeSensitive = (ctx: AuthContext) => ctx.permissions.includes(PERMISSIONS.EMPLOYEE_SENSITIVE_READ);

  const assertRefs = async (tx: Tx, ws: string, refs: Parameters<typeof repo.refsExist>[2]) => {
    const missing = await repo.refsExist(tx, ws, refs);
    if (missing.length) throw badRequest('invalid_reference', { fields: missing });
  };

  const assertNoManagerCycle = async (tx: Tx, ws: string, employeeId: string, managerId: string | undefined | null) => {
    if (!managerId) return;
    if (managerId === employeeId || (await repo.isInManagerChain(tx, ws, managerId, employeeId))) throw badRequest('manager_cycle');
  };

  /** Seat limit (B7): serialised per workspace so concurrent creates/reactivations cannot overshoot. */
  const assertSeatAvailable = async (tx: Tx, ws: string) => {
    await repo.lockSeats(tx, ws);
    if ((await repo.countActive(tx, ws)) >= (await repo.seatLimit(tx, ws))) throw new AppError(402, 'seat_limit_reached');
  };

  const today = async (tx: Tx, ws: string) => todayInTimeZone((await repo.workspaceTimeZone(tx, ws)) ?? DEFAULT_TIME_ZONE);

  const expiryContext = async (tx: Tx, ws: string): Promise<ExpiryContext> => {
    const day = await today(tx, ws);
    const alertDays = await parameterReader.workspace(tx, ws, 'document.expiryAlertDays', parseIsoDate(day));
    return { today: day, alertDays };
  };

  const loadDetail = async (tx: Tx, ctx: AuthContext, id: string, sensitive = canSeeSensitive(ctx)): Promise<EmployeeDetail> => {
    const e = await repo.findDetail(tx, ctx.workspaceId, id);
    if (!e) throw notFound();
    return toEmployeeDetail(e, cipher, sensitive, await expiryContext(tx, ctx.workspaceId));
  };

  /** Load an employee the caller is allowed to see; 404 otherwise. */
  const findInScope = async (tx: Tx, ctx: AuthContext, id: string) => {
    await employeeAccess.assertCanRead(tx, ctx, id);
    const e = await repo.findById(tx, ctx.workspaceId, id);
    if (!e) throw notFound();
    return e;
  };

  /** Encrypted columns + blind indexes. `undefined` = leave unchanged, `null` = clear. */
  const piiColumns = (input: { idCardNo?: string | null; socialSecurityNo?: string | null; familyBookNo?: string | null }) => {
    const enc = (v: string | null) => (v ? cipher.encrypt(v) : null);
    return {
      ...(input.idCardNo !== undefined
        ? { idCardNo: null, idCardNoEnc: enc(input.idCardNo), idCardNoHash: cipher.blindIndex('national_id', input.idCardNo) }
        : {}),
      ...(input.socialSecurityNo !== undefined
        ? {
            socialSecurityNoEnc: enc(input.socialSecurityNo),
            socialSecurityNoHash: cipher.blindIndex('social_security_no', input.socialSecurityNo),
          }
        : {}),
      ...(input.familyBookNo !== undefined ? { familyBookNoEnc: enc(input.familyBookNo) } : {}),
    };
  };

  /**
   * FR-AUTH-06: leaving the company disables the login and ends every session, in the same transaction.
   * Reactivating the employee later deliberately does NOT re-enable the login: HR must issue new
   * credentials (POST /employees/:id/credentials), which re-activates the user.
   */
  const deactivateLogin = async (tx: Tx, ctx: AuthContext, employeeId: string, status: EmploymentStatus) => {
    const user = await repo.findUserByEmployee(tx, employeeId);
    if (!user || !user.isActive) return;
    await repo.updateUser(tx, user.id, { isActive: false });
    const { count } = await repo.revokeRefreshTokens(tx, user.id);
    await auditRepository.create(tx, {
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
      action: 'user.deactivated',
      entity: 'User',
      entityId: user.id,
      meta: { reason: 'employee_status', status, revokedSessions: count },
    });
  };

  /** Create (or replace) credentials for an employee's user. Returns the one-time secret. */
  const issueCredential = async (
    tx: Tx,
    ctx: AuthContext,
    employee: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; status: EmploymentStatus },
    method: 'PASSWORD' | 'PIN',
    roleCode: string,
  ): Promise<CredentialIssued> => {
    // FR-AUTH-01.1–01.3: no email needed — staff sign in with their employee code or phone.
    if (!isActiveStatus(employee.status)) throw badRequest('employee_inactive');
    const secret = method === 'PIN' ? generatePin() : generateTempPassword();
    const hash = await hashSecret(secret);
    const existing = await repo.findUserByEmployee(tx, employee.id);
    if (existing) {
      await repo.updateUser(tx, existing.id, {
        ...(method === 'PIN' ? { pinHash: hash } : { passwordHash: hash }),
        mustChangeCredential: true,
        failedAttempts: 0,
        lockedUntil: null,
        isActive: true,
      });
      await repo.revokeRefreshTokens(tx, existing.id);
      await auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: 'user.credential_reset', entity: 'User', entityId: existing.id, meta: { method, reactivated: !existing.isActive } });
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
        const scope = await employeeAccess.scope(tx, ctx);
        const { items, total } = await repo.list(tx, ctx.workspaceId, q, scope);
        return { items: items.map(toEmployeeSummary), total, page: q.page, pageSize: q.pageSize };
      }),

    get: (ctx: AuthContext, id: string) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await employeeAccess.assertCanRead(tx, ctx, id);
        return loadDetail(tx, ctx, id);
      }),

    /** The signed-in user's own employee record; people may always see their own identifiers. */
    getOwn: (ctx: AuthContext) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        if (!ctx.employeeId) throw notFound('no_employee_profile');
        if (!(await repo.findById(tx, ctx.workspaceId, ctx.employeeId))) throw notFound('no_employee_profile');
        return loadDetail(tx, ctx, ctx.employeeId, true);
      }),

    /** Employment history, newest first (FR-EMP-08.1–08.3). */
    history: (ctx: AuthContext, id: string, q: EmploymentHistoryQuery): Promise<Paginated<EmploymentHistoryEntry>> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await employeeAccess.assertCanRead(tx, ctx, id);
        const { items, total } = await repo.listHistory(tx, ctx.workspaceId, id, q.page, q.pageSize);
        const authorIds = [...new Set(items.map((h) => h.createdById).filter((v): v is string => !!v))];
        const names = new Map((await repo.userNames(tx, ctx.workspaceId, authorIds)).map((u) => [u.id, u.displayName]));
        const asRecord = (v: Prisma.JsonValue | null) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
        return {
          items: items.map((h) => ({
            id: h.id,
            changeType: h.changeType,
            fromValue: asRecord(h.fromValue),
            toValue: asRecord(h.toValue),
            effectiveDate: toIsoDate(h.effectiveDate)!,
            note: h.note,
            createdAt: h.createdAt.toISOString(),
            createdBy: h.createdById && names.has(h.createdById) ? { id: h.createdById, name: names.get(h.createdById)! } : null,
          })),
          total,
          page: q.page,
          pageSize: q.pageSize,
        };
      }),

    create: (ctx: AuthContext, input: CreateEmployeeData): Promise<CreateEmployeeResponse> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        await assertRefs(tx, ws, input);
        if (isActiveStatus(input.status)) await assertSeatAvailable(tx, ws);
        const { login, idCardNo, socialSecurityNo, familyBookNo, dateOfBirth, hireDate, ...rest } = input;
        const pii = piiColumns({ idCardNo: idCardNo ?? null, socialSecurityNo: socialSecurityNo ?? null, familyBookNo: familyBookNo ?? null });
        await assertUnique(tx, ws, null, { employeeCode: input.employeeCode, ...pii });
        let employee;
        try {
          employee = await repo.create(tx, {
            ...rest,
            workspaceId: ws,
            hireDate: parseIsoDate(hireDate),
            dateOfBirth: optionalDate(dateOfBirth),
            ...pii,
          });
        } catch (err) {
          if (isUniqueViolation(err)) throw conflict();
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
        const before = await findInScope(tx, ctx, id);
        await assertRefs(tx, ws, input);
        await assertNoManagerCycle(tx, ws, id, input.managerId);
        const nationalityType = input.nationalityType ?? before.nationalityType;
        const nationality = input.nationality !== undefined ? input.nationality : before.nationality;
        if (nationalityType === 'FOREIGN' && !nationality) throw badRequest('nationality_required');

        const status = input.status ?? before.status;
        const reactivating = !isActiveStatus(before.status) && isActiveStatus(status);
        if (reactivating) await assertSeatAvailable(tx, ws);

        const { idCardNo, socialSecurityNo, familyBookNo, dateOfBirth, hireDate, effectiveDate, ...rest } = input;
        const pii = piiColumns({ idCardNo, socialSecurityNo, familyBookNo });
        await assertUnique(tx, ws, id, { employeeCode: input.employeeCode, ...pii });
        const data: Prisma.EmployeeUncheckedUpdateInput = {
          ...rest,
          ...(hireDate ? { hireDate: parseIsoDate(hireDate) } : {}),
          ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? parseIsoDate(dateOfBirth) : null } : {}),
          ...pii,
        };
        try {
          await repo.update(tx, id, data);
        } catch (err) {
          if (isUniqueViolation(err)) throw conflict();
          throw err;
        }
        if (isActiveStatus(before.status) && !isActiveStatus(status)) await deactivateLogin(tx, ctx, id, status);

        const changed = TRACKED_FIELDS.filter((f) => input[f] !== undefined && input[f] !== before[f]);
        if (changed.length) {
          await repo.createHistory(tx, {
            workspaceId: ws,
            employeeId: id,
            changeType: 'UPDATED',
            fromValue: Object.fromEntries(changed.map((f) => [f, before[f]])),
            toValue: Object.fromEntries(changed.map((f) => [f, input[f]])),
            // FR-EMP-08.4: HR may back/forward-date the change; otherwise "today" in the workspace timezone.
            effectiveDate: parseIsoDate(effectiveDate ?? (await today(tx, ws))),
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
        await findInScope(tx, ctx, employeeId);
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

    removeDocument: async (ctx: AuthContext, employeeId: string, documentId: string) => {
      const { detail, releasedKey } = await db.tenant(ctx.workspaceId, async (tx) => {
        await findInScope(tx, ctx, employeeId);
        const doc = await tx.employeeDocument.findFirst({
          where: { id: documentId, employeeId, workspaceId: ctx.workspaceId },
          select: { file: { select: { id: true, storageKey: true } } },
        });
        const { count } = await repo.deleteDocument(tx, ctx.workspaceId, employeeId, documentId);
        if (!count) throw notFound();
        // Drop the attached file's metadata row once no document references it any more.
        const released = doc?.file
          ? await tx.storedFile.deleteMany({ where: { id: doc.file.id, workspaceId: ctx.workspaceId, employeeDocuments: { none: {} } } })
          : { count: 0 };
        await auditRepository.create(tx, {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: 'employee.document_removed',
          entity: 'Employee',
          entityId: employeeId,
          meta: { documentId, fileId: doc?.file?.id ?? null },
        });
        return { detail: await loadDetail(tx, ctx, employeeId), releasedKey: released.count ? doc!.file!.storageKey : null };
      });
      // Bytes are removed only after the transaction committed; a failure leaves an orphan blob, never a dangling row.
      if (releasedKey && deps.storage) await deps.storage.delete(releasedKey).catch(() => undefined);
      return detail;
    },

    addContact: (ctx: AuthContext, employeeId: string, input: ContactData) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await findInScope(tx, ctx, employeeId);
        await repo.createContact(tx, { workspaceId: ctx.workspaceId, employeeId, ...input });
        await auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: 'employee.contact_added', entity: 'Employee', entityId: employeeId });
        return loadDetail(tx, ctx, employeeId);
      }),

    removeContact: (ctx: AuthContext, employeeId: string, contactId: string) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await findInScope(tx, ctx, employeeId);
        const { count } = await repo.deleteContact(tx, ctx.workspaceId, employeeId, contactId);
        if (!count) throw notFound();
        await auditRepository.create(tx, { workspaceId: ctx.workspaceId, actorUserId: ctx.userId, action: 'employee.contact_removed', entity: 'Employee', entityId: employeeId });
        return loadDetail(tx, ctx, employeeId);
      }),

    /** HR creates a login or resets the PIN/password (staff without email rely on this). */
    issueCredential: (ctx: AuthContext, employeeId: string, method: 'PASSWORD' | 'PIN', roleCode = 'EMPLOYEE') =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const employee = await findInScope(tx, ctx, employeeId);
        return issueCredential(tx, ctx, employee, method, roleCode);
      }),
  };
};
export type EmployeesService = ReturnType<typeof createEmployeesService>;
