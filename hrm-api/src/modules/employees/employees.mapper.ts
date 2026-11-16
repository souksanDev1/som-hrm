import { documentExpiry, maskSensitive, type EmployeeDetail, type EmployeeSummary } from '@hrm/shared';
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

/** What the server needs to classify document expiry: today in the workspace timezone + configured thresholds. */
export interface ExpiryContext {
  today: string;
  alertDays: readonly number[];
}

export const toEmployeeDetail = (
  e: EmployeeWithDetail,
  cipher: FieldCipher,
  canSeeSensitive: boolean,
  expiry: ExpiryContext,
): EmployeeDetail => ({
  ...toEmployeeSummary(e),
  gender: e.gender,
  dateOfBirth: toIsoDate(e.dateOfBirth),
  address: e.address,
  nationality: e.nationality,
  // Legacy plaintext idCardNo is read only until scripts/backfill-pii.ts has encrypted it.
  idCardNo: e.idCardNoEnc ? reveal(cipher, e.idCardNoEnc, canSeeSensitive) : canSeeSensitive ? e.idCardNo : maskSensitive(e.idCardNo),
  socialSecurityNo: reveal(cipher, e.socialSecurityNoEnc, canSeeSensitive),
  familyBookNo: reveal(cipher, e.familyBookNoEnc, canSeeSensitive),
  sensitiveMasked: !canSeeSensitive,
  hireDate: toIsoDate(e.hireDate)!,
  employmentType: e.employmentType,
  hazardousWork: e.hazardousWork,
  manager: e.manager ? { id: e.manager.id, name: `${e.manager.firstName} ${e.manager.lastName}` } : null,
  documents: e.documents.map((d) => {
    const expiresAt = toIsoDate(d.expiresAt);
    const x = documentExpiry(expiresAt, expiry.today, expiry.alertDays);
    return {
      id: d.id,
      type: d.type,
      number: d.number,
      issuedAt: toIsoDate(d.issuedAt),
      expiresAt,
      note: d.note,
      expiryStatus: x.status,
      daysUntilExpiry: x.daysUntilExpiry,
      expiryThresholdDays: x.thresholdDays,
      file: d.file,
    };
  }),
  emergencyContacts: e.emergencyContacts.map((c) => ({ id: c.id, name: c.name, relationship: c.relationship, phone: c.phone })),
});
