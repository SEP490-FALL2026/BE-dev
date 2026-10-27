import type { BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';

/**
 * The rules of budget proposals and versions (`US-06-09`, `US-06-10`), as pure decisions: what a line must say, which
 * years still take a proposal, which proposals may be withdrawn or given back, how a version is added up, and which change
 * to a line of the current budget is a move of its window and which is a new version.
 */

export type RepeatCycle = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'ONE_TIME';

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

/** `CLOSED_FISCAL_YEAR_ENDED` is written by the release after this one (spec L.10): this release reads it and writes none. */
export type ProposalState = 'SUBMITTED' | 'WITHDRAWN' | 'RETURNED' | 'REVIEWED' | 'CLOSED_FISCAL_YEAR_ENDED';

/** A proposal can be taken back until Finance has sent a version made from it (`US-06-10` AC-4). */
export const canWithdraw = (state: ProposalState): boolean => state === 'SUBMITTED';

/** Finance gives a proposal back while it waits for them; one already reviewed or taken back is not given back. */
export const canReturn = (state: ProposalState): boolean => state === 'SUBMITTED';

/** A proposal that was given back is corrected and sent again as a new one (`US-06-10` AC-5). */
export const canResubmit = (state: ProposalState): boolean => state === 'RETURNED';

/** Whether a version can still be changed by Finance: while it is a draft or was sent back to them. */
export const isEditable = (
  state: 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SUPERSEDED' | 'EXPIRED',
): boolean => state === 'DRAFT' || state === 'CHANGES_REQUESTED';

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
 * the spending approver, or the substitute when the approver sent the proposal behind the version (`US-06-08` AC-11); never a
 * version they built or sent (`SoD-8`, AC-7), and only one that was sent and waits. The first reason is the one to tell.
 */
export function checkVersionDecision(facts: {
  actorIsDecider: boolean;
  /** The actor is the spending approver and a party to the version, so the substitute decides in their place. */
  actorHasConflict: boolean;
  actorEmployeeId: string;
  createdByEmployeeId: string;
  sentByEmployeeId: string | null;
  state: 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SUPERSEDED' | 'EXPIRED';
}): DecisionRefusal | null {
  if (!facts.actorIsDecider) return facts.actorHasConflict ? 'CONFLICT_OF_INTEREST' : 'NOT_SPENDING_APPROVER';
  if (facts.actorEmployeeId === facts.createdByEmployeeId || facts.actorEmployeeId === facts.sentByEmployeeId) {
    return 'OWN_VERSION';
  }

  return facts.state === 'SENT' ? null : 'NOT_SENT';
}

/** A line is overdue when the window it was planned to be bought in has gone by. */
export const isOverdue = (line: { windowTo: BusinessDate }, today: BusinessDate): boolean => line.windowTo < today;
