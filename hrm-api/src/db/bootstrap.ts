import {
  ALL_PERMISSIONS,
  DEFAULT_LEAVE_TYPES,
  DEFAULT_ROLE_PERMISSIONS,
  LAO_FIXED_HOLIDAYS,
  SystemRole,
  WORK_WEEK,
} from '@hrm/shared';
import { hashSecret } from '../lib/password';
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
  owner: { email: string; password: string; displayName: string };
  seatLimit?: number;
  holidayYear?: number;
}

/**
 * Create a workspace with built-in roles, Lao-law leave types, a default
 * 6-day work schedule and fixed public holidays. Must run inside `db.system`.
 */
export const bootstrapWorkspace = async (tx: Tx, input: BootstrapWorkspaceInput) => {
  const permissions = await ensurePermissions(tx);
  const permId = new Map(permissions.map((p) => [p.key, p.id]));

  const ws = await tx.workspace.create({
    data: { code: input.code, name: input.name, subscription: { create: { seatLimit: input.seatLimit ?? 50 } } },
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
      email: input.owner.email.toLowerCase(),
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
  await tx.workSchedule.create({
    data: { workspaceId: ws.id, name: '6 ມື້/ອາທິດ', workingDays: [...WORK_WEEK.workingDays], shiftId: shift.id, isDefault: true },
  });

  const year = input.holidayYear ?? new Date().getUTCFullYear();
  await tx.holiday.createMany({
    data: LAO_FIXED_HOLIDAYS.map((h) => ({
      workspaceId: ws.id,
      date: new Date(Date.UTC(year, h.month - 1, h.day)),
      nameLo: h.nameLo,
      nameEn: h.nameEn,
      womenOnly: !!h.womenOnly,
    })),
  });

  return { workspace: ws, owner, roles };
};
