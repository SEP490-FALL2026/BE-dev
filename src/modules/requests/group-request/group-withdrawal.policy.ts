import type { AccessRequestState, NeedStepState, SpendStage } from '../access-request/access-request.types';
import { headMayWithdraw, type WithdrawalRefusal } from '../access-request/withdrawal.policy';
import { isEnded, type LineState } from '../access-request/group-request.types';

/**
 * Who withdraws one person of a request for a group, and what that does to the money (`US-05-08`, `US-06-14` AC-14, `US-05-17`
 * AC-10), as pure decisions. The rules are those of withdrawing a request, judged on the line of the person: the sender withdraws
 * while the person has no seat, the head only in the stages the head acts on, and with a reason; a person the request is for
 * is not the sender and does not withdraw their own line.
 */

export interface LineWithdrawalFacts {
  actorEmployeeId: string;
  requesterEmployeeId: string;
  /** The actor heads the department of the request today. */
  actorHeadsDepartment: boolean;
  lineState: LineState;
  /** The need step of the line: `NOT_REQUIRED` when the head who sent the request vouched for the person, so no one decides their need. */
  needStep: NeedStepState;
  /** The state of the whole request: sent back to its sender, every open line may be withdrawn (`QĐ-113d`). */
  requestState: AccessRequestState;
  /** Where the request stands on its way to the spending approver. */
  spendStage: SpendStage | null;
  reason: string | null;
}

/** The first reason the line is not withdrawn, in the order a caller should learn it, or null. */
export function checkLineWithdrawal(facts: LineWithdrawalFacts): WithdrawalRefusal | null {
  const byRequester = facts.actorEmployeeId === facts.requesterEmployeeId;
  const byHead = !byRequester && facts.actorHeadsDepartment && headMayWithdraw(facts.spendStage);
  if (!byRequester && !byHead) return 'NOT_REQUESTER';

  const over = endedRefusal(facts.lineState);
  if (over) return over;
  if (byHead && (facts.reason === null || facts.reason.trim() === '')) return 'REASON_REQUIRED';
  // The sender withdraws a person only before any decision on them (`QĐ-113d`).
  if (byRequester && !lineUndecided(facts) && facts.requestState !== 'AWAITING_REQUESTER_REVISION') {
    return 'WITHDRAWAL_AFTER_DECISION';
  }

  return null;
}

/** The refusal of a line that no longer has anything to withdraw, or null. */
function endedRefusal(state: LineState): WithdrawalRefusal | null {
  if (state === 'COMPLETED') return 'GRANT_COMPLETED';
  if (state === 'AWAITING_IT_CLOSE') return 'WITHDRAWAL_PENDING';

  return isEndedWithoutSeat(state) ? 'ALREADY_ENDED' : null;
}

/** No decision was taken on the person: their need awaits its head, or no one decides it and the spending approver has not decided (`QĐ-113d`). */
export const lineUndecided = (facts: Pick<LineWithdrawalFacts, 'lineState' | 'needStep'>): boolean =>
  facts.lineState === 'AWAITING_NEED' || (facts.lineState === 'NEED_CONFIRMED' && facts.needStep === 'NOT_REQUIRED');

const isEndedWithoutSeat = (state: LineState): boolean =>
  state === 'NEED_REJECTED' ||
  state === 'SPEND_REJECTED' ||
  state === 'FAILED' ||
  state === 'WITHDRAWN' ||
  state === 'DROPPED' ||
  state === 'CANCELLED';

/** Whether the line of the person already holds a part of the commitment, which goes back when they are withdrawn. */
export const holdsMoney = (state: LineState): boolean => state === 'APPROVED' || state === 'EXECUTING';

/** Whether the person has a task of the grant that the withdrawal has to ask licensing about. */
export const hasGrantTask = (state: LineState): boolean => state === 'EXECUTING';

