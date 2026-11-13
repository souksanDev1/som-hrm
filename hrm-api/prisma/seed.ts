/**
 * Demo seed for local development and E2E tests.
 *
 * Demo credentials (development only — never use in production):
 *   Company code : som-demo
 *   HR owner     : admin@som.la / Admin1234
 *   Field worker : employee code E003 (or phone 02055550003) / PIN 482913
 */
import { loadEnv } from '../src/config/env';
import { bootstrapWorkspace } from '../src/db/bootstrap';
import { createDb } from '../src/db/client';
import { createFieldCipher } from '../src/lib/crypto';
import { hashSecret } from '../src/lib/password';

export const DEMO = {
  workspaceCode: 'som-demo',
  owner: { email: 'admin@som.la', password: 'Admin1234' },
  fieldWorker: { code: 'E003', phone: '02055550003', pin: '482913' },
} as const;

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const cipher = createFieldCipher(env.ENCRYPTION_KEY);
const daysFromNow = (n: number) => new Date(new Date().setUTCHours(0, 0, 0, 0) + n * 86_400_000);

const main = async () => {
  const seeded = await db.system(async (tx) => {
    if (await tx.workspace.findUnique({ where: { code: DEMO.workspaceCode } })) return false;

    const { workspace, owner, roles } = await bootstrapWorkspace(tx, {
      code: DEMO.workspaceCode,
      name: 'SOM Demo Co., Ltd.',
      owner: { ...DEMO.owner, displayName: 'HR Admin' },
    });
    const ws = workspace.id;

    const hq = await tx.branch.create({
      data: { workspaceId: ws, name: 'ສຳນັກງານໃຫຍ່ ວຽງຈັນ', address: 'ບ້ານ ໂພນທັນ, ເມືອງ ໄຊເສດຖາ', latitude: 17.9757, longitude: 102.6331, geofenceRadius: 150 },
    });
    const site = await tx.branch.create({
      data: { workspaceId: ws, name: 'ໜ້າງານ ປາກເຊ', address: 'ແຂວງ ຈຳປາສັກ', latitude: 15.1202, longitude: 105.7987, geofenceRadius: 300 },
    });
    const [hr, ops] = await Promise.all([
      tx.department.create({ data: { workspaceId: ws, name: 'ບຸກຄະລາກອນ (HR)' } }),
      tx.department.create({ data: { workspaceId: ws, name: 'ປະຕິບັດການ' } }),
    ]);
    const [director, supervisor, worker] = await Promise.all([
      tx.position.create({ data: { workspaceId: ws, name: 'ຜູ້ອຳນວຍການ', level: 10 } }),
      tx.position.create({ data: { workspaceId: ws, name: 'ຫົວໜ້າໜ້າງານ', level: 5 } }),
      tx.position.create({ data: { workspaceId: ws, name: 'ພະນັກງານໜ້າງານ', level: 1 } }),
    ]);

    const boss = await tx.employee.create({
      data: {
        workspaceId: ws, employeeCode: 'E001', firstName: 'ສົມສັກ', lastName: 'ພົມມະວົງ', gender: 'MALE',
        email: 'admin@som.la', phone: '02055550001', hireDate: new Date('2019-03-01'), employmentType: 'FULL_TIME',
        status: 'ACTIVE', branchId: hq.id, departmentId: hr.id, positionId: director.id,
        socialSecurityNoEnc: cipher.encrypt('SS1000001'), familyBookNoEnc: cipher.encrypt('VT-12345'),
      },
    });
    await tx.user.update({ where: { id: owner.id }, data: { employeeId: boss.id } });

    const lead = await tx.employee.create({
      data: {
        workspaceId: ws, employeeCode: 'E002', firstName: 'ບົວພັນ', lastName: 'ສີສຸວັນ', gender: 'FEMALE',
        phone: '02055550002', hireDate: new Date('2022-06-15'), employmentType: 'FULL_TIME', status: 'ACTIVE',
        branchId: site.id, departmentId: ops.id, positionId: supervisor.id, managerId: boss.id,
      },
    });
    const field = await tx.employee.create({
      data: {
        workspaceId: ws, employeeCode: DEMO.fieldWorker.code, firstName: 'ຄຳແພງ', lastName: 'ແກ້ວມະນີ', gender: 'MALE',
        phone: DEMO.fieldWorker.phone, hireDate: new Date('2025-01-10'), employmentType: 'DAILY', status: 'ACTIVE',
        hazardousWork: true, branchId: site.id, departmentId: ops.id, positionId: worker.id, managerId: lead.id,
        socialSecurityNoEnc: cipher.encrypt('SS1000003'),
      },
    });
    await tx.user.create({
      data: {
        workspaceId: ws, employeeId: field.id, displayName: 'ຄຳແພງ ແກ້ວມະນີ', phone: DEMO.fieldWorker.phone,
        pinHash: await hashSecret(DEMO.fieldWorker.pin), roles: { create: { workspaceId: ws, roleId: roles.EMPLOYEE! } },
      },
    });

    const foreign = await tx.employee.create({
      data: {
        workspaceId: ws, employeeCode: 'E004', firstName: 'Nguyen', lastName: 'Van An', gender: 'MALE',
        nationalityType: 'FOREIGN', nationality: 'Vietnam', phone: '02055550004', hireDate: new Date('2024-04-01'),
        employmentType: 'CONTRACT', status: 'ACTIVE', branchId: site.id, departmentId: ops.id, positionId: worker.id, managerId: lead.id,
      },
    });
    await tx.employeeDocument.createMany({
      data: [
        { workspaceId: ws, employeeId: foreign.id, type: 'WORK_PERMIT', number: 'WP-2024-0091', issuedAt: daysFromNow(-300), expiresAt: daysFromNow(25) },
        { workspaceId: ws, employeeId: foreign.id, type: 'VISA', number: 'LA-V-77812', issuedAt: daysFromNow(-300), expiresAt: daysFromNow(55) },
        { workspaceId: ws, employeeId: foreign.id, type: 'PASSPORT', number: 'C1234567', issuedAt: daysFromNow(-1000), expiresAt: daysFromNow(800) },
      ],
    });
    await tx.emergencyContact.create({ data: { workspaceId: ws, employeeId: field.id, name: 'ນາງ ແສງ', relationship: 'ພັນລະຍາ', phone: '02099990003' } });
    return true;
  });
  console.warn(seeded ? `Seeded workspace "${DEMO.workspaceCode}"` : `Workspace "${DEMO.workspaceCode}" already exists — run \`pnpm prisma migrate reset\` to reseed`);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.disconnect());
