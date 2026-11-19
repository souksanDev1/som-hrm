import type { EmploymentStatus } from '@hrm/shared';

/** Resigned and terminated people no longer need a department or line manager fixed. */
export const needsAssignment = (status: EmploymentStatus) => status !== 'RESIGNED' && status !== 'TERMINATED';
