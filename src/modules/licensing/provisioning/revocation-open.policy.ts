import type { BusinessDate } from '../../../core/business-date';
import { RevocationInputError } from '../public/licensing.errors';
import type { RevocationReasonFacts } from '../public/licensing.types';

/** The timing a task carries: read from the reasons that stand, never from one alone. */
export interface RevocationTiming {
  dueOn: BusinessDate | null;
  notBefore: BusinessDate | null;
}

/** A day not before that is after the due day contradicts itself: a fault of the source module, not of the person. Throws RevocationInputError. */
export function assertTiming(timing: { dueOn?: BusinessDate; notBefore?: BusinessDate } | undefined): RevocationTiming {
  const dueOn = timing?.dueOn ?? null;
  const notBefore = timing?.notBefore ?? null;
  if (dueOn !== null && notBefore !== null && notBefore > dueOn) {
    throw new RevocationInputError('The day not before of a revocation is after its due day.');
  }

  return { dueOn, notBefore };
}

/**
 * The timing of a task from the reasons that stand (`BR-MF5-04`, `R-J08`): the grace of one reason never holds back the work another
 * reason asks for at once, so a single reason with no day not before leaves none; otherwise the earliest. The due day is the earliest given.
 */
export function effectiveTiming(reasons: readonly RevocationTiming[]): RevocationTiming {
  const days = (pick: (reason: RevocationTiming) => BusinessDate | null): BusinessDate[] =>
    reasons.flatMap((reason) => pick(reason) ?? []);
  const notBefores = days((reason) => reason.notBefore);
  const dueOns = days((reason) => reason.dueOn);

  return {
    notBefore: reasons.length === 0 || notBefores.length < reasons.length ? null : notBefores.reduce(earlier),
    dueOn: dueOns.length === 0 ? null : dueOns.reduce(earlier),
  };
}

const earlier = (a: BusinessDate, b: BusinessDate): BusinessDate => (a <= b ? a : b);

/**
 * The day the holder is told the revocation will not come before (`US-10-06` AC-2, `BR-MF5-04`), or null when they are not told: a task already
 * completed has nothing to come, and a task another reason asks for at once (a departure, a security reason) has no day to promise; telling
 * the holder in advance would warn the person a security revocation is meant to surprise.
 */
export function holderNoticeDay(status: string, standing: readonly RevocationTiming[]): BusinessDate | null {
  if (status === 'COMPLETED' || status === 'CANCELLED' || status === 'CLOSED_FAILED') return null;

  return effectiveTiming(standing).notBefore;
}

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
