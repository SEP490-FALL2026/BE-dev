import type { AccessRequestState } from './access-request.types';
import type { SpendStage } from '../spend/spend-status.service';

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
const HEAD_MAY_WITHDRAW_AT: readonly SpendStage[] = ['BLOCKED', 'RETURNED_BY_FINANCE', 'WAITING_BUDGET'];

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
