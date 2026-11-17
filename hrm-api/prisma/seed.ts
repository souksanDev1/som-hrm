/**
 * Demo seed for local development and E2E tests.
 *
 * Demo credentials (development only — never use in production):
 *   Company code : som-demo
 *   HR owner     : admin@som.la / Admin1234
 *   Field worker : employee code E003 (or phone 02055550003) / PIN 482913
 *   Site manager : manager@som.la / Manager1234, or phone 02055550002 / PIN 731594 (E002, approves E003)
 *   SOM platform : superadmin@som.la / SomAdmin1234  (console at /platform/login)
 */
import { hoursToMinutes } from '@hrm/shared';
import { loadEnv } from '../src/config/env';
import { bootstrapWorkspace } from '../src/db/bootstrap';
import { createDb } from '../src/db/client';
import { createFieldCipher } from '../src/lib/crypto';
import { hashSecret } from '../src/lib/password';
import { submitApproval } from '../src/modules/approvals/approvals.service';
import { defaultApprovalRegistry } from '../src/modules/approvals/registry';
import { notify } from '../src/modules/notifications/notifications.service';

export const DEMO = {
  workspaceCode: 'som-demo',
  owner: { email: 'admin@som.la', password: 'Admin1234' },
  fieldWorker: { code: 'E003', phone: '02055550003', pin: '482913' },
  manager: { email: 'manager@som.la', password: 'Manager1234', phone: '02055550002', pin: '731594' },
  /**
   * Pending LEAVE requests of E003 waiting for E002 (approvals inbox demo, FR-ORG-02). Reasons are
   * unique so E2E projects each act on their own request: [0] stays for manual demos / Maestro,
   * [1..6] are taken two per Playwright project (desktop, tablet, mobile).
   */
  leaveReasons: ['Family event', 'Medical check-up', 'Moving house', 'Village festival', 'Bank errands', 'School meeting', 'Visa renewal'],
} as const;

