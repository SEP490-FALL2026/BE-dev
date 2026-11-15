import type { BusinessDate } from '../../../core/business-date';

/**
 * The rules of a budget cycle that need no database (`QĐ-111z`, `QĐ-111aa`, `BR-MF4-01`, `US-06-15`): which years can still be written, what
 * state a cycle is in and what that state allows, whether it accepts the work of the heads, and where a department may be made.
 */

/** A cycle of a year before the current one is read, never written (`QĐ-82l`(4), B7). */
export const isPastYear = (year: number, currentYear: number): boolean => year < currentYear;

/** The cycle accepts the proposals of its year once Finance opened it (`QĐ-111z`); it stops at the lock, which the state tells. */
export const cycleAcceptsWork = (cycle: { openedAt: Date | null }): boolean => cycle.openedAt !== null;

export type CycleState = 'DRAFT' | 'OPEN' | 'LOCKED';

/**
 * The state of a cycle (`QĐ-111z`): a draft until Finance opens it (whatever the day); open through the day of the submission deadline
 * (a day equal to the deadline is still in time); locked from the day after it. A locked cycle is never opened again.
 */
export function cycleStateOf(
  cycle: { openedAt: Date | null; submissionDeadline: BusinessDate },
  today: BusinessDate,
): CycleState {
  if (cycle.openedAt === null) return 'DRAFT';

  return today > cycle.submissionDeadline ? 'LOCKED' : 'OPEN';
}

/** What an update asks: each field is present only when the call gave it; amounts are already in minor units. */
export interface CycleUpdate {
  submissionDeadline?: BusinessDate;
  decisionDeadline?: BusinessDate;
  priorities?: string | null;
  annualCeilingMinor?: bigint;
  sharedPoolReserveMinor?: bigint;
  reason?: string;
}

export type CycleChangePlan =
  | { kind: 'LOCKED' }
  | { kind: 'DEADLINES_INVALID' }
  | { kind: 'DEADLINE_IN_PAST' }
  | { kind: 'REASON_REQUIRED' }
  | { kind: 'NOTHING' }
  | {
      kind: 'CHANGE';
      submission: BusinessDate;
      decision: BusinessDate;
      ceilingChanged: boolean;
      reserveChanged: boolean;
      submissionMoved: boolean;
    };

type StoredCycle = {
  submissionDeadline: BusinessDate;
  decisionDeadline: BusinessDate;
  annualCeilingMinor: bigint;
  sharedPoolReserveMinor: bigint | null;
  priorities: string | null;
};

/** Which fields of the cycle the update changes; a field the update does not give is unchanged. */
function changesOf(update: CycleUpdate, stored: StoredCycle) {
  const submission = update.submissionDeadline ?? stored.submissionDeadline;
  const decision = update.decisionDeadline ?? stored.decisionDeadline;
  const priorities = update.priorities !== undefined ? update.priorities : stored.priorities;

  return {
    submission,
    decision,
    submissionMoved: submission !== stored.submissionDeadline,
    decisionMoved: decision !== stored.decisionDeadline,
    ceilingChanged: update.annualCeilingMinor !== undefined && update.annualCeilingMinor !== stored.annualCeilingMinor,
    reserveChanged:
      update.sharedPoolReserveMinor !== undefined && update.sharedPoolReserveMinor !== stored.sharedPoolReserveMinor,
    prioritiesChanged: priorities !== stored.priorities,
  };
}

type Changes = ReturnType<typeof changesOf>;

const anyChange = (change: Changes): boolean =>
  change.submissionMoved ||
  change.decisionMoved ||
  change.ceilingChanged ||
  change.reserveChanged ||
  change.prioritiesChanged;

/** What an open cycle refuses of a change: a submission deadline that has already passed, or a deadline or an amount moved with no reason. */
function openRefusal(
  change: Changes,
  reason: string | undefined,
  today: BusinessDate,
): { kind: 'DEADLINE_IN_PAST' } | { kind: 'REASON_REQUIRED' } | null {
  if (change.submissionMoved && change.submission < today) return { kind: 'DEADLINE_IN_PAST' };
  const needsReason = change.submissionMoved || change.ceilingChanged || change.reserveChanged;

  return needsReason && !reason ? { kind: 'REASON_REQUIRED' } : null;
}

/**
 * What a change of a cycle may be, by its state (`QĐ-111z`, `R-14`, `US-06-15` AC-21). A locked cycle takes no change (the reserve of the
 * shared pool is locked with the annual ceiling). A draft takes any, with no reason. An open one may move the submission deadline to
 * today or later, and change the annual ceiling or the reserve, each with a reason that is kept; the decision deadline and the priorities
 * move freely. A change that changes nothing is `NOTHING`: no write and no record.
 */
export function planCycleChange(
  state: CycleState,
  update: CycleUpdate,
  stored: StoredCycle,
  today: BusinessDate,
): CycleChangePlan {
  if (state === 'LOCKED') return { kind: 'LOCKED' };
  const change = changesOf(update, stored);
  if (change.decision < change.submission) return { kind: 'DEADLINES_INVALID' };
  const { submission, decision, submissionMoved, ceilingChanged, reserveChanged } = change;
  if (!anyChange(change)) return { kind: 'NOTHING' };
  if (state === 'OPEN') {
    const refusal = openRefusal(change, update.reason, today);
    if (refusal) return refusal;
  }

  return { kind: 'CHANGE', submission, decision, ceilingChanged, reserveChanged, submissionMoved };
}

export type OpeningVerdict =
  { kind: 'OK' } | { kind: 'DEADLINE_PASSED' } | { kind: 'ALREADY_OPEN' } | { kind: 'LOCKED' };

/** Whether Finance may open the cycle: a draft whose submission deadline is today or later (a draft with a past deadline is edited first). */
export function judgeOpening(state: CycleState, submissionDeadline: BusinessDate, today: BusinessDate): OpeningVerdict {
  if (state === 'LOCKED') return { kind: 'LOCKED' };
  if (state === 'OPEN') return { kind: 'ALREADY_OPEN' };

  return submissionDeadline < today ? { kind: 'DEADLINE_PASSED' } : { kind: 'OK' };
}

/** Only a draft is deleted; an open cycle has heads working on it and a locked one is the record of a year. */
export const judgeDelete = (state: CycleState): { kind: 'OK' } | { kind: 'NOT_DRAFT' } =>
  state === 'DRAFT' ? { kind: 'OK' } : { kind: 'NOT_DRAFT' };

/**
 * Where a department may be made (`QĐ-111ba`, `R-16`): from the opening of the cycle of the next year until the first version of that year is
 * sent to the spending approver, the new department takes effect on 1 January of that year (Finance then makes its budget with the others). A
 * draft cycle, a cycle whose first version was sent, and the cycle of this year do not open the window (no department is made in the middle of
 * a year); an organization with no cycle at all is still being installed.
 */
export function windowOf(input: {
  nextYear: number;
  nextCycle: { opened: boolean; firstVersionSent: boolean } | null;
  anyCycle: boolean;
}): { kind: 'OPEN'; effectiveFrom: string } | { kind: 'CLOSED' } | { kind: 'NO_CYCLE_YET' } {
  if (input.nextCycle) {
    return input.nextCycle.opened && !input.nextCycle.firstVersionSent
      ? { kind: 'OPEN', effectiveFrom: `${input.nextYear}-01-01` }
      : { kind: 'CLOSED' };
  }

  return input.anyCycle ? { kind: 'CLOSED' } : { kind: 'NO_CYCLE_YET' };
}
