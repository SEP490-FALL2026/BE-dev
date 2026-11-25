import { fromDateColumn } from '../../../core/business-date';
import type { Prisma } from '../../../generated/prisma/client';
import type { AssignmentRecord } from '../public/licensing.types';

/** The columns an assignment is answered with: a list reads these and nothing else. */
export const RECORD_SELECT = {
  id: true,
  source: true,
  kind: true,
  planId: true,
  subscriptionId: true,
  employeeId: true,
  accountIdentifier: true,
  reason: true,
  costCenterId: true,
  owningDepartmentId: true,
  validFrom: true,
  validFromBasis: true,
  validUntil: true,
  expectedEndDate: true,
  predecessorId: true,
  isMachineAccount: true,
  machineAccountNote: true,
  personalCommitmentMonths: true,
  billingAnchorOn: true,
  failedAt: true,
  cancelledAt: true,
  createdAt: true,
} satisfies Prisma.LicenseAssignmentSelect;
export type AssignmentRow = Prisma.LicenseAssignmentGetPayload<{ select: typeof RECORD_SELECT }>;

export const toRecord = (row: AssignmentRow): AssignmentRecord => ({
  id: row.id,
  source: row.source,
  kind: row.kind,
  planId: row.planId,
  subscriptionId: row.subscriptionId,
  employeeId: row.employeeId,
  accountIdentifier: row.accountIdentifier,
  reason: row.reason,
  costCenterId: row.costCenterId,
  owningDepartmentId: row.owningDepartmentId,
  effectiveFrom: fromDateColumn(row.validFrom),
  effectiveFromBasis: row.validFromBasis,
  validUntil: row.validUntil ? fromDateColumn(row.validUntil) : null,
  expectedEndDate: row.expectedEndDate ? fromDateColumn(row.expectedEndDate) : null,
  predecessorId: row.predecessorId,
  isMachineAccount: row.isMachineAccount,
  machineAccountNote: row.machineAccountNote,
  personalCommitmentMonths: row.personalCommitmentMonths === null ? null : (row.personalCommitmentMonths as 1 | 12),
  billingAnchorOn: row.billingAnchorOn ? fromDateColumn(row.billingAnchorOn) : null,
  failedAt: row.failedAt,
  cancelledAt: row.cancelledAt,
  createdAt: row.createdAt,
});
