import {
  ALL_PERMISSIONS,
  DEFAULT_LEAVE_TYPES,
  DEFAULT_ROLE_PERMISSIONS,
  hoursToMinutes,
  isoDateInTimeZone,
  PARAMETERS,
  patternFromWorkingDays,
  SystemRole,
  WORK_WEEK,
} from '@hrm/shared';
import { parseIsoDate } from '../lib/dates';
import { hashSecret } from '../lib/password';
import { ensureHolidayYear } from '../modules/holidays/holidays.repository';
import type { Tx } from './client';

const ROLE_NAMES: Record<SystemRole, string> = {
  OWNER: 'ເຈົ້າຂອງ / Owner',
  HR_ADMIN: 'HR Admin',
  MANAGER: 'ຫົວໜ້າ / Manager',
  EMPLOYEE: 'ພະນັກງານ / Employee',
};

/** Idempotently upsert the global permission catalogue. Must run inside `db.system`. */
export const ensurePermissions = async (tx: Tx) => {
  for (const key of ALL_PERMISSIONS) {
    await tx.permission.upsert({ where: { key }, update: {}, create: { key } });
  }
  return tx.permission.findMany();
};

export interface BootstrapWorkspaceInput {
  code: string;
  name: string;
  /** The first owner signs in with email or (Lao) phone + password; at least one is required. */
  owner: { email?: string | null; phone?: string | null; password: string; displayName: string };
  seatLimit?: number;
  /** IANA time zone; defaults to the schema default (Asia/Vientiane). */
  timezone?: string;
  holidayYear?: number;
}

/**
 * Create a workspace with built-in roles, Lao-law leave types, a default
 * 6-day work schedule and fixed public holidays. Must run inside `db.system`.
 */
export const bootstrapWorkspace = async (tx: Tx, input: BootstrapWorkspaceInput) => {
  if (!input.owner.email && !input.owner.phone) throw new Error('Workspace owner needs an email or a phone number');
  const permissions = await ensurePermissions(tx);
  const permId = new Map(permissions.map((p) => [p.key, p.id]));

  const ws = await tx.workspace.create({
    data: {
      code: input.code,
      name: input.name,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      subscription: { create: { seatLimit: input.seatLimit ?? 50 } },
    },
  });

  const roles: Record<string, string> = {};
  for (const code of Object.values(SystemRole)) {
    const role = await tx.role.create({
      data: {
        workspaceId: ws.id,
        code,
        name: ROLE_NAMES[code],
        isSystem: true,
        permissions: {
          create: DEFAULT_ROLE_PERMISSIONS[code].map((key) => ({ workspaceId: ws.id, permissionId: permId.get(key)! })),
        },
      },
    });
    roles[code] = role.id;
  }

  const owner = await tx.user.create({
    data: {
      workspaceId: ws.id,
      email: input.owner.email?.toLowerCase() ?? null,
      phone: input.owner.phone ?? null,
      displayName: input.owner.displayName,
      passwordHash: await hashSecret(input.owner.password),
      roles: { create: { workspaceId: ws.id, roleId: roles.OWNER! } },
    },
  });

  for (const t of DEFAULT_LEAVE_TYPES) {
    await tx.leaveType.create({
      data: {
        workspaceId: ws.id,
        code: t.code,
        category: t.category,
        nameLo: t.nameLo,
        nameEn: t.nameEn,
        paid: t.paid,
        requiresAttachment: t.requiresAttachment,
        allowHalfDay: t.allowHalfDay,
        gender: t.gender ?? null,
        policy: {
          create: {
            workspaceId: ws.id,
            daysPerYear: t.daysPerYear,
            hazardousDays: t.code === 'ANNUAL' ? 18 : null,
            minServiceDays: t.minServiceDays,
          },
        },
      },
    });
  }

  const shift = await tx.shift.create({
    data: { workspaceId: ws.id, name: 'ກະປົກກະຕິ 08:00–17:00', startTime: '08:00', endTime: '17:00', breakMinutes: 60 },
  });
  // First version of the standard schedule (FR-WS-03.1): Mon–Sat at the default standard day length
  // (a new workspace has no parameter rows yet), in force from today in the workspace time zone.
  const standardDay = PARAMETERS['schedule.standardHoursPerDay'].defaultValue;
  await tx.workSchedule.create({
    data: {
      workspaceId: ws.id,
      name: '6 ມື້/ອາທິດ',
      dayMinutes: hoursToMinutes(patternFromWorkingDays(WORK_WEEK.workingDays, standardDay)),
      shiftId: shift.id,
      isDefault: true,
      effectiveFrom: parseIsoDate(isoDateInTimeZone(ws.timezone)),
    },
  });

  // Statutory holidays for the first year; later years come from the yearly `holiday-defaults` job.
  await ensureHolidayYear(tx, ws.id, input.holidayYear ?? new Date().getUTCFullYear());

  return { workspace: ws, owner, roles };
};
