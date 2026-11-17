import { leaveApprovalHandler } from '../leave/leave.approval';
import { createApprovalRegistry } from './approval-handlers';

/**
 * Subject modules wired into the approval engine. Add a module's handler here when it starts
 * submitting approvals (overtime / attendance correction in M5).
 */
export const defaultApprovalRegistry = createApprovalRegistry([leaveApprovalHandler]);