/** SOM super admin for the platform console (development / E2E only; production uses `platform:create-admin`). */
export const PLATFORM_DEMO = { email: 'superadmin@som.la', password: 'SomAdmin1234', displayName: 'SOM Super Admin' } as const;

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
      data: { workspaceId: ws, name: 'ໜ້າງານ ປາກເຊ', address: 'ແຂວງ ຈຳປາສັກ', latitude: 15.1202, longitude: 105.7987, geofenceRadius: 300, attendanceModes: ['MOBILE', 'SCANNER'] },
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
        firstNameEn: 'Somsak', lastNameEn: 'Phommavong', village: 'ໂພນທັນ', district: 'ໄຊເສດຖາ', province: 'VT',
        email: 'admin@som.la', phone: '02055550001', hireDate: new Date('2019-03-01'), contractType: 'INDEFINITE', payType: 'MONTHLY',
        status: 'ACTIVE', branchId: hq.id, departmentId: hr.id, positionId: director.id,
        socialSecurityNoEnc: cipher.encrypt('SS1000001'), socialSecurityNoHash: cipher.blindIndex('social_security_no', 'SS1000001'),
        idCardNoEnc: cipher.encrypt('01-0012345'), idCardNoHash: cipher.blindIndex('national_id', '01-0012345'),
        familyBookNoEnc: cipher.encrypt('VT-12345'), familyBookHolder: 'ສົມສັກ ພົມມະວົງ', ssnRegisteredAt: new Date('2019-04-01'),
      },
    });
    await tx.user.update({ where: { id: owner.id }, data: { employeeId: boss.id } });

    const lead = await tx.employee.create({
      data: {
        workspaceId: ws, employeeCode: 'E002', firstName: 'ບົວພັນ', lastName: 'ສີສຸວັນ', gender: 'FEMALE',
        firstNameEn: 'Bouaphan', lastNameEn: 'Sisouvanh',
        phone: '02055550002', hireDate: new Date('2022-06-15'), contractType: 'INDEFINITE', payType: 'MONTHLY', status: 'ACTIVE',
        branchId: site.id, departmentId: ops.id, positionId: supervisor.id, managerId: boss.id,
      },
    });
    const field = await tx.employee.create({
      data: {
        workspaceId: ws, employeeCode: DEMO.fieldWorker.code, firstName: 'ຄຳແພງ', lastName: 'ແກ້ວມະນີ', gender: 'MALE',
        firstNameEn: 'Khamphaeng', lastNameEn: 'Keomany', village: 'ຫ້ວຍ', district: 'ປາກເຊ', province: 'CH',
        phone: DEMO.fieldWorker.phone, hireDate: new Date('2025-01-10'), contractType: 'INDEFINITE', payType: 'DAILY', status: 'ACTIVE',
        hazardousWork: true, branchId: site.id, departmentId: ops.id, positionId: worker.id, managerId: lead.id,
        socialSecurityNoEnc: cipher.encrypt('SS1000003'), socialSecurityNoHash: cipher.blindIndex('social_security_no', 'SS1000003'),
      },
    });
    const fieldUser = await tx.user.create({
      data: {
        workspaceId: ws, employeeId: field.id, displayName: 'ຄຳແພງ ແກ້ວມະນີ', phone: DEMO.fieldWorker.phone,
        // Demo phone is pre-verified so sign-in skips the SMS OTP step (FR-AUTH-02.1).
        phoneVerifiedAt: new Date(),
        pinHash: await hashSecret(DEMO.fieldWorker.pin), roles: { create: { workspaceId: ws, roleId: roles.EMPLOYEE! } },
      },
    });

    const foreign = await tx.employee.create({
      data: {
        workspaceId: ws, employeeCode: 'E004', firstName: 'Nguyen', lastName: 'Van An', firstNameEn: 'Nguyen', lastNameEn: 'Van An', gender: 'MALE',
        nationalityType: 'FOREIGN', nationality: 'Vietnam', phone: '02055550004', hireDate: new Date('2024-04-01'),
        contractType: 'FIXED_TERM', contractEndDate: new Date('2027-03-31'), payType: 'MONTHLY', status: 'ACTIVE', branchId: site.id, departmentId: ops.id, positionId: worker.id, managerId: lead.id,
      },
    });
    await tx.employeeDocument.createMany({
      data: [
        { workspaceId: ws, employeeId: foreign.id, type: 'WORK_PERMIT', number: 'WP-2024-0091', issuedAt: daysFromNow(-300), expiresAt: daysFromNow(25) },
        { workspaceId: ws, employeeId: foreign.id, type: 'VISA', number: 'LA-V-77812', issuedAt: daysFromNow(-300), expiresAt: daysFromNow(55) },
        { workspaceId: ws, employeeId: foreign.id, type: 'PASSPORT', number: 'C1234567', issuedAt: daysFromNow(-1000), expiresAt: daysFromNow(800) },
        { workspaceId: ws, employeeId: foreign.id, type: 'MEDICAL_CERT', number: 'MC-2025-031', issuedAt: daysFromNow(-375), expiresAt: daysFromNow(-10) },
      ],
    });
    await tx.emergencyContact.create({ data: { workspaceId: ws, employeeId: field.id, name: 'ນາງ ແສງ', relationship: 'ພັນລະຍາ', phone: '02099990003' } });
    // Individual working schedule (FR-WS-03.2): the site supervisor works Mon–Fri 8 h + Saturday 4 h.
    // Everyone else follows the workspace standard created by bootstrapWorkspace (Mon–Sat 8 h).
    const standard = await tx.workSchedule.findFirstOrThrow({ where: { workspaceId: ws, isDefault: true } });
    const halfSaturday = await tx.workSchedule.create({
      data: {
        workspaceId: ws, name: 'ຈັນ–ສຸກ + ເສົາເຄິ່ງມື້', dayMinutes: hoursToMinutes([0, 8, 8, 8, 8, 8, 4]),
        shiftId: standard.shiftId, isDefault: false, reason: 'Demo seed',
      },
    });
    await tx.scheduleAssignment.create({
      data: { workspaceId: ws, employeeId: lead.id, scheduleId: halfSaturday.id, effectiveFrom: lead.hireDate, reason: 'Demo seed' },
    });
    // Login for the site supervisor E002, the manager of E003 (approvals inbox, delegations).
    await tx.user.create({
      data: {
        workspaceId: ws, employeeId: lead.id, displayName: 'ບົວພັນ ສີສຸວັນ', email: DEMO.manager.email, phone: DEMO.manager.phone,
        phoneVerifiedAt: new Date(), passwordHash: await hashSecret(DEMO.manager.password), pinHash: await hashSecret(DEMO.manager.pin),
        roles: { create: { workspaceId: ws, roleId: roles.MANAGER! } },
      },
    });
    // Pending leave requests of E003 routed to E002 by the approval engine (M6 adds leave filing).
    const annual = await tx.leaveType.findFirstOrThrow({ where: { workspaceId: ws, code: 'ANNUAL' } });
    for (const [i, reason] of DEMO.leaveReasons.entries()) {
      const start = daysFromNow(14 + i * 7);
      const leave = await tx.leaveRequest.create({
        data: { workspaceId: ws, employeeId: field.id, leaveTypeId: annual.id, startDate: start, endDate: start, days: 1, reason },
      });
      await submitApproval(tx, defaultApprovalRegistry, {
        workspaceId: ws, subjectType: 'LEAVE', subjectId: leave.id, requesterEmployeeId: field.id, submittedByUserId: null,
      });
    }
    // Sample in-app notification for the HR demo user (notification center / E2E).
    await notify(tx, {
      workspaceId: ws,
      userIds: [owner.id],
      type: 'DOCUMENT_EXPIRY',
      titleKey: 'notif.docExpiring.title',
      bodyKey: 'notif.docExpiring.body',
      params: { document: { t: 'document.WORK_PERMIT' }, employee: 'Nguyen Van An', days: 25, date: daysFromNow(25).toISOString().slice(0, 10) },
      link: `/employees/${foreign.id}`,
      dedupeKey: 'seed:doc-expiry:work-permit',
    });
    // The field worker's own ID card expires soon: an in-app notification linking to the own profile
    // (mobile deep link, FR-NOTI-04.2). Same dedupe key as the document-expiry job, so the job never repeats it.
    const idCard = await tx.employeeDocument.create({
      data: { workspaceId: ws, employeeId: field.id, type: 'ID_CARD', number: '01-0098765', issuedAt: daysFromNow(-3630), expiresAt: daysFromNow(20) },
    });
    await notify(tx, {
      workspaceId: ws,
      userIds: [fieldUser.id],
      type: 'DOCUMENT_EXPIRY',
      titleKey: 'notif.docExpiring.title',
      bodyKey: 'notif.docExpiring.body',
      params: { document: { t: 'document.ID_CARD' }, employee: 'ຄຳແພງ ແກ້ວມະນີ', days: 20, date: daysFromNow(20).toISOString().slice(0, 10) },
      link: '/profile',
      dedupeKey: `doc-expiry:${idCard.id}:30`,
      data: { documentId: idCard.id, employeeId: field.id },
    });
    return true;
  });
  await db.system(async (tx) => {
    if (await tx.platformUser.findUnique({ where: { email: PLATFORM_DEMO.email } })) return;
    await tx.platformUser.create({
      data: { email: PLATFORM_DEMO.email, displayName: PLATFORM_DEMO.displayName, passwordHash: await hashSecret(PLATFORM_DEMO.password) },
    });
  });
  console.warn(seeded ? `Seeded workspace "${DEMO.workspaceCode}"` : `Workspace "${DEMO.workspaceCode}" already exists — nothing to do. To reseed, point DATABASE_URL at a new empty database, run \`pnpm --filter @hrm/api db:deploy\`, then \`pnpm --filter @hrm/api db:seed\` (never reset a shared database)`);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.disconnect());
