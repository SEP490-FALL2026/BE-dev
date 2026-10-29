import type { SpendStage } from '../spend/spend-status.service';
import { headMayWithdraw, type WithdrawalRefusal } from '../withdraw/withdrawal.policy';
import type { LineState } from './group-request.types';

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
