import type { BusinessDate } from '../../../core/business-date';

/**
 * The rules of sending a request that costs money on to be decided as spend (`US-06-14`, `US-05-04` AC-12 to AC-16), as pure
 * decisions: which line of the plan a request is attached to, who sends it on, what stops it, and when its day may change.
 * Nothing here reads a budget figure: the head chooses a line or "outside the plan", and the check that follows is another
 * rule (`budget-check.policy.ts`).
 */

/** What the head chooses: a line of the plan of the budget, or that the request is outside it (`QĐ-82m` `INF-05a`). */
export type PlanLineChoice = { kind: 'LINE'; position: number; stillNeeded: boolean } | { kind: 'OFF_PLAN' };

export type ChoiceRefusal =
  /** The Cost Center has no line at that position in the budget of the year the money goes out in. */
  | 'LINE_NOT_FOUND'
  /** The window of the line has gone by: it is attached only with the head confirming it is still needed (`AC-13`). */
  | 'STILL_NEEDED_REQUIRED';

export type ChoiceVerdict = { ok: true; confirmed: boolean } | { ok: false; reason: ChoiceRefusal };

/** Whether the choice may be kept: a line must be there, and one that is overdue must be confirmed as still needed. */
export function judgePlanLineChoice(
  choice: PlanLineChoice,
  facts: { line: { windowTo: BusinessDate } | null; today: BusinessDate },
): ChoiceVerdict {
  if (choice.kind === 'OFF_PLAN') return { ok: true, confirmed: false };
  if (facts.line === null) return { ok: false, reason: 'LINE_NOT_FOUND' };
  if (facts.line.windowTo < facts.today && !choice.stillNeeded) return { ok: false, reason: 'STILL_NEEDED_REQUIRED' };

  return { ok: true, confirmed: choice.stillNeeded };
}

/** Why a request stays in the queue of its head when they send it: it says what is missing, never a figure of the budget. */
export type StopReason =
  'PLAN_LINE_REQUIRED' | 'STALE_COST_EVIDENCE' | 'CLOSED_OR_EXPIRED_BUDGET_PERIOD' | 'PRICE_MISSING' | 'RATE_MISSING';

/** A request is sent with a line of the plan or "outside the plan", and with neither it is not (`US-06-14` AC-5). */
export function submissionStop(request: {
  hasPlanLine: boolean;
  offPlan: boolean;
}): Extract<StopReason, 'PLAN_LINE_REQUIRED'> | null {
  return request.hasPlanLine || request.offPlan ? null : 'PLAN_LINE_REQUIRED';
}

export type DeciderRole = 'MANAGER' | 'SPENDING_APPROVER' | 'FALLBACK_APPROVER' | 'CONFLICT_SUBSTITUTE';

/**
 * Where a request goes once its need is approved and it costs money: the queue of the head, who sends it on, or straight to
 * the check when nobody can send it (`US-06-14` AC-8). Nobody can when the need was decided by the fallback approver, who has
 * no queue, or by the spending approver, whether as the head of the department or in the head's place: they would send it to
 * themselves.
 */
export function entryFor(input: {
  deciderRole: DeciderRole;
  deciderEmployeeId: string;
  spendingApproverEmployeeId: string | null;
}): 'HEAD_QUEUE' | 'DIRECT' {
  if (input.deciderRole !== 'MANAGER') return 'DIRECT';

  return input.deciderEmployeeId === input.spendingApproverEmployeeId ? 'DIRECT' : 'HEAD_QUEUE';
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
  currentExpectedSpendOn: BusinessDate | null;
  /** The other day, when the file gives one. */
  newExpectedSpendOn?: BusinessDate;
  /** The file leaves people of a request for a group out. */
  leavesPeopleOut?: boolean;
}): SupplementRefusal | null {
  if (facts.state !== 'AWAITING_SPEND_SUBMISSION') return 'NOT_IN_QUEUE';
  if (!facts.priced) return 'NOT_PRICED';
  const sameDay = facts.newExpectedSpendOn === undefined || facts.currentExpectedSpendOn === facts.newExpectedSpendOn;

  return sameDay && facts.leavesPeopleOut !== true ? 'NO_CHANGE' : null;
}
