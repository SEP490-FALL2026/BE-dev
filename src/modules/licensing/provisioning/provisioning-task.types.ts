import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import type { Prisma } from '../../../generated/prisma/client';
import type {
  AccessState,
  ProvisioningChannel,
  ProvisioningFailureKind,
  ProvisioningTaskKind,
  ProvisioningTaskStatus,
  RevocationCompletion,
  RevocationSource,
  RevocationTaskFacts,
} from '../public/licensing.types';

/** A task as it is kept, with the few facts of its assignment a card needs. */
export interface ProvisioningTaskRecord {
  id: string;
  kind: ProvisioningTaskKind;
  channel: ProvisioningChannel;
  status: ProvisioningTaskStatus;
  /** The request a grant answers for; a revocation has none. */
  requestId: string | null;
  assignmentId: string;
  defaultResponsibleEmployeeId: string | null;
  claimedByAppUserId: string | null;
  claimedAt: Date | null;
  completedByAppUserId: string | null;
  completedAt: Date | null;
  evidence: string | null;
  failedByAppUserId: string | null;
  failedAt: Date | null;
  failureReason: string | null;
  failureKind: ProvisioningFailureKind | null;
  attempts: number;
  /** The most tries the task gets, fixed when it was made (US-01-04 AC-13). */
  maxAttempts: number;
  lastError: string | null;
  nextRetryAt: Date | null;
  closedByAppUserId: string | null;
  closedAt: Date | null;
  closeReason: string | null;
  handedOffByAppUserId: string | null;
  handedOffAt: Date | null;
  handOffEvidence: string | null;
  /** The source that opened a revocation; null for a grant. */
  revocationSource: RevocationSource | null;
  completion: RevocationCompletion | null;
  paidThroughOn: BusinessDate | null;
  accessState: AccessState | null;
  accessCutOn: BusinessDate | null;
  accessEvidence: string | null;
  completionNote: string | null;
  createdAt: Date;
  assignment: {
    employeeId: string;
    planId: string;
    subscriptionId: string | null;
    accountIdentifier: string;
    validUntil: BusinessDate | null;
  };
}

const ASSIGNMENT_SELECT = {
  employeeId: true,
  planId: true,
  subscriptionId: true,
  accountIdentifier: true,
  validUntil: true,
} as const;

/** The columns of a task that a list row shows: everything but the long text a detail carries (`LD-08`). */
export const SUMMARY_SELECT = {
  id: true,
  organizationId: true,
  assignmentId: true,
  kind: true,
  channel: true,
  status: true,
  requestId: true,
  defaultResponsibleEmployeeId: true,
  claimedByAppUserId: true,
  claimedAt: true,
  completedByAppUserId: true,
  completedAt: true,
  failedByAppUserId: true,
  failedAt: true,
  failureKind: true,
  attempts: true,
  maxAttempts: true,
  nextRetryAt: true,
  closedByAppUserId: true,
  closedAt: true,
  handedOffByAppUserId: true,
  handedOffAt: true,
  revocationSource: true,
  completion: true,
  paidThroughOn: true,
  accessState: true,
  accessCutOn: true,
  createdByAppUserId: true,
  createdAt: true,
  updatedAt: true,
  assignment: { select: ASSIGNMENT_SELECT },
} as const;

export const WITH_ASSIGNMENT = { assignment: { select: ASSIGNMENT_SELECT } } as const;
type Row = Prisma.ProvisioningTaskGetPayload<{ include: typeof WITH_ASSIGNMENT }>;

const dayOf = (value: Date | null): BusinessDate | null => (value ? fromDateColumn(value) : null);

export const toRecord = (row: Row): ProvisioningTaskRecord => ({
  id: row.id,
  kind: row.kind,
  channel: row.channel,
  status: row.status,
  requestId: row.requestId,
  assignmentId: row.assignmentId,
  defaultResponsibleEmployeeId: row.defaultResponsibleEmployeeId,
  claimedByAppUserId: row.claimedByAppUserId,
  claimedAt: row.claimedAt,
  completedByAppUserId: row.completedByAppUserId,
  completedAt: row.completedAt,
  evidence: row.evidence,
  failedByAppUserId: row.failedByAppUserId,
  failedAt: row.failedAt,
  failureReason: row.failureReason,
  failureKind: row.failureKind,
  attempts: row.attempts,
  maxAttempts: row.maxAttempts,
  lastError: row.lastError,
  nextRetryAt: row.nextRetryAt,
  closedByAppUserId: row.closedByAppUserId,
  closedAt: row.closedAt,
  closeReason: row.closeReason,
  handedOffByAppUserId: row.handedOffByAppUserId,
  handedOffAt: row.handedOffAt,
  handOffEvidence: row.handOffEvidence,
  revocationSource: row.revocationSource,
  completion: row.completion,
  paidThroughOn: dayOf(row.paidThroughOn),
  accessState: row.accessState,
  accessCutOn: dayOf(row.accessCutOn),
  accessEvidence: row.accessEvidence,
  completionNote: row.completionNote,
  createdAt: row.createdAt,
  assignment: {
    employeeId: row.assignment.employeeId,
    planId: row.assignment.planId,
    subscriptionId: row.assignment.subscriptionId,
    accountIdentifier: row.assignment.accountIdentifier,
    validUntil: dayOf(row.assignment.validUntil),
  },
});

/** What the hook of a revocation is told of a task. */
export const toRevocationFacts = (task: ProvisioningTaskRecord): RevocationTaskFacts => ({
  id: task.id,
  assignmentId: task.assignmentId,
  employeeId: task.assignment.employeeId,
  planId: task.assignment.planId,
  status: task.status,
});
