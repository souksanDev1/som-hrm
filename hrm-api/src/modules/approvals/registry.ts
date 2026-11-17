import { leaveApprovalHandler } from '../leave/leave.approval';
import { overtimeApprovalHandler } from '../overtime/overtime.approval';
import { createApprovalRegistry } from './approval-handlers';
import { correctionApprovalHandler } from '../attendance/correction.approval';
import { deviceChangeApprovalHandler } from '../attendance/device-change.approval';

/**
 * Subject modules wired into the approval engine. Add a module's handler here when it starts
 * submitting approvals (overtime / attendance correction in M5).
 */
export const defaultApprovalRegistry = createApprovalRegistry([
  leaveApprovalHandler,
  overtimeApprovalHandler,
  correctionApprovalHandler,
  deviceChangeApprovalHandler,
]);