/** What the withdrawal of one line did: it ended, or it waits for the IT Admin to close the task of a grant that had failed. */
export type Withdrawn = { kind: 'ENDED'; released: boolean } | { kind: 'WAITING_FOR_IT'; taskId: string };

/** The shares of every person given back, added up by budget year, in the order the years first appear. */
export function releasedByYear(
  sharesOfEach: readonly (readonly { year: number; amountMinor: bigint }[])[],
): { year: number; amountMinor: bigint }[] {
  const years = new Map<number, bigint>();
  for (const shares of sharesOfEach) {
    for (const share of shares) years.set(share.year, (years.get(share.year) ?? 0n) + share.amountMinor);
  }

  return [...years].map(([year, amountMinor]) => ({ year, amountMinor }));
}

/** The audit entry of one line withdrawn: the action by whether it ended, and what it says of the line, who did it and what went back. */
export function withdrawalAuditOf(
  request: { id: string; requesterEmployeeId: string },
  line: { employeeId: string; state: LineState },
  done: Withdrawn,
  by: { actorEmployeeId: string; reason: string | null },
): { action: string; detail: { [key: string]: string | boolean | null } } {
  const ended = done.kind === 'ENDED';

  return {
    action: ended ? 'ACCESS_REQUEST.LINE_WITHDRAWN' : 'ACCESS_REQUEST.LINE_WITHDRAWAL_REQUESTED',
    detail: {
      requestId: request.id,
      beneficiaryEmployeeId: line.employeeId,
      from: line.state,
      to: ended ? 'WITHDRAWN' : 'AWAITING_IT_CLOSE',
      withdrawnByEmployeeId: by.actorEmployeeId,
      reason: by.reason,
      requesterEmployeeId: request.requesterEmployeeId,
      byRequester: by.actorEmployeeId === request.requesterEmployeeId,
      released: ended && done.released,
      ...(done.kind === 'WAITING_FOR_IT' ? { taskId: done.taskId } : {}),
    },
  };
}

/**
 * The state of the need step that holds a person of a request for a group; a step that is gone counts as decided. A step the sender
 * held and approved by sending (the head confirms the people they send for) is no decision by anyone else: it reads as `NOT_REQUIRED`,
 * so the sender withdraws until the spending approver has decided (`QĐ-113d`).
 */
export function needStepOfLine(
  steps: readonly { id: string; state: NeedStepState; assigneeEmployeeId?: string | null }[],
  line: { needStepId: string },
  requesterEmployeeId: string,
): NeedStepState {
  const step = steps.find((candidate) => candidate.id === line.needStepId);
  if (!step) return 'APPROVED';

  return step.state === 'APPROVED' && step.assigneeEmployeeId === requesterEmployeeId ? 'NOT_REQUIRED' : step.state;
}

/**
 * The need step a request for a group is judged by when all of it is withdrawn, and when the list says whether its sender may
 * (`QĐ-113d`): nobody was decided only while every person who has not ended is undecided (`lineUndecided`); otherwise a decision
 * was taken and the step counts as decided. `fallback` is the step the request waits at (the first open one, else the first).
 * A request for a group is for plans of the catalog: its chain has no IT assessment, so the spending approver decides first.
 */
export function needStepOfGroup(
  steps: readonly { id: string; state: NeedStepState; assigneeEmployeeId?: string | null }[],
  fallback: { state: NeedStepState },
  lines: readonly { state: LineState; needStepId: string }[],
  requesterEmployeeId: string,
): NeedStepState {
  const live = lines.filter((line) => !isEnded(line.state) && line.state !== 'AWAITING_IT_CLOSE');
  if (
    !live.every((line) =>
      lineUndecided({ lineState: line.state, needStep: needStepOfLine(steps, line, requesterEmployeeId) }),
    )
  ) {
    return 'APPROVED';
  }
  if (live.some((line) => line.state === 'AWAITING_NEED')) {
    return (steps.find((step) => step.state === 'PENDING' || step.state === 'WAITING') ?? fallback).state;
  }

  return 'NOT_REQUIRED';
}
