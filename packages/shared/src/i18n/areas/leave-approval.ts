/**
 * Leave approval & cancellation (M6, FR-LV-11/12/13.10): approval summaries, withdrawal, cancellation errors and
 * the "team on leave" panel of the approval detail.
 */
export const leaveApprovalLo = {
  'approval.summary.leave.dates': '{start} – {end}',
  'approval.summary.leave.withHalfDay': '{dates} ({halfDay})',
  'approval.summary.leaveCancel.title': 'ຍົກເລີກ {leaveType} · {days} ມື້',
  'approval.summary.leaveCancel.detail': '{dates} · ເຫດຜົນ: {reason}',
  'approval.withdrawnBy': 'ຖອນຄຳຂໍໂດຍ {name}',
  'approval.withdrawn': 'ຖອນຄຳຂໍແລ້ວ',
  'approval.teamOnLeave.title': 'ເພື່ອນຮ່ວມທີມທີ່ລາໃນຊ່ວງດຽວກັນ',
  'approval.teamOnLeave.empty': 'ບໍ່ມີເພື່ອນຮ່ວມທີມລາໃນຊ່ວງນີ້',
  'approval.teamOnLeave.pending': 'ລໍຖ້າອະນຸມັດ',
  'error.reason_required': 'ກະລຸນາລະບຸເຫດຜົນ',
  'error.leave_cancel_pending': 'ມີຄຳຂໍຍົກເລີກການລານີ້ລໍຖ້າອະນຸມັດຢູ່ແລ້ວ',
  'error.leave_not_cancellable': 'ຍົກເລີກການລານີ້ບໍ່ໄດ້ໃນສະຖານະປັດຈຸບັນ',
  'error.leave_cancel_not_allowed': 'ທ່ານບໍ່ມີສິດຍົກເລີກການລານີ້',
} as const;

export const leaveApprovalEn: Record<keyof typeof leaveApprovalLo, string> = {
  'approval.summary.leave.dates': '{start} – {end}',
  'approval.summary.leave.withHalfDay': '{dates} ({halfDay})',
  'approval.summary.leaveCancel.title': 'Cancel {leaveType} · {days} day(s)',
  'approval.summary.leaveCancel.detail': '{dates} · Reason: {reason}',
  'approval.withdrawnBy': 'Withdrawn by {name}',
  'approval.withdrawn': 'Withdrawn',
  'approval.teamOnLeave.title': 'Team members on leave at the same time',
  'approval.teamOnLeave.empty': 'No team member is on leave during this period',
  'approval.teamOnLeave.pending': 'Pending approval',
  'error.reason_required': 'Please give a reason',
  'error.leave_cancel_pending': 'A cancellation of this leave is already waiting for approval',
  'error.leave_not_cancellable': 'This leave cannot be cancelled in its current status',
  'error.leave_cancel_not_allowed': 'You may not cancel this leave',
};
