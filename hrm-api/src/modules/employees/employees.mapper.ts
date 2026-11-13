import { maskSensitive, type EmployeeDetail, type EmployeeSummary } from '@hrm/shared';
import type { FieldCipher } from '../../lib/crypto';
import { toIsoDate } from '../../lib/dates';
import type { EmployeeWithDetail, EmployeeWithSummary } from './employees.repository';

export const toEmployeeSummary = (e: EmployeeWithSummary): EmployeeSummary => ({
  id: e.id,
  employeeCode: e.employeeCode,
  firstName: e.firstName,
  lastName: e.lastName,
  nickname: e.nickname,
  phone: e.phone,
  email: e.email,
  status: e.status,
  nationalityType: e.nationalityType,
  department: e.department,
  position: e.position,
  branch: e.branch,
  hasLogin: !!e.user,
});

const reveal = (cipher: FieldCipher, enc: string | null, canSee: boolean): string | null => {
  if (!enc) return null;
  const plain = cipher.decrypt(enc);
  return canSee ? plain : maskSensitive(plain);
};

export const toEmployeeDetail = (e: EmployeeWithDetail, cipher: FieldCipher, canSeeSensitive: boolean): EmployeeDetail => ({
  ...toEmployeeSummary(e),
  gender: e.gender,
  dateOfBirth: toIsoDate(e.dateOfBirth),
  address: e.address,
  nationality: e.nationality,
  idCardNo: canSeeSensitive ? e.idCardNo : maskSensitive(e.idCardNo),
  socialSecurityNo: reveal(cipher, e.socialSecurityNoEnc, canSeeSensitive),
  familyBookNo: reveal(cipher, e.familyBookNoEnc, canSeeSensitive),
  sensitiveMasked: !canSeeSensitive,
  hireDate: toIsoDate(e.hireDate)!,
  employmentType: e.employmentType,
  hazardousWork: e.hazardousWork,
  manager: e.manager ? { id: e.manager.id, name: `${e.manager.firstName} ${e.manager.lastName}` } : null,
  documents: e.documents.map((d) => ({
    id: d.id,
    type: d.type,
    number: d.number,
    issuedAt: toIsoDate(d.issuedAt),
    expiresAt: toIsoDate(d.expiresAt),
    note: d.note,
  })),
  emergencyContacts: e.emergencyContacts.map((c) => ({ id: c.id, name: c.name, relationship: c.relationship, phone: c.phone })),
});
