import type { DeciderRole as ReadDeciderRole } from '../access-request/access-request.types';

/**
 * The rules of sending a request that costs money on to be decided as spend (`US-06-14`, `US-05-04` AC-12 to AC-16), as pure
 * decisions: which line of the plan a request is attached to, who sends it on, what stops it, and when its day may change.
 * Nothing here reads a budget figure: the head chooses a line or "outside the plan", and the check that follows is another
 * rule (`budget-check.policy.ts`).
 */

/** Why a request stays in the queue of its head when they send it: it says what is missing, never a figure of the budget. */
export type StopReason = 'STALE_COST_EVIDENCE' | 'CLOSED_OR_EXPIRED_BUDGET_PERIOD' | 'PRICE_MISSING' | 'RATE_MISSING';

/**
 * Where a request goes once its need is approved and it costs money: the queue of the head, who sends it on, or straight to
 * the check when nobody can send it (`US-06-14` AC-8). Nobody can when the need was decided by the spending approver, in the place
 * of the head who sent the request (row 2): they would send it to themselves. A department with no head never gets here, since its
 * need step waits (`QĐ-93c`); a request whose need the head decided stays in the queue of the department, even if the head leaves
 * meanwhile (`US-06-14` AC-8).
 */
export function entryFor(input: { deciderRole: ReadDeciderRole }): 'HEAD_QUEUE' | 'DIRECT' {
  return input.deciderRole === 'MANAGER' ? 'HEAD_QUEUE' : 'DIRECT';
}

export type SupplementRefusal =
  /** The request is not in the queue of the head: it is being decided, or has been. */
  | 'NOT_IN_QUEUE'
  | 'NOT_PRICED'
  /** The day is the day it already was. */
  | 'NO_CHANGE';

/**
 * The head changes the day the money goes out, or leaves people of a group out, only on a request that is back in their queue,
 * priced, and only when something changes: another day, or fewer people.
 */
export function checkSupplement(facts: {
  state: string;
  priced: boolean;
  /** The file leaves people of a request for a group out. */
  leavesPeopleOut?: boolean;
}): SupplementRefusal | null {
  if (facts.state !== 'AWAITING_SPEND_SUBMISSION') return 'NOT_IN_QUEUE';
  if (!facts.priced) return 'NOT_PRICED';

  return facts.leavesPeopleOut === true ? null : 'NO_CHANGE';
}

type Priced = {
  status: string;
  expectedSpendOn: string | null;
  budgetYear: number | null;
  amount: { amountMinor: bigint; currency: string } | null;
};

/**
 * What a supplementary file keeps of the request: what it was and what it became, when both are priced with a day, a year and an amount;
 * null when either is not, which the file cannot record (`AccessRequestNotPriceableError`).
 */
export function supplementChangeOf(
  before: Priced,
  after: Priced,
): {
  beforeExpectedSpendOn: string;
  afterExpectedSpendOn: string;
  beforeBudgetYear: number;
  afterBudgetYear: number;
  beforeAmountMinor: bigint;
  afterAmountMinor: bigint;
  currency: string;
} | null {
  if (
    after.status !== 'PRICED' ||
    after.amount === null ||
    after.expectedSpendOn === null ||
    after.budgetYear === null
  ) {
    return null;
  }
  if (before.amount === null || before.expectedSpendOn === null || before.budgetYear === null) return null;

  return {
    beforeExpectedSpendOn: before.expectedSpendOn,
    afterExpectedSpendOn: after.expectedSpendOn,
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
    beforeExpectedSpendOn: string;
    afterExpectedSpendOn: string;
    beforeBudgetYear: number;
    afterBudgetYear: number;
    beforeAmountMinor: bigint;
    afterAmountMinor: bigint;
  },
  dropped: readonly string[],
): { [key: string]: string | number | string[] } {
  return {
    requestId,
    number: saved.number,
    before: saved.beforeExpectedSpendOn,
    after: saved.afterExpectedSpendOn,
    beforeBudgetYear: saved.beforeBudgetYear,
    afterBudgetYear: saved.afterBudgetYear,
    beforeAmountMinor: saved.beforeAmountMinor.toString(),
    afterAmountMinor: saved.afterAmountMinor.toString(),
    droppedEmployeeIds: [...dropped],
  };
}
