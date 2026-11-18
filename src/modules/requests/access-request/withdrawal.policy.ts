import type { AccessRequestState, SpendStage } from './access-request.types';

/**
 * Why a request is not withdrawn (`US-05-08`, `US-06-14` AC-14). `NOT_REQUESTER` is also the answer to the person it is for
 * when a head sent it for them (`AC-8`) and to anyone but the requester.
 */
export type WithdrawalRefusal =
  | 'NOT_REQUESTER'
  /** A head withdraws with a reason, and the requester may; a head's blank reason is refused (`US-06-14` AC-14). */
  | 'REASON_REQUIRED'
  /** Refused, rejected, completed, failed, already withdrawn or cancelled: nothing is left to withdraw. */
  | 'ALREADY_ENDED'
  /** The requester already withdrew and the request waits for the IT Admin to close the task of its grant. */
  | 'WITHDRAWAL_PENDING'
  /** The task of the grant is being worked: ask again when it has a result (`AC-3`). */
  | 'GRANT_RUNNING'
  /** The seat is real: the way back is a return (`AC-3`, `US-05-13`). */
  | 'GRANT_COMPLETED';

/** The stages of a request that costs money in which its head may withdraw it (`FR-3.20`, `FR-3.21`, `QĐ-82n` B). */
const HEAD_MAY_WITHDRAW_AT: readonly SpendStage[] = ['BLOCKED', 'RESERVE_CONFIRMATION'];

export interface WithdrawalFacts {
  actorEmployeeId: string;
  requesterEmployeeId: string;
  /** The actor heads the department of the request today. */
  actorHeadsDepartment: boolean;
  state: AccessRequestState;
  /** Where the request stands on its way to the spending approver; null for a request that costs nothing. */
  spendStage: SpendStage | null;
  reason: string | null;
}

/** Whether the head of the department may withdraw the request now: only where the head is the one who can act on it. */
export function headMayWithdraw(spendStage: SpendStage | null): boolean {
  return spendStage !== null && HEAD_MAY_WITHDRAW_AT.includes(spendStage);
}

const ENDED: readonly AccessRequestState[] = ['REJECTED', 'IT_REJECTED', 'FAILED', 'WITHDRAWN', 'CANCELLED'];

/**
 * Whether the request may be withdrawn by this person: the requester, always while the request waits or its grant is not
 * carried out; the head of the department, with a reason, only in the stages the head has to act on (`AC-4`). The tasks of the
 * grant are judged by licensing, in the transaction.
 */
export function checkWithdrawal(facts: WithdrawalFacts): WithdrawalRefusal | null {
  const byRequester = facts.actorEmployeeId === facts.requesterEmployeeId;
  const byHead = !byRequester && facts.actorHeadsDepartment && headMayWithdraw(facts.spendStage);
  if (!byRequester && !byHead) return 'NOT_REQUESTER';

  if (facts.state === 'COMPLETED') return 'GRANT_COMPLETED';
  if (facts.state === 'AWAITING_IT_CLOSE') return 'WITHDRAWAL_PENDING';
  if (ENDED.includes(facts.state)) return 'ALREADY_ENDED';
  if (byHead && (facts.reason === null || facts.reason.trim() === '')) return 'REASON_REQUIRED';

  return null;
}

/**
 * What the cancellation of the grant of a request answers that stops the withdrawal (`US-05-08`, `US-05-13`): a task being worked refuses, a
 * task that is done sends the person to the return of the seat it made, a task that ended refuses; anything else lets the request go on.
 */
export function grantCancelRefusal(grant: {
  status: string;
  assignmentId?: string;
}): { reason: 'GRANT_RUNNING' | 'GRANT_COMPLETED' | 'ALREADY_ENDED'; details: { assignmentId: string } | null } | null {
  if (grant.status === 'RUNNING') return { reason: 'GRANT_RUNNING', details: null };
  if (grant.status === 'COMPLETED') {
    return { reason: 'GRANT_COMPLETED', details: { assignmentId: grant.assignmentId as string } };
  }
  if (grant.status === 'ENDED') return { reason: 'ALREADY_ENDED', details: null };

  return null;
}

/**
 * The audit entry of a withdrawal: the request ended as withdrawn, or (`waiting` given) it waits as `AWAITING_IT_CLOSE` for the IT Admin to
 * close the task of a grant that failed, and only then does it end.
 */
export function withdrawalAuditOf(
  request: { id: string; requesterEmployeeId: string },
  by: { from: string; actorEmployeeId: string; reason: string | null },
  waiting: { taskId: string } | null,
): { action: string; detail: { [key: string]: string | boolean | null } } {
  if (waiting) {
    return {
      action: 'ACCESS_REQUEST.WITHDRAWAL_REQUESTED',
      detail: { requestId: request.id, from: by.from, to: 'AWAITING_IT_CLOSE', taskId: waiting.taskId },
    };
  }

  return {
    action: 'ACCESS_REQUEST.WITHDRAWN',
    detail: {
      requestId: request.id,
      from: by.from,
      to: 'WITHDRAWN',
      byRequester: by.actorEmployeeId === request.requesterEmployeeId,
      withdrawnByEmployeeId: by.actorEmployeeId,
      reason: by.reason,
    },
  };
}
