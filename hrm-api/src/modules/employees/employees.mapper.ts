import { assignmentIssues, documentExpiry, maskSensitive, type EmployeeDetail, type EmployeeSummary, type ExpiringDocument } from '@hrm/shared';
import type { FieldCipher } from '../../lib/crypto';
import { toIsoDate } from '../../lib/dates';
import { isActiveStatus, type EmployeeWithDetail, type EmployeeWithSummary, type ExpiringDocumentRow } from './employees.repository';

export const toEmployeeSummary = (e: EmployeeWithSummary): EmployeeSummary => ({
  id: e.id,
  employeeCode: e.employeeCode,
  firstName: e.firstName,
  lastName: e.lastName,
  firstNameEn: e.firstNameEn,
  lastNameEn: e.lastNameEn,
  nickname: e.nickname,
  phone: e.phone,
  email: e.email,
  status: e.status,
  nationalityType: e.nationalityType,
  department: e.department,
  position: e.position,
  branch: e.branch,
  hasLogin: !!e.user,
  assignmentIncomplete:
    isActiveStatus(e.status) && assignmentIssues({ departmentId: e.departmentId, managerId: e.managerId, isTopLevel: e.isTopLevel }).length > 0,
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

/** Expiry fields of a document as computed by the server (FR-EMP-05.4). */
const expiryFields = (expiresAtDate: Date | null, expiry: ExpiryContext) => {
  const expiresAt = toIsoDate(expiresAtDate);
  const x = documentExpiry(expiresAt, expiry.today, expiry.alertDays);
  return { expiresAt, expiryStatus: x.status, daysUntilExpiry: x.daysUntilExpiry, expiryThresholdDays: x.thresholdDays };
};

export const toExpiringDocument = (d: ExpiringDocumentRow, expiry: ExpiryContext): ExpiringDocument => ({
  id: d.id,
  type: d.type,
  number: d.number,
  ...expiryFields(d.expiresAt, expiry),
  employee: d.employee,
});

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
  village: e.village,
  district: e.district,
  province: e.province,
  nationality: e.nationality,
  // Legacy plaintext idCardNo is read only until scripts/backfill-pii.ts has encrypted it.
  idCardNo: e.idCardNoEnc ? reveal(cipher, e.idCardNoEnc, canSeeSensitive) : canSeeSensitive ? e.idCardNo : maskSensitive(e.idCardNo),
  socialSecurityNo: reveal(cipher, e.socialSecurityNoEnc, canSeeSensitive),
  ssnRegisteredAt: toIsoDate(e.ssnRegisteredAt),
  familyBookNo: reveal(cipher, e.familyBookNoEnc, canSeeSensitive),
  familyBookHolder: e.familyBookHolder,
  sensitiveMasked: !canSeeSensitive,
  hireDate: toIsoDate(e.hireDate)!,
  contractType: e.contractType,
  contractEndDate: toIsoDate(e.contractEndDate),
  probationEndDate: toIsoDate(e.probationEndDate),
  payType: e.payType,
  hazardousWork: e.hazardousWork,
  isTopLevel: e.isTopLevel,
  manager: e.manager
    ? { id: e.manager.id, name: `${e.manager.firstName} ${e.manager.lastName}`, positionName: e.manager.position?.name ?? null }
    : null,
  documents: e.documents.map((d) => ({
    id: d.id,
    type: d.type,
    number: d.number,
    issuedAt: toIsoDate(d.issuedAt),
    ...expiryFields(d.expiresAt, expiry),
    note: d.note,
    file: d.file,
  })),
  emergencyContacts: e.emergencyContacts.map((c) => ({ id: c.id, name: c.name, relationship: c.relationship, phone: c.phone })),
});
