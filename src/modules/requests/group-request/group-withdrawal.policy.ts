import type { SpendStage } from '../access-request/access-request.types';
import { headMayWithdraw, type WithdrawalRefusal } from '../access-request/withdrawal.policy';
import type { LineState } from '../access-request/group-request.types';

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
  /** Where the request stands on its way to the spending approver. */
  spendStage: SpendStage | null;
  reason: string | null;
}

/** The first reason the line is not withdrawn, in the order a caller should learn it, or null. */
export function checkLineWithdrawal(facts: LineWithdrawalFacts): WithdrawalRefusal | null {
  const byRequester = facts.actorEmployeeId === facts.requesterEmployeeId;
  const byHead = !byRequester && facts.actorHeadsDepartment && headMayWithdraw(facts.spendStage);
  if (!byRequester && !byHead) return 'NOT_REQUESTER';

  if (facts.lineState === 'COMPLETED') return 'GRANT_COMPLETED';
  if (facts.lineState === 'AWAITING_IT_CLOSE') return 'WITHDRAWAL_PENDING';
  if (isEndedWithoutSeat(facts.lineState)) return 'ALREADY_ENDED';
  if (byHead && (facts.reason === null || facts.reason.trim() === '')) return 'REASON_REQUIRED';

  return null;
}

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
