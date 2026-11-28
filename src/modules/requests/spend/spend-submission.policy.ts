import { termEndOf, termRuleOf, type TermKind } from '../../../core/term-limit';
import { currentMissingReasonOf } from '../access-request/access-request.policy';

/**
 * The rules of sending a request that costs money on to be decided as spend (`US-06-14`, `US-05-04` AC-12 to AC-16), as pure
 * decisions: which line of the plan a request is attached to, who sends it on, what stops it, and when its day may change.
 * Nothing here reads a budget figure: the head chooses a line or "outside the plan", and the check that follows is another
 * rule (`budget-check.policy.ts`).
 */

/**
 * Why a request stays in the queue of its head when they send it: it says what is missing or why it is blocked, never a figure of the
 * budget. The first reason of the check is kept here (the head reads them all on the request); the two codes of the data of a batch made
 * before the three outcomes are read, never given. `RATE_MISSING` of a batch made before `QĐ-111an` is read as `PRICE_MISSING`.
 */
export type StopReason =
  | 'PRICE_MISSING'
  | 'PRICE_EXPIRED'
  | 'NO_APPROVED_BUDGET'
  | 'OVER_RESERVE'
  | 'STALE_COST_EVIDENCE'
  | 'CLOSED_OR_EXPIRED_BUDGET_PERIOD'
  | 'REPLY_NOTE_REQUIRED';

/** The stop reason of a batch item as it is stored: `RATE_MISSING` of a batch made before `QĐ-111an` is read as `PRICE_MISSING`. */
export function stopReasonOf(stored: string | null): StopReason | null {
  return stored === null ? null : (currentMissingReasonOf(stored) as StopReason);
}

export type SupplementRefusal =
  /** The request is not in the queue of the head: it is being decided, or has been. */
  | 'NOT_IN_QUEUE'
  | 'NOT_PRICED'
  /** The file changes nothing: no person left out and no earlier end date. */
  | 'NO_CHANGE'
  /** The time of use is not shorter than the one the request has (a right with no end is longer than any). */
  | 'TERM_NOT_REDUCED'
  /** The time of use is not 1 to 12 whole months (1 to 9 for a plan bought by the month). */
  | 'TERM_MONTHS_OUT_OF_RANGE'
  /** The plan is bought once: it takes no time of use. */
  | 'TERM_NOT_ASKED';

type SupplementTerm = NonNullable<Parameters<typeof checkSupplement>[0]['term']>;

/** The months a file asks for are months the kind of the plan takes, and fewer than the request has (`QĐ-111i`, `L2-38`). */
function checkSupplementTerm(term: SupplementTerm): SupplementRefusal | null {
  const { requested, current, kind, endDate } = term;
  const rule = termRuleOf(kind);
  if (!rule.asked) return 'TERM_NOT_ASKED';
  if (!Number.isInteger(requested) || requested < 1 || requested > rule.maxMonths) return 'TERM_MONTHS_OUT_OF_RANGE';
  if (endDate) return termEndOf(endDate.today, requested) < endDate.end ? null : 'TERM_NOT_REDUCED';

  return current !== null && requested >= current ? 'TERM_NOT_REDUCED' : null;
}

/**
 * The head shortens the term, or leaves people of a group out, only on a request that is back in their queue, priced, and only
 * when something is reduced: fewer months of use, or fewer people (`L2-38`, `P1-06`, `QĐ-111i`).
 */
export function checkSupplement(facts: {
  state: string;
  priced: boolean;
  /** The file leaves people of a request for a group out. */
  leavesPeopleOut?: boolean;
  /**
   * The months of use the file asks for, when it asks for them, with the kind of the plan, and the months the request has (null: a right with no
   * end). A request of an older release carries a day and no months: `endDate` is that day and the day the file is made, and the months must end
   * sooner than it.
   */
  term?: {
    requested: number;
    current: number | null;
    kind: TermKind;
    endDate?: { today: string; end: string };
  };
}): SupplementRefusal | null {
  if (facts.state !== 'AWAITING_SPEND_SUBMISSION' && facts.state !== 'AWAITING_REQUESTER_REVISION')
    return 'NOT_IN_QUEUE';
  if (!facts.priced) return 'NOT_PRICED';
  if (facts.term) return checkSupplementTerm(facts.term);

  return facts.leavesPeopleOut === true ? null : 'NO_CHANGE';
}

type Priced = {
  status: string;
  expectedEndDate: string | null;
  budgetYear: number | null;
  amount: { amountMinor: bigint; currency: string } | null;
};

/**
 * What a supplementary file keeps of the request: what it was and what it became, the end date, the year and the amount; null when
 * either is not priced, which the file cannot record (`AccessRequestNotPriceableError`).
 */
export function supplementChangeOf(
  before: Priced,
  after: Priced,
): {
  beforeExpectedEndDate: string | null;
  afterExpectedEndDate: string | null;
  beforeBudgetYear: number;
  afterBudgetYear: number;
  beforeAmountMinor: bigint;
  afterAmountMinor: bigint;
  currency: string;
} | null {
  if (after.status !== 'PRICED' || after.amount === null || after.budgetYear === null) return null;
  if (before.amount === null || before.budgetYear === null) return null;

  return {
    beforeExpectedEndDate: before.expectedEndDate,
    afterExpectedEndDate: after.expectedEndDate,
    beforeBudgetYear: before.budgetYear,
    afterBudgetYear: after.budgetYear,
    beforeAmountMinor: before.amount.amountMinor,
    afterAmountMinor: after.amount.amountMinor,
    currency: before.amount.currency,
  };
}

/** A line of the plan of another year's budget no longer fits when the year changes: the request is attached again before it is sent. */
/** What the audit entry `ACCESS_REQUEST.SUPPLEMENT_ADDED` says: the file as it was saved (the amounts as text) and who was left out. */
export function supplementAuditDetail(
  requestId: string,
  saved: {
    number: number;
    beforeExpectedEndDate: string | null;
    afterExpectedEndDate: string | null;
    beforeBudgetYear: number;
    afterBudgetYear: number;
    beforeAmountMinor: bigint;
    afterAmountMinor: bigint;
  },
  dropped: readonly string[],
): { [key: string]: string | number | string[] | null } {
  return {
    requestId,
    number: saved.number,
    beforeExpectedEndDate: saved.beforeExpectedEndDate,
    afterExpectedEndDate: saved.afterExpectedEndDate,
    beforeBudgetYear: saved.beforeBudgetYear,
    afterBudgetYear: saved.afterBudgetYear,
    beforeAmountMinor: saved.beforeAmountMinor.toString(),
    afterAmountMinor: saved.afterAmountMinor.toString(),
    droppedEmployeeIds: [...dropped],
  };
}
