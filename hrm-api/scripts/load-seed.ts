import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { bootstrapWorkspace } from '../src/db/bootstrap';
import { createDb } from '../src/db/client';
import { runPrisma } from './prisma-cli';

/**
 * Seeding helper for the check-in load test (NFR, client Q9). Only ever touches a database whose name ends in
 * `_load`: it wipes the `public` schema, applies the migrations and creates one workspace with a geofenced
 * MOBILE branch and N employees, each with a user (EMPLOYEE role) and an active device binding.
 */

export const LOAD_BRANCH = { latitude: 17.9757, longitude: 102.6331, geofenceRadius: 150 };
export const LOAD_PLATFORM = 'ANDROID' as const;
export const loadDeviceId = (i: number) => `load-device-${String(i).padStart(5, '0')}`;

export interface LoadFixture {
  workspaceId: string;
  /** Users in employee order; user i owns device `loadDeviceId(i)`. */
  userIds: string[];
}

export const assertLoadDatabase = (url: string) => {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_load')) throw new Error(`Refusing to use "${name}": the load test only runs against a *_load database`);
};

const CHUNK = 500;
const chunks = <T>(rows: T[]) => Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => rows.slice(i * CHUNK, (i + 1) * CHUNK));

export const seedLoadDatabase = async (url: string, employees: number): Promise<LoadFixture> => {
  assertLoadDatabase(url);
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  } finally {
    await prisma.$disconnect();
  }
  runPrisma(['migrate', 'deploy'], { ...process.env, DATABASE_URL: url });

  const db = createDb(url);
  try {
    return await db.system(async (tx) => {
      const { workspace, roles } = await bootstrapWorkspace(tx, {
        code: 'load',
        name: 'Load test',
        owner: { email: 'owner@load.test', password: 'Owner12345', displayName: 'Owner' },
        seatLimit: employees + 10,
      });
      const workspaceId = workspace.id;
      const branch = await tx.branch.create({ data: { workspaceId, name: 'Load HQ', ...LOAD_BRANCH, attendanceModes: ['MOBILE'] } });

      const rows = Array.from({ length: employees }, (_, i) => ({ i, employeeId: randomUUID(), userId: randomUUID() }));
      for (const part of chunks(rows)) {
        await tx.employee.createMany({
          data: part.map(({ i, employeeId }) => ({
            id: employeeId, workspaceId, employeeCode: `L${String(i).padStart(5, '0')}`, firstName: 'ໂຫຼດ', lastName: `${i}`, gender: 'MALE' as const,
            hireDate: new Date('2024-01-01'), contractType: 'INDEFINITE' as const, payType: 'MONTHLY' as const, status: 'ACTIVE' as const, branchId: branch.id,
          })),
        });
        await tx.user.createMany({
          data: part.map(({ i, employeeId, userId }) => ({ id: userId, workspaceId, employeeId, email: `e${i}@load.test`, displayName: `Load ${i}` })),
        });
        await tx.userRole.createMany({ data: part.map(({ userId }) => ({ workspaceId, userId, roleId: roles.EMPLOYEE! })) });
        await tx.deviceBinding.createMany({
          data: part.map(({ i, userId }) => ({ workspaceId, userId, deviceId: loadDeviceId(i), platform: LOAD_PLATFORM, isActive: true })),
        });
      }
      return { workspaceId, userIds: rows.map((r) => r.userId) };
    });
  } finally {
    await db.disconnect();
  }
};
