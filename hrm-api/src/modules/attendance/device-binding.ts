import type { DeviceInfo } from '@hrm/shared';
import type { DeviceBinding } from '@prisma/client';
import type { Tx } from '../../db/client';
import { auditRepository } from '../audit/audit.repository';

export type DeviceBindingResult = { ok: true; binding: DeviceBinding; created: boolean } | { ok: false; binding: DeviceBinding };

export const activeDeviceBinding = (tx: Tx, workspaceId: string, userId: string) =>
  tx.deviceBinding.findFirst({ where: { workspaceId, userId, isActive: true }, orderBy: { createdAt: 'desc' } });

/**
 * One active attendance device per user (FR-ATT-11.1). The first mobile login or punch binds the phone; the
 * same phone is accepted afterwards; any other phone is refused (`ok: false`) until the binding is moved
 * (device change request / HR, FR-ATT-11.2–11.3). A phone whose earlier binding was revoked binds again once
 * the user has no active one. The user row is locked so two concurrent first punches cannot bind two phones.
 */
export const ensureDeviceBinding = async (
  tx: Tx,
  workspaceId: string,
  userId: string,
  device: DeviceInfo,
  meta: { ip?: string; now?: Date } = {},
): Promise<DeviceBindingResult> => {
  const now = meta.now ?? new Date();
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const active = await activeDeviceBinding(tx, workspaceId, userId);
  if (active) {
    if (active.deviceId !== device.deviceId) return { ok: false, binding: active };
    const binding = await tx.deviceBinding.update({ where: { id: active.id }, data: { lastSeenAt: now } });
    return { ok: true, binding, created: false };
  }
  const data = { platform: device.platform, model: device.model ?? null, isActive: true, lastSeenAt: now, revokedAt: null, revokedById: null };
  const binding = await tx.deviceBinding.upsert({
    where: { workspaceId_userId_deviceId: { workspaceId, userId, deviceId: device.deviceId } },
    create: { workspaceId, userId, deviceId: device.deviceId, ...data },
    update: data,
  });
  await auditRepository.create(tx, {
    workspaceId,
    actorUserId: userId,
    action: 'attendance.device_bound',
    entity: 'DeviceBinding',
    entityId: binding.id,
    meta: { deviceId: device.deviceId, platform: device.platform, model: device.model ?? null },
    ip: meta.ip,
  });
  return { ok: true, binding, created: true };
};
