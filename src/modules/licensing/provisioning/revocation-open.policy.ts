import type { RevocationReasonFacts } from '../public/licensing.types';

/** What the reason of a revocation says to the listeners of the moment it opens: the source, who decided and in which role, and what it refers to. */
export const reasonFactsOf = (reason: {
  source: string;
  decidedByEmployeeId: string | null;
  decidedRole: string;
  referenceKind: string | null;
  referenceId: string | null;
}): RevocationReasonFacts =>
  ({
    source: reason.source,
    decidedByEmployeeId: reason.decidedByEmployeeId,
    decidedRole: reason.decidedRole,
    referenceKind: reason.referenceKind,
    referenceId: reason.referenceId,
  }) as RevocationReasonFacts;

/**
 * The audit entry of opening a revocation (`US-07-05` AC-3, AC-11): the first reason opens the task, the others are added beside it and
 * the entry keeps the state the task was in. It carries who decided and on what, never the note or the account.
 */
export function revocationOpenedAudit(opened: {
  reused: boolean;
  task: { id: string; status: string; defaultResponsibleEmployeeId: string | null };
  assignmentId: string;
  reason: {
    source: string;
    decidedByEmployeeId: string | null;
    decidedRole: string;
    referenceKind: string | null;
    referenceId: string | null;
  };
  selfExecuted: boolean;
}): {
  action: string;
  before: { status: string } | null;
  after: { [key: string]: string | boolean | null };
} {
  const { task, reason } = opened;

  return {
    action: opened.reused ? 'PROVISIONING_TASK.REVOCATION_REASON_ADDED' : 'PROVISIONING_TASK.REVOCATION_OPENED',
    before: opened.reused ? { status: task.status } : null,
    after: {
      assignmentId: opened.assignmentId,
      source: reason.source,
      decidedByEmployeeId: reason.decidedByEmployeeId,
      decidedRole: reason.decidedRole,
      referenceKind: reason.referenceKind,
      referenceId: reason.referenceId,
      defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
      selfExecuted: opened.selfExecuted,
    },
  };
}
