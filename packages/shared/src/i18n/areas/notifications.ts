/**
 * Notification templates and delivery strings (M4, FR-NOTI). Key prefixes: `notif.`, `param.probation.`.
 * Templates use `{param}` placeholders (see `interpolate`) and are rendered server-side per recipient.
 * The notification-center UI strings and the M2 document-expiry templates live in ./infra.ts.
 */
export const notificationsLo = {
  // ── Parameter labels (registry labelKey) ──
  'param.probation.alertDays': 'ແຈ້ງເຕືອນກ່ອນສິ້ນສຸດການທົດລອງວຽກ',
  // ── Probation ending (FR-NOTI-03.5) ──
  'notif.probationEnding.title': 'ໃກ້ສິ້ນສຸດການທົດລອງວຽກ',
  'notif.probationEnding.body': 'ການທົດລອງວຽກຂອງ {employee} ຈະສິ້ນສຸດໃນ {days} ມື້ (ວັນທີ {date})',
  // ── Attendance events, triggered from M5 (FR-NOTI-03.3/03.6/03.7) ──
  'notif.missingPunch.title': 'ບໍ່ມີການລົງເວລາ',
  'notif.missingPunch.body': 'ບໍ່ພົບການ{punch} ຂອງວັນທີ {date} ກະລຸນາສົ່ງຄຳຂໍແກ້ເວລາ',
  'notif.punch.IN': 'ລົງເວລາເຂົ້າ',
  'notif.punch.OUT': 'ລົງເວລາອອກ',
  'notif.suspicious.title': 'ການລົງເວລາທີ່ໜ້າສົງໄສ',
  'notif.suspicious.body': '{employee} — {reason} (ວັນທີ {date})',
  'notif.offlineUnsynced.title': 'ຂໍ້ມູນລົງເວລາຍັງບໍ່ໄດ້ສົ່ງ',
  'notif.offlineUnsynced.body': 'ມີ {count} ລາຍການລົງເວລາໃນເຄື່ອງທີ່ຍັງບໍ່ໄດ້ສົ່ງ ກະລຸນາເຊື່ອມຕໍ່ອິນເຕີເນັດ',
  // ── SMS text per notification type (FR-NOTI-02.3); params: the notification's params + rendered {title}/{body} ──
  'notif.sms.DOCUMENT_EXPIRY': 'SOM HRM: {body}',
  'notif.sms.PROBATION_ENDING': 'SOM HRM: {body}',
  'notif.sms.APPROVAL_DECISION': 'SOM HRM: {title} — {body}',
  'notif.sms.APPROVAL_PENDING': 'SOM HRM: {title} — ກະລຸນາເປີດແອັບເພື່ອພິຈາລະນາ',
  'notif.sms.APPROVAL_ESCALATED': 'SOM HRM: {title} — ກະລຸນາເປີດແອັບເພື່ອພິຈາລະນາ',
  'notif.sms.LEAVE_REQUEST': 'SOM HRM: {title} — ກະລຸນາເປີດແອັບເພື່ອພິຈາລະນາ',
  'notif.sms.LEAVE_DECISION': 'SOM HRM: {title} — {body}',
  'notif.sms.CORRECTION_REQUEST': 'SOM HRM: {title} — ກະລຸນາເປີດແອັບເພື່ອພິຈາລະນາ',
  'notif.sms.CORRECTION_DECISION': 'SOM HRM: {title} — {body}',
  'notif.sms.MISSING_PUNCH': 'SOM HRM: {body}',
  'notif.sms.SUSPICIOUS_ATTENDANCE': 'SOM HRM: {title} — {body}',
  'notif.sms.OFFLINE_UNSYNCED': 'SOM HRM: {body}',
  'notif.sms.SYSTEM': 'SOM HRM: {title} — {body}',
} as const;

export const notificationsEn: Record<keyof typeof notificationsLo, string> = {
  'param.probation.alertDays': 'Probation-ending alerts before the end date',
  'notif.probationEnding.title': 'Probation ending soon',
  'notif.probationEnding.body': "{employee}'s probation ends in {days} days ({date})",
  'notif.missingPunch.title': 'Missing check-in/out',
  'notif.missingPunch.body': 'No {punch} was recorded on {date}. Please submit a time correction.',
  'notif.punch.IN': 'check-in',
  'notif.punch.OUT': 'check-out',
  'notif.suspicious.title': 'Suspicious attendance record',
  'notif.suspicious.body': '{employee} — {reason} ({date})',
  'notif.offlineUnsynced.title': 'Attendance not yet synced',
  'notif.offlineUnsynced.body': '{count} attendance records on your device have not been sent yet. Please connect to the internet.',
  'notif.sms.DOCUMENT_EXPIRY': 'SOM HRM: {body}',
  'notif.sms.PROBATION_ENDING': 'SOM HRM: {body}',
  'notif.sms.APPROVAL_DECISION': 'SOM HRM: {title} — {body}',
  'notif.sms.APPROVAL_PENDING': 'SOM HRM: {title} — please open the app to review',
  'notif.sms.APPROVAL_ESCALATED': 'SOM HRM: {title} — please open the app to review',
  'notif.sms.LEAVE_REQUEST': 'SOM HRM: {title} — please open the app to review',
  'notif.sms.LEAVE_DECISION': 'SOM HRM: {title} — {body}',
  'notif.sms.CORRECTION_REQUEST': 'SOM HRM: {title} — please open the app to review',
  'notif.sms.CORRECTION_DECISION': 'SOM HRM: {title} — {body}',
  'notif.sms.MISSING_PUNCH': 'SOM HRM: {body}',
  'notif.sms.SUSPICIOUS_ATTENDANCE': 'SOM HRM: {title} — {body}',
  'notif.sms.OFFLINE_UNSYNCED': 'SOM HRM: {body}',
  'notif.sms.SYSTEM': 'SOM HRM: {title} — {body}',
};
