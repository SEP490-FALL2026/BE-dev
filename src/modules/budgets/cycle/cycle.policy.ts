import type { BusinessDate } from '../../../core/business-date';

/**
 * The rules of a budget cycle that need no database (`QĐ-103i`, `BR-MF4-01`, `BR-MF4-02`, `US-06-15`): which years can still be
 * written, whether a division of the annual ceiling can be published, and which departments hear about a publication.
 */

export interface CeilingParts {
  signedCommitmentsMinor: bigint;
  plannedSeatsMinor: bigint;
  priorityMinor: bigint;
}

export const ceilingTotal = (parts: CeilingParts): bigint =>
  parts.signedCommitmentsMinor + parts.plannedSeatsMinor + parts.priorityMinor;

/** A cycle of a year before the current one is read, never written (`QĐ-82l`(4), B7). */
export const isPastYear = (year: number, currentYear: number): boolean => year < currentYear;

export interface StoredCeiling extends CeilingParts {
  departmentId: string;
  totalMinor: bigint;
  publishedTotalMinor: bigint | null;
  /** What the total rests on, from the base figures (QT 4.3); optional. */
  explanation: string | null;
}

export type PublishVerdict =
  | { kind: 'OK'; totalMinor: bigint }
  | {
      kind: 'INCOMPLETE';
      missingDepartmentIds: string[];
      staleDepartmentIds: string[];
      explanationMissingDepartmentIds: string[];
      reserveMissing: boolean;
    }
  | { kind: 'OVER_ANNUAL'; gapMinor: bigint };

/**
 * Whether the division can be published (`QĐ-103i`): every department of the year has a ceiling, none belongs to a department that
 * left the set, every ceiling says what it rests on (the explanation of QT 4.3 is required to publish), the shared-pool reserve was
 * entered (an explicit zero counts), and the ceilings and the reserve add up to no more than the annual ceiling (`R-I04`).
 */
export function judgePublish(input: {
  departmentIds: readonly string[];
  ceilings: readonly StoredCeiling[];
  reserveMinor: bigint | null;
  annualCeilingMinor: bigint;
}): PublishVerdict {
  const inSet = new Set(input.departmentIds);
  const given = new Set(input.ceilings.map((ceiling) => ceiling.departmentId));
  const missing = input.departmentIds.filter((id) => !given.has(id)).sort();
  const stale = input.ceilings
    .map((ceiling) => ceiling.departmentId)
    .filter((id) => !inSet.has(id))
    .sort();
  const unexplained = input.ceilings
    .filter((ceiling) => (ceiling.explanation ?? '').trim() === '')
    .map((ceiling) => ceiling.departmentId)
    .sort();
  const reserveMissing = input.reserveMinor === null;
  if (missing.length > 0 || stale.length > 0 || unexplained.length > 0 || reserveMissing) {
    return {
      kind: 'INCOMPLETE',
      missingDepartmentIds: missing,
      staleDepartmentIds: stale,
      explanationMissingDepartmentIds: unexplained,
      reserveMissing,
    };
  }
  const total = input.ceilings.reduce((sum, ceiling) => sum + ceiling.totalMinor, 0n) + (input.reserveMinor as bigint);
  if (total > input.annualCeilingMinor) return { kind: 'OVER_ANNUAL', gapMinor: total - input.annualCeilingMinor };

  return { kind: 'OK', totalMinor: total };
}

/** The departments whose ceiling the head is told about: the whole division at the first publication, then only those that changed. */
export const departmentsToTell = (ceilings: readonly StoredCeiling[]): string[] =>
  ceilings
    .filter((ceiling) => ceiling.publishedTotalMinor === null || ceiling.publishedTotalMinor !== ceiling.totalMinor)
    .map((ceiling) => ceiling.departmentId)
    .sort();

/** The cycle accepts the proposals of its year once it was published, and keeps accepting them while it is changed (`Q-02`). */
export const cycleAcceptsWork = (cycle: { firstPublishedAt: Date | null }): boolean => cycle.firstPublishedAt !== null;

/** A ceiling as the audit record shows it: the three parts, their total and the explanation. */
export interface CeilingFigures extends CeilingParts {
  explanation: string | null;
}

