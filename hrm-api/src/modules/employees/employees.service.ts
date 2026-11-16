import {
  employmentDateIssues,
  PERMISSIONS,
  type CreateDocumentData as DocumentData,
  type CreateEmergencyContactData as ContactData,
  type UpdateEmergencyContactData as ContactUpdate,
  type CreateEmployeeData,
  type UpdateEmployeeData as UpdateData,
  type CreateEmployeeResponse,
  type CredentialIssued,
  type EmployeeDetail,
  type EmployeeListQuery,
  type EmployeeSummary,
  type EmploymentHistoryEntry,
  type EmploymentHistoryQuery,
  type ExpiringDocument,
  type ExpiringDocumentsQuery,
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
import { toEmployeeDetail, toEmployeeSummary, toExpiringDocument, type ExpiryContext } from './employees.mapper';
import { employeesRepository as repo, isActiveStatus } from './employees.repository';

/** Fields whose change is recorded in EmploymentHistory (FR-EMP-08). */
const TRACKED_FIELDS = ['status', 'departmentId', 'positionId', 'branchId', 'managerId', 'contractType', 'payType'] as const;
/** History fields holding ids that the history endpoint resolves to display names. */
const REF_FIELDS = ['branchId', 'departmentId', 'positionId', 'managerId'] as const;

/** Optional `@db.Date` columns (ISO strings in the API). */
const OPTIONAL_DATE_FIELDS = ['dateOfBirth', 'ssnRegisteredAt', 'contractEndDate', 'probationEndDate'] as const;
type OptionalDates = Partial<Record<(typeof OPTIONAL_DATE_FIELDS)[number], string | null>>;
/** `undefined` = leave unchanged, `null`/"" = clear. */
const dateColumns = (input: OptionalDates) =>
  Object.fromEntries(
    OPTIONAL_DATE_FIELDS.filter((k) => input[k] !== undefined).map((k) => {
      const v = input[k];
      return [k, v ? parseIsoDate(v) : null];
    }),
  );

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

/** Stable, translated 409 codes for the Employee unique keys (FR-EMP-10.1–10.3). */
const UNIQUE_KEY_CODES = {
  employeeCode: 'employee_code_taken',
  idCardNoHash: 'duplicate_national_id',
  socialSecurityNoHash: 'duplicate_social_security_no',
} as const satisfies Record<keyof UniqueKeys, string>;
const UNIQUE_KEYS = Object.keys(UNIQUE_KEY_CODES) as (keyof UniqueKeys)[];

/** Checked up front so the caller gets the specific code before any write. */
const assertUnique = async (tx: Tx, workspaceId: string, excludeId: string | null, keys: UniqueKeys) => {
  const taken = await repo.findUniqueConflicts(tx, workspaceId, excludeId, keys);
  const key = UNIQUE_KEYS.find((k) => taken.includes(k));
  if (key) throw conflict(UNIQUE_KEY_CODES[key]);
};

/**
 * Run an Employee insert/update guarded by `assertUnique`. A concurrent write that slipped past the
 * check still hits the unique index (P2002), but Prisma does not say which index failed ("not
 * available"), so roll back to a savepoint and re-check: the winning row is now committed and
 * visible, and the caller gets the same specific code (FR-EMP-10.2/10.3).
 */
const writeUnique = async <T>(tx: Tx, workspaceId: string, excludeId: string | null, keys: UniqueKeys, write: () => Promise<T>): Promise<T> => {
  await tx.$executeRaw`SAVEPOINT employee_unique`;
  try {
    const result = await write();
    await tx.$executeRaw`RELEASE SAVEPOINT employee_unique`;
    return result;
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    await tx.$executeRaw`ROLLBACK TO SAVEPOINT employee_unique`;
    await assertUnique(tx, workspaceId, excludeId, keys);
    throw conflict();
  }
};

const asRecord = (v: Prisma.JsonValue | null) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
/** Ids of branches/departments/positions/managers mentioned in a history entry. */
const historyRefIds = (h: { fromValue: Prisma.JsonValue | null; toValue: Prisma.JsonValue | null }): string[] =>
  [asRecord(h.fromValue), asRecord(h.toValue)].flatMap((v) => REF_FIELDS.map((f) => v?.[f]).filter((id): id is string => typeof id === 'string'));

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

  /**
   * Employees cannot be moved *to* a closed org unit (`org_unit_closed`). Keeping an existing
   * assignment to a unit that was closed later is allowed, so only changed references are checked.
   */
  const assertOpenOrgUnits = async (
    tx: Tx,
    ws: string,
    refs: { branchId?: string | null; departmentId?: string | null; positionId?: string | null },
    before?: { branchId: string | null; departmentId: string | null; positionId: string | null },
  ) => {
    const changed = (k: keyof typeof refs) => (refs[k] && refs[k] !== before?.[k] ? refs[k] : undefined);
    const closed = await repo.closedOrgUnits(tx, ws, { branchId: changed('branchId'), departmentId: changed('departmentId'), positionId: changed('positionId') });
    if (closed.length) throw badRequest('org_unit_closed', { fields: closed });
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

  /** One create path for the API and (per row) for bulk import (FR-EMP-09): validate with createEmployeeSchema first. */
  const createEmployee = async (tx: Tx, ctx: AuthContext, input: CreateEmployeeData): Promise<CreateEmployeeResponse> => {
    const ws = ctx.workspaceId;
    await assertRefs(tx, ws, input);
    await assertOpenOrgUnits(tx, ws, input);
    if (isActiveStatus(input.status)) await assertSeatAvailable(tx, ws);
    const { login, idCardNo, socialSecurityNo, familyBookNo, dateOfBirth, ssnRegisteredAt, contractEndDate, probationEndDate, hireDate, ...rest } =
      input;
    const pii = piiColumns({ idCardNo: idCardNo ?? null, socialSecurityNo: socialSecurityNo ?? null, familyBookNo: familyBookNo ?? null });
    const keys = { employeeCode: input.employeeCode, ...pii };
    await assertUnique(tx, ws, null, keys);
    const employee = await writeUnique(tx, ws, null, keys, () =>
      repo.create(tx, {
        ...rest,
        workspaceId: ws,
        hireDate: parseIsoDate(hireDate),
        ...dateColumns({ dateOfBirth, ssnRegisteredAt, contractEndDate, probationEndDate }),
        ...pii,
      }),
    );
    await repo.createHistory(tx, {
      workspaceId: ws,
      employeeId: employee.id,
      changeType: 'HIRED',
      toValue: Object.fromEntries(TRACKED_FIELDS.map((f) => [f, employee[f]])),
      effectiveDate: employee.hireDate,
      createdById: ctx.userId,
    });
    await auditRepository.create(tx, { workspaceId: ws, actorUserId: ctx.userId, action: 'employee.created', entity: 'Employee', entityId: employee.id });
    const credential = login ? await issueCredential(tx, ctx, employee, login.method, login.roleCode) : null;
    return { employee: await loadDetail(tx, ctx, employee.id), credential };
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
        const refs = await repo.refNames(tx, ctx.workspaceId, [...new Set(items.flatMap(historyRefIds))]);
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
            labels: Object.fromEntries(historyRefIds(h).filter((id) => refs.has(id)).map((id) => [id, refs.get(id)!])),
          })),
          total,
          page: q.page,
          pageSize: q.pageSize,
        };
      }),

    create: (ctx: AuthContext, input: CreateEmployeeData): Promise<CreateEmployeeResponse> =>
      db.tenant(ctx.workspaceId, (tx) => createEmployee(tx, ctx, input)),

    /** Same as `create`, inside the caller's transaction (e.g. a bulk import committing all rows at once). */
    createInTx: createEmployee,

    update: (ctx: AuthContext, id: string, input: UpdateData): Promise<EmployeeDetail> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const ws = ctx.workspaceId;
        const before = await findInScope(tx, ctx, id);
        await assertRefs(tx, ws, input);
        await assertOpenOrgUnits(tx, ws, input, before);
        await assertNoManagerCycle(tx, ws, id, input.managerId);
        const nationalityType = input.nationalityType ?? before.nationalityType;
        const nationality = input.nationality !== undefined ? input.nationality : before.nationality;
        if (nationalityType === 'FOREIGN' && !nationality) throw badRequest('nationality_required');

        const status = input.status ?? before.status;
        const reactivating = !isActiveStatus(before.status) && isActiveStatus(status);
        if (reactivating) await assertSeatAvailable(tx, ws);

        const { idCardNo, socialSecurityNo, familyBookNo, dateOfBirth, ssnRegisteredAt, contractEndDate, probationEndDate, hireDate, effectiveDate, ...rest } =
          input;
        // Cross-field rules on the stored values merged with the patch (FR-EMP-03.5).
        const dateIssues = employmentDateIssues({
          hireDate: hireDate ?? toIsoDate(before.hireDate),
          contractEndDate: contractEndDate !== undefined ? contractEndDate : toIsoDate(before.contractEndDate),
          probationEndDate: probationEndDate !== undefined ? probationEndDate : toIsoDate(before.probationEndDate),
        });
        if (dateIssues.length) throw badRequest('before_hire_date', { fields: dateIssues.map((i) => i.field) });
        const pii = piiColumns({ idCardNo, socialSecurityNo, familyBookNo });
        const keys = { employeeCode: input.employeeCode, ...pii };
        await assertUnique(tx, ws, id, keys);
        const data: Prisma.EmployeeUncheckedUpdateInput = {
          ...rest,
          ...(hireDate ? { hireDate: parseIsoDate(hireDate) } : {}),
          ...dateColumns({ dateOfBirth, ssnRegisteredAt, contractEndDate, probationEndDate }),
          ...pii,
        };
        await writeUnique(tx, ws, id, keys, () => repo.update(tx, id, data));
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
        const contact = await repo.createContact(tx, { workspaceId: ctx.workspaceId, employeeId, ...input });
        await auditRepository.create(tx, {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: 'employee.contact_added',
          entity: 'Employee',
          entityId: employeeId,
          meta: { contactId: contact.id },
        });
        return loadDetail(tx, ctx, employeeId);
      }),

    /** FR-EMP-01.5: edit an emergency contact; audited with the changed field names (no values). */
    updateContact: (ctx: AuthContext, employeeId: string, contactId: string, input: ContactUpdate) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await findInScope(tx, ctx, employeeId);
        const { count } = await repo.updateContact(tx, ctx.workspaceId, employeeId, contactId, input);
        if (!count) throw notFound();
        await auditRepository.create(tx, {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: 'employee.contact_updated',
          entity: 'Employee',
          entityId: employeeId,
          meta: { contactId, fields: Object.keys(input).filter((k) => input[k as keyof ContactUpdate] !== undefined) },
        });
        return loadDetail(tx, ctx, employeeId);
      }),

    removeContact: (ctx: AuthContext, employeeId: string, contactId: string) =>
      db.tenant(ctx.workspaceId, async (tx) => {
        await findInScope(tx, ctx, employeeId);
        const { count } = await repo.deleteContact(tx, ctx.workspaceId, employeeId, contactId);
        if (!count) throw notFound();
        await auditRepository.create(tx, {
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.userId,
          action: 'employee.contact_removed',
          entity: 'Employee',
          entityId: employeeId,
          meta: { contactId },
        });
        return loadDetail(tx, ctx, employeeId);
      }),

    /**
     * Expiring-documents overview (FR-EMP-06): expired documents plus those inside the largest
     * `document.expiryAlertDays` threshold, limited to the caller's data scope (B8).
     */
    expiringDocuments: (ctx: AuthContext, q: ExpiringDocumentsQuery): Promise<Paginated<ExpiringDocument>> =>
      db.tenant(ctx.workspaceId, async (tx) => {
        const scope = await employeeAccess.scope(tx, ctx);
        const expiry = await expiryContext(tx, ctx.workspaceId);
        const day = parseIsoDate(expiry.today);
        const horizon = new Date(day.getTime() + Math.max(...expiry.alertDays) * 86_400_000);
        const { items, total } = await repo.listExpiringDocuments(tx, ctx.workspaceId, q, { today: day, horizon }, scope);
        return { items: items.map((d) => toExpiringDocument(d, expiry)), total, page: q.page, pageSize: q.pageSize };
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
