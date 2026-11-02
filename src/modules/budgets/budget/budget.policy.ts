import type { BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';

/**
 * The rules of budget proposals and versions (`US-06-09`, `US-06-10`), as pure decisions: what a line must say, which
 * years still take a proposal, which proposals may be withdrawn or given back, how a version is added up, and which change
 * to a line of the current budget is a move of its window and which is a new version.
 */

export type RepeatCycle = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ONE_TIME';

/** The longest reason, comment or note of a line or an edit, in characters: the form and the file import judge the same. */
export const REASON_MAX = 1000;
/** The longest description of a line, in characters: the form and the file import judge the same. */
export const LINE_DESCRIPTION_MAX = 200;

/** A line as the head or Finance gives it; the fields `QĐ-82d` asks of every line may still be missing. */
export interface LineDraft {
  description: string;
  amountMinor: bigint;
  windowFrom?: BusinessDate | undefined;
  windowTo?: BusinessDate | undefined;
  servicePeriodMonths?: number | undefined;
  repeatCycle?: RepeatCycle | undefined;
}

export interface CompleteLine {
  windowFrom: BusinessDate;
  windowTo: BusinessDate;
  servicePeriodMonths: number;
  repeatCycle: RepeatCycle;
}

/** The fields of a line still to give: where it is bought, for how long it serves, and how it repeats (`QĐ-82d`). */
export function missingLineFields(
  line: Pick<LineDraft, 'windowFrom' | 'windowTo' | 'servicePeriodMonths' | 'repeatCycle'>,
): string[] {
  const missing: string[] = [];
  if (line.windowFrom === undefined) missing.push('windowFrom');
  if (line.windowTo === undefined) missing.push('windowTo');
  if (line.servicePeriodMonths === undefined) missing.push('servicePeriodMonths');
  if (line.repeatCycle === undefined) missing.push('repeatCycle');

  return missing;
}

export interface IncompleteLine {
  /** The line, counted from one. */
  line: number;
  fields: string[];
}

/** Every line that lacks something, so the sender learns all of it at once (`US-06-10` AC-2). */
export function incompleteLines(lines: readonly LineDraft[]): IncompleteLine[] {
  return lines.flatMap((line, index) => {
    const fields = missingLineFields(line);

    return fields.length > 0 ? [{ line: index + 1, fields }] : [];
  });
}

/** The lines that end before they begin: the purchase window runs forwards. */
export function backwardLines(lines: readonly Pick<LineDraft, 'windowFrom' | 'windowTo'>[]): number[] {
  return lines.flatMap((line, index) =>
    line.windowFrom !== undefined && line.windowTo !== undefined && line.windowTo < line.windowFrom ? [index + 1] : [],
  );
}

/**
 * Whether a fiscal year still takes a proposal or a version: the year that is running and the years to come do, a year
 * that has ended does not (`US-06-10` AC-9, `US-06-09` AC-11).
 */
export const yearIsOpen = (year: number, today: BusinessDate, fiscalYearStartMonth: number): boolean =>
  year >= fiscalYearOf(today, fiscalYearStartMonth);

export const totalOf = (lines: readonly { amountMinor: bigint }[]): bigint =>
  lines.reduce((sum, line) => sum + line.amountMinor, 0n);

/** The forecast by quarter adds up to the total of the version, or there is none; it never limits a payment (`US-06-09` AC-6). */
export function quartersMatch(totalMinor: bigint, quarters: readonly [bigint, bigint, bigint, bigint]): boolean {
  return (
    quarters.every((quarter) => quarter >= 0n) && quarters.reduce((sum, quarter) => sum + quarter, 0n) === totalMinor
  );
}

/** `CLOSED_FISCAL_YEAR_ENDED` is written by the year-end closure only (`QĐ-91c`). */
export type ProposalState = 'SUBMITTED' | 'WITHDRAWN' | 'RETURNED' | 'REVIEWED' | 'CLOSED_FISCAL_YEAR_ENDED';

/** `EXPIRED` is written by the year-end closure only (`QĐ-91c`): the reference budget of the year, or a version that never became current. */
export type VersionStateName =
  'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SUPERSEDED' | 'EXPIRED';

/** A proposal can be taken back until Finance has sent a version made from it (`US-06-10` AC-4). */
export const canWithdraw = (state: ProposalState): boolean => state === 'SUBMITTED';

/** Finance gives a proposal back while it waits for them; one already reviewed or taken back is not given back. */
export const canReturn = (state: ProposalState): boolean => state === 'SUBMITTED';

/** A proposal that was given back is corrected and sent again as a new one (`US-06-10` AC-5). */
export const canResubmit = (state: ProposalState): boolean => state === 'RETURNED';

/**
 * Whether a version can still be changed by Finance: while it is a draft or was sent back to them, and not detached from a
 * proposal that was withdrawn or given back (`QĐ-91a`): that draft only waits for its year to end.
 */
export const isEditable = (state: VersionStateName, detached = false): boolean =>
  !detached && (state === 'DRAFT' || state === 'CHANGES_REQUESTED');

export interface LineChange {
  amountMinor?: bigint | undefined;
  windowFrom?: BusinessDate | undefined;
  windowTo?: BusinessDate | undefined;
}

/**
 * What a change to a line of the current budget amounts to (`US-06-09` AC-17): moving the purchase window keeps the money
 * and is recorded with its reason; changing the amount, even only to update a price, is a new version that goes the whole
 * way to the spending approver again (`INV-21`).
 */
export function kindOfChange(
  line: { amountMinor: bigint; windowFrom: BusinessDate; windowTo: BusinessDate },
  change: LineChange,
): 'NONE' | 'WINDOW' | 'AMOUNT' {
  if (change.amountMinor !== undefined && change.amountMinor !== line.amountMinor) return 'AMOUNT';
  const movesFrom = change.windowFrom !== undefined && change.windowFrom !== line.windowFrom;
  const movesTo = change.windowTo !== undefined && change.windowTo !== line.windowTo;

  return movesFrom || movesTo ? 'WINDOW' : 'NONE';
}

export type DecisionRefusal = 'NOT_SPENDING_APPROVER' | 'CONFLICT_OF_INTEREST' | 'OWN_VERSION' | 'NOT_SENT';

/**
 * Whether the person may decide the version now (`US-06-11`): only the person who decides it does (`US-06-11` AC-8), which is
 * the spending approver and nobody else (`QĐ-93d`(1)); never a version they built or sent (`SoD-8`, AC-7), and only one that was
 * sent and waits. The first reason is the one to tell.
 */
export function checkVersionDecision(facts: {
  actorIsDecider: boolean;
  /**
   * The actor is the spending approver and a party to the version: a version made from their own proposal, which a proposal sent
   * by the approver was possible before `QĐ-93`. Nobody decides it now (`SoD-8`); the Super Admin is told by the conversion command.
   */
  actorHasConflict: boolean;
  actorEmployeeId: string;
  createdByEmployeeId: string;
  sentByEmployeeId: string | null;
  state: VersionStateName;
}): DecisionRefusal | null {
  if (!facts.actorIsDecider) return facts.actorHasConflict ? 'CONFLICT_OF_INTEREST' : 'NOT_SPENDING_APPROVER';
  if (facts.actorEmployeeId === facts.createdByEmployeeId || facts.actorEmployeeId === facts.sentByEmployeeId) {
    return 'OWN_VERSION';
  }

  return facts.state === 'SENT' ? null : 'NOT_SENT';
}

/** A line is overdue when the window it was planned to be bought in has gone by. */
export const isOverdue = (line: { windowTo: BusinessDate }, today: BusinessDate): boolean => line.windowTo < today;

/**
 * Who decides a version now, as `decide` finds it (`QĐ-93d`(1)): the spending approver who works, and nobody else — no substitute
 * takes their place. When the approver is the one who sent the proposal behind the version (data of before `QĐ-93`) nobody decides
 * it: `approverIsParty` says so, and the approver is refused with `CONFLICT_OF_INTEREST` (`SoD-8`). The employee is null too while
 * the role has no holder who works.
 */
export function deciderOf(
  spendingApproverEmployeeId: string | null,
  proposalSubmittedBy: string | null,
): { employeeId: string | null; approverIsParty: boolean } {
  const approverIsParty =
    proposalSubmittedBy !== null &&
    spendingApproverEmployeeId !== null &&
    proposalSubmittedBy === spendingApproverEmployeeId;

  return { approverIsParty, employeeId: approverIsParty ? null : spendingApproverEmployeeId };
}

/** What a version that was sent waits for when nobody who works holds the role of the spending approver (`US-06-11` AC-12). */
export function versionWaitingReason(
  state: VersionStateName,
  usableSpendingApproverEmployeeId: string | null,
): 'NO_SPENDING_APPROVER' | null {
  return state === 'SENT' && usableSpendingApproverEmployeeId === null ? 'NO_SPENDING_APPROVER' : null;
}

/** Whether the fiscal year has ended, so that nothing of it is written any more (`QĐ-91c`, `US-06-09` AC-11, `US-06-10` AC-9). */
export const yearHasEnded = (year: number, today: BusinessDate, fiscalYearStartMonth: number): boolean =>
  !yearIsOpen(year, today, fiscalYearStartMonth);

/**
 * What a version becomes when its fiscal year ends (`QĐ-91c`, `QĐ-91e`): the current one stays as the reference budget of the
 * year, one that was being built or waited for a decision is closed as one that never became current; the others are left.
 */
export function yearEndOfVersion(state: VersionStateName): { neverCurrent: boolean } | null {
  if (state === 'APPROVED') return { neverCurrent: false };

  return state === 'DRAFT' || state === 'SENT' || state === 'CHANGES_REQUESTED' ? { neverCurrent: true } : null;
}

/** A proposal that was sent or given back and not yet used for a version is closed when its year ends (`QĐ-91e`). */
export const closesAtYearEnd = (state: ProposalState): boolean => state === 'SUBMITTED' || state === 'RETURNED';

/**
 * How a version is built from a proposal: the first one from a proposal that waits (`FIRST`), or a new one from a
 * proposal that stayed reviewed because the version made from it was refused and nobody has taken its place (`AFTER_REFUSAL`).
 */
export type VersionSource = 'FIRST' | 'AFTER_REFUSAL';

export function versionSourceOf(
  proposal: { state: ProposalState; succeededAt: Date | null },
  latestVersionState: VersionStateName | null,
): VersionSource | null {
  if (proposal.state === 'SUBMITTED') return 'FIRST';

  return proposalIsSucceedable(proposal, latestVersionState) ? 'AFTER_REFUSAL' : null;
}

/** A head sends a new proposal as the successor of a reviewed proposal whose latest version was refused and which has none (J.1). */
export const proposalIsSucceedable = (
  proposal: { state: ProposalState; succeededAt: Date | null },
  latestVersionState: VersionStateName | null,
): boolean => proposal.state === 'REVIEWED' && proposal.succeededAt === null && latestVersionState === 'REJECTED';

/** What each decision of the spending approver on a version is recorded as, and the state the version goes to (`US-06-11`). */
export function decisionOutcomeOf(decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES'): {
  decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  state: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
} {
  switch (decision) {
    case 'APPROVE':
      return { decision: 'APPROVED', state: 'APPROVED' };
    case 'REJECT':
      return { decision: 'REJECTED', state: 'REJECTED' };
    case 'REQUEST_CHANGES':
      return { decision: 'CHANGES_REQUESTED', state: 'CHANGES_REQUESTED' };
  }
}

/** What the audit entry `BUDGET_VERSION.<decision>` says: the version, what it replaced (amounts as text), and the reason when one was given. */
export function versionDecidedDetail(
  version: { costCenterId: string; year: number; totalMinor: bigint },
  previous: { totalMinor: bigint } | undefined,
  reason: string | null | undefined,
): { [key: string]: string | number | null } {
  return {
    costCenterId: version.costCenterId,
    year: version.year,
    totalMinor: version.totalMinor.toString(),
    previousTotalMinor: previous?.totalMinor.toString() ?? null,
    ...(reason ? { reason } : {}),
  };
}

/** What the audit entry `BUDGET_COMMITMENT.ATTACHED` says of a commitment that waited for a budget and was attached to the approved version. */
export function commitmentAttachedAfter(
  commitment: { requestId: string; amountMinor: bigint },
  to: { versionId: string; costCenterId: string; year: number },
): { [key: string]: string | number } {
  return {
    requestId: commitment.requestId,
    versionId: to.versionId,
    costCenterId: to.costCenterId,
    year: to.year,
    amountMinor: commitment.amountMinor.toString(),
  };
}

/** The fields of a line of a version that an adjustment can change. */
export interface LineFields {
  description: string;
  planId: string | null;
  seats: number | null;
  amountMinor: bigint;
  windowFrom: string;
  windowTo: string;
  servicePeriodMonths: number;
  repeatCycle: string;
  quoteValidUntil: string | null;
}

const ADJUSTABLE_FIELDS = [
  'description',
  'planId',
  'seats',
  'amountMinor',
  'windowFrom',
  'windowTo',
  'servicePeriodMonths',
  'repeatCycle',
  'quoteValidUntil',
] as const satisfies readonly (keyof LineFields)[];

/** Whether the patch changes what the line of the proposal said: its words, its money, its window, its service or its cycle. */
export function patchChangesLine(line: LineFields, patch: Partial<LineFields>): boolean {
  return ADJUSTABLE_FIELDS.some((field) => patch[field] !== undefined && patch[field] !== line[field]);
}

/** The line of a version made from a line before it (of a proposal, or of the current budget): where it came from, and none of the work on it. */
export function copiedLineOf<R extends string>(
  line: {
    description: string;
    planId: string | null;
    seats: number | null;
    amountMinor: bigint;
    windowFrom: string;
    windowTo: string;
    servicePeriodMonths: number;
    repeatCycle: R;
    quoteValidUntil: string | null;
  },
  origin: { proposalId: string | null; proposalPosition: number | null },
) {
  return {
    proposalId: origin.proposalId,
    proposalPosition: origin.proposalPosition,
    description: line.description,
    planId: line.planId,
    seats: line.seats,
    amountMinor: line.amountMinor,
    windowFrom: line.windowFrom,
    windowTo: line.windowTo,
    servicePeriodMonths: line.servicePeriodMonths,
    repeatCycle: line.repeatCycle,
    quoteValidUntil: line.quoteValidUntil,
    financeComment: null,
    adjustmentReason: null,
  };
}

/**
 * Whether the quarters, as they are after an edit, no longer add up to the base and the reserve as they are after it (`QĐ-82e`): the total
 * of the edit when it gives one, the version's when it does not; quarters taken away have nothing to keep honest.
 */
export function quartersMismatchAfter(
  version: { baseMinor: bigint; reserveMinor: bigint; quarters: [bigint, bigint, bigint, bigint] | null },
  next: { baseMinor?: bigint; reserveMinor?: bigint; quarters?: [bigint, bigint, bigint, bigint] | null },
): boolean {
  const total = (next.baseMinor ?? version.baseMinor) + (next.reserveMinor ?? version.reserveMinor);
  const quarters = next.quarters === undefined ? version.quarters : next.quarters;

  return quarters !== null && !quartersMatch(total, quarters);
}