/** The ceilings whose parts or explanation differ between two divisions, by department: what the audit record shows before and after. */
export function changedCeilings(
  before: readonly StoredCeiling[],
  after: readonly (CeilingFigures & { departmentId: string })[],
): { departmentId: string; before: CeilingFigures | null; after: CeilingFigures | null }[] {
  const was = new Map(before.map((ceiling) => [ceiling.departmentId, ceiling]));
  const now = new Map(after.map((ceiling) => [ceiling.departmentId, ceiling]));
  const same = (a: CeilingFigures, b: CeilingFigures) =>
    a.signedCommitmentsMinor === b.signedCommitmentsMinor &&
    a.plannedSeatsMinor === b.plannedSeatsMinor &&
    a.priorityMinor === b.priorityMinor &&
    (a.explanation ?? null) === (b.explanation ?? null);
  const ids = [...new Set([...was.keys(), ...now.keys()])].sort();

  return ids.flatMap((departmentId) => {
    const a = was.get(departmentId) ?? null;
    const b = now.get(departmentId) ?? null;

    return a !== null && b !== null && same(a, b) ? [] : [{ departmentId, before: a, after: b }];
  });
}

/**
 * What an update of a cycle makes of it: the two deadlines (each the update gives, else the stored one), whether the annual ceiling
 * is a new one, and whether anything at all changes (an update that changes nothing is answered without a write or a record).
 */
export function planUpdate(
  update: { submissionDeadline?: string; decisionDeadline?: string; priorities?: string | null },
  stored: {
    submissionDeadline: string;
    decisionDeadline: string;
    annualCeilingMinor: bigint;
    priorities: string | null;
  },
  ceiling: bigint | undefined,
): { submission: string; decision: string; ceilingChanged: boolean; changes: boolean } {
  const submission = update.submissionDeadline ?? stored.submissionDeadline;
  const decision = update.decisionDeadline ?? stored.decisionDeadline;
  const ceilingChanged = ceiling !== undefined && ceiling !== stored.annualCeilingMinor;
  const priorities = update.priorities !== undefined ? update.priorities : stored.priorities;
  const changes =
    ceilingChanged ||
    submission !== stored.submissionDeadline ||
    decision !== stored.decisionDeadline ||
    priorities !== stored.priorities;

  return { submission, decision, ceilingChanged, changes };
}

/** A ceiling as the Audit Trail keeps it: every figure as text, the total and the explanation. */
export const ceilingAuditValue = (figures: CeilingFigures) => ({
  signedCommitmentsMinor: figures.signedCommitmentsMinor.toString(),
  plannedSeatsMinor: figures.plannedSeatsMinor.toString(),
  priorityMinor: figures.priorityMinor.toString(),
  totalMinor: ceilingTotal(figures).toString(),
  explanation: figures.explanation,
});

/**
 * Where a department may be made (`QĐ-104e(3)`, `R-I10`): while the cycle of the next year exists and was never published, the new
 * department takes effect on 1 January of that year. A cycle of this year does not open the window (no department is made in the
 * middle of a year); an organization with no cycle at all is still being installed.
 */
export function windowOf(input: {
  nextYear: number;
  nextCycle: { neverPublished: boolean } | null;
  anyCycle: boolean;
}): { kind: 'OPEN'; effectiveFrom: string } | { kind: 'CLOSED' } | { kind: 'NO_CYCLE_YET' } {
  if (input.nextCycle) {
    return input.nextCycle.neverPublished
      ? { kind: 'OPEN', effectiveFrom: `${input.nextYear}-01-01` }
      : { kind: 'CLOSED' };
  }

  return input.anyCycle ? { kind: 'CLOSED' } : { kind: 'NO_CYCLE_YET' };
}

/**
 * Whether a change of a division changes a number a head was told: a part of a ceiling, a department added or taken out, or the
 * reserve. A change of the explanation alone does not take the publication back (`R-I04`); the audit record still shows it.
 */
export function changesNumbers(
  changes: readonly { before: CeilingFigures | null; after: CeilingFigures | null }[],
  reserveChanged: boolean,
): boolean {
  return (
    reserveChanged ||
    changes.some(
      ({ before, after }) =>
        before === null ||
        after === null ||
        before.signedCommitmentsMinor !== after.signedCommitmentsMinor ||
        before.plannedSeatsMinor !== after.plannedSeatsMinor ||
        before.priorityMinor !== after.priorityMinor,
    )
  );
}

/** Whether a division leaves a ceiling with no explanation: it cannot stay published, because it could not be published (W2-N4, QT 4.3). */
export const leavesUnexplained = (rows: readonly { explanation: string | null }[]): boolean =>
  rows.some((row) => (row.explanation ?? '').trim() === '');

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
