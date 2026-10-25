import { isEnded, type LineState } from './group-request.types';

/**
 * What a request for a group is, as a summary of its lines (`US-05-17`, `US-05-03` AC-14), as a pure decision: the request is the
 * one place that follows the lines, and the lines are what decides. It is waiting for a need while any line waits for it; ready
 * to be sent on as spend when none waits and some are confirmed; being granted while some are approved; and over when every line
 * has ended, with the outcome of the most that was done: a granted person, then a failed grant, then a refusal, then a line the IT Admin
 * closed because the person left, then a withdrawal.
 */

export type GroupStage =
  | { stage: 'WAITING_NEED' }
  | { stage: 'READY_FOR_SPEND' }
  | { stage: 'GRANTING'; state: 'AWAITING_EXECUTION' | 'EXECUTING' }
  | { stage: 'ENDED'; state: 'COMPLETED' | 'FAILED' | 'REJECTED' | 'CANCELLED' | 'WITHDRAWN' };

/** The lines that count for the outcome: a person left out of a file before the spend decision is not a person of the request. */
const COUNTED: readonly LineState[] = [
  'NEED_REJECTED',
  'SPEND_REJECTED',
  'COMPLETED',
  'FAILED',
  'WITHDRAWN',
  'CANCELLED',
  'EXECUTING',
  'AWAITING_IT_CLOSE',
  'APPROVED',
  'NEED_CONFIRMED',
  'AWAITING_NEED',
];

export function summarizeGroup(lines: readonly LineState[], currentState: string): GroupStage {
  const counted = lines.filter((state) => COUNTED.includes(state));
  if (counted.some((state) => state === 'AWAITING_NEED')) return { stage: 'WAITING_NEED' };
  if (counted.some((state) => state === 'NEED_CONFIRMED')) return { stage: 'READY_FOR_SPEND' };

  if (counted.some((state) => !isEnded(state))) {
    // Once a grant has begun the request is being carried out for good, whatever the lines that wait for their turn.
    const begun =
      currentState === 'EXECUTING' ||
      counted.some(
        (state) =>
          state === 'EXECUTING' || state === 'AWAITING_IT_CLOSE' || state === 'COMPLETED' || state === 'FAILED',
      );

    return { stage: 'GRANTING', state: begun ? 'EXECUTING' : 'AWAITING_EXECUTION' };
  }

  if (counted.some((state) => state === 'COMPLETED')) return { stage: 'ENDED', state: 'COMPLETED' };
  if (counted.some((state) => state === 'FAILED')) return { stage: 'ENDED', state: 'FAILED' };
  if (counted.some((state) => state === 'NEED_REJECTED' || state === 'SPEND_REJECTED')) {
    return { stage: 'ENDED', state: 'REJECTED' };
  }
  if (counted.some((state) => state === 'CANCELLED')) return { stage: 'ENDED', state: 'CANCELLED' };

  return { stage: 'ENDED', state: 'WITHDRAWN' };
}
