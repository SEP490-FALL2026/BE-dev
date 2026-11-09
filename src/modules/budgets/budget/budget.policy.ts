import type { BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import type { LineType, ZbbExplanation } from './budget-line-zbb.json';

/**
 * The rules of budget proposals and versions (`US-06-09`, `US-06-10`), as pure decisions: what a line must say, which
 * years still take a proposal, which proposals may be withdrawn or given back, how a version is added up, and which change
 * to a line of the current budget is a move of its window and which is a new version.
 */

/** The longest reason, comment or note of a line or an edit, in characters: the form and the file import judge the same. */
export const REASON_MAX = 1000;
/** The longest description of a line, in characters: the form and the file import judge the same. */
export const LINE_DESCRIPTION_MAX = 200;

/**
 * Whether a fiscal year still takes a proposal or a version: the year that is running and the years to come do, a year
 * that has ended does not (`US-06-10` AC-9, `US-06-09` AC-11).
 */
export const yearIsOpen = (year: number, today: BusinessDate): boolean => year >= fiscalYearOf(today);

/**
 * Whether a line is a saving that is shown and not counted: a `CANCEL` line gives up spend, so its amount is never added to the total of
 * the proposal, the package or the ceiling check (`QĐ-109c`, C4-16).
 */
export const isNotCounted = (line: { lineType: LineType }): boolean => line.lineType === 'CANCEL';

/** The sum a proposal is worth: every line but the `CANCEL` ones (`QĐ-109c`). */
export const countedTotalOf = (lines: readonly { lineType: LineType; amountMinor: bigint }[]): bigint =>
  lines.reduce((sum, line) => (isNotCounted(line) ? sum : sum + line.amountMinor), 0n);

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
export const yearHasEnded = (year: number, today: BusinessDate): boolean => !yearIsOpen(year, today);

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
  lineType: LineType;
}

const ADJUSTABLE_FIELDS = [
  'description',
  'planId',
  'seats',
  'amountMinor',
  'lineType',
] as const satisfies readonly (keyof LineFields)[];

/** Whether the patch changes what the line of the proposal said: its words, its money, its window, its service or its cycle. */
export function patchChangesLine(line: LineFields, patch: Partial<LineFields>): boolean {
  return ADJUSTABLE_FIELDS.some((field) => patch[field] !== undefined && patch[field] !== line[field]);
}

/** The line of a version made from a line before it (of a proposal, or of the current budget): where it came from, and none of the work on it. */
export function copiedLineOf(
  line: {
    description: string;
    planId: string | null;
    seats: number | null;
    amountMinor: bigint;
    lineType: LineType;
    zbb: ZbbExplanation | null;
    priorityRank: number | null;
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
    financeComment: null,
    adjustmentReason: null,
    lineType: line.lineType,
    zbb: line.zbb,
    priorityRank: line.priorityRank,
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

/** The reserve a version has when Finance gives none: `percent` of the base, rounded to the nearest minor unit (`QĐ-98`). */
export const defaultReserveOf = (baseMinor: bigint, percent: number): bigint =>
  (baseMinor * BigInt(percent) + 50n) / 100n;

/** A version whose reserve is not the default share of its base, and says not why (`US-06-09` AC-30); one made before the share was kept asks nothing. */
export const reserveReasonMissing = (version: {
  baseMinor: bigint;
  reserveMinor: bigint;
  reservePercent: number | null;
  reserveReason: string | null;
}): boolean =>
  version.reservePercent !== null &&
  version.reserveMinor !== defaultReserveOf(version.baseMinor, version.reservePercent) &&
  !version.reserveReason;

/** A version as the annual check reads it. */
export interface CountedVersion {
  id: string;
  costCenterId: string;
  number: number;
  baseMinor: bigint;
  reserveMinor: bigint;
  currency: string;
}

/**
 * The versions the annual check adds up (`R-I06`, `QĐ-103i`): the newest of each Cost Center among those sent, asked for changes or
 * approved (the caller reads only those), and the one being sent in the place of its own Cost Center's. A version in another currency
 * than the cycle is not added up with the others: it is named.
 */
export function annualCheck(input: {
  cycleCurrency: string;
  availableMinor: bigint;
  counted: readonly CountedVersion[];
  sending: CountedVersion;
}): { kind: 'OK'; totalMinor: bigint } | { kind: 'OVER'; gapMinor: bigint } | { kind: 'CURRENCY'; currency: string } {
  const newest = new Map<string, CountedVersion>();
  for (const version of input.counted) {
    const kept = newest.get(version.costCenterId);
    if (kept === undefined || version.number > kept.number) newest.set(version.costCenterId, version);
  }
  newest.set(input.sending.costCenterId, input.sending);
  const mismatched = [...newest.values()].find((version) => version.currency !== input.cycleCurrency);
  if (mismatched) return { kind: 'CURRENCY', currency: mismatched.currency };
  const total = [...newest.values()].reduce((sum, version) => sum + version.baseMinor + version.reserveMinor, 0n);

  return total > input.availableMinor
    ? { kind: 'OVER', gapMinor: total - input.availableMinor }
    : { kind: 'OK', totalMinor: total };
}
