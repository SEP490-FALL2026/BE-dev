import { isEnded, isSystemCancelCause, type LineRecord, type LineState } from '../access-request/group-request.types';

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

type EndedLine = Pick<
  LineRecord,
  'state' | 'endedAt' | 'endedByEmployeeId' | 'endReason' | 'cancelCause' | 'withdrawalRequestedAt'
>;

/** What the request is written with once every line has ended: the outcome of the most that was done, and what says who closed it and why. */
export type RequestEnding =
  | { kind: 'GRANT_OUTCOME'; outcome: 'COMPLETED' | 'FAILED'; endedAt: Date }
  | {
      kind: 'CANCELLATION';
      cancelledAt: Date;
      /** Null when the last line was closed by the system: nobody closed it, so the sender did not either (`QĐ-110d`). */
      cancelledByEmployeeId: string | null;
      cause: NonNullable<LineRecord['cancelCause']> | 'BENEFICIARY_LEFT';
      note: string | null;
    }
  | { kind: 'WITHDRAWAL'; requestedAt: Date; requestedByEmployeeId: string; reason: string | null; withdrawnAt: Date }
  | { kind: 'STATE'; state: 'REJECTED' };

/** The line that ended last in the state: the person and the day the request is said to have been withdrawn or cancelled by. */
function lastEnded(lines: readonly EndedLine[], state: 'WITHDRAWN' | 'CANCELLED'): EndedLine | null {
  return lines
    .filter((line) => line.state === state && line.endedAt !== null)
    .reduce<EndedLine | null>(
      (latest, line) => (latest === null || (line.endedAt as Date) > (latest.endedAt as Date) ? line : latest),
      null,
    );
}

/** The day the last line ended, or null when none says. */
function lastEnd(lines: readonly EndedLine[]): Date | null {
  return lines.reduce<Date | null>(
    (latest, line) => (line.endedAt !== null && (latest === null || line.endedAt > latest) ? line.endedAt : latest),
    null,
  );
}

/**
 * A request cancelled by the IT Admin: the last line they closed says who closed the request and why, so it is cancelled by the same hand.
 * When the system closed that line (`QĐ-110d`) nobody closed the request, and the sender is not put in their place.
 */
function cancellationOf(lines: readonly EndedLine[], requesterEmployeeId: string, now: Date): RequestEnding {
  const last = lastEnded(lines, 'CANCELLED');
  const bySystem = last?.cancelCause != null && isSystemCancelCause(last.cancelCause);

  return {
    kind: 'CANCELLATION',
    cancelledAt: last?.endedAt ?? now,
    cancelledByEmployeeId: bySystem ? null : (last?.endedByEmployeeId ?? requesterEmployeeId),
    cause: last?.cancelCause ?? 'BENEFICIARY_LEFT',
    note: last?.endReason ?? null,
  };
}

/** A request withdrawn: asked, and withdrawn, by the last line that ended so. */
function withdrawalOf(lines: readonly EndedLine[], requesterEmployeeId: string, now: Date): RequestEnding {
  const last = lastEnded(lines, 'WITHDRAWN');

  return {
    kind: 'WITHDRAWAL',
    requestedAt: last?.withdrawalRequestedAt ?? last?.endedAt ?? now,
    requestedByEmployeeId: last?.endedByEmployeeId ?? requesterEmployeeId,
    reason: last?.endReason ?? null,
    withdrawnAt: last?.endedAt ?? now,
  };
}

/**
 * What the request is written with when the lines have all ended in `outcome` (`US-05-17`, `US-05-08`): the day of the last end for a
 * grant, and for a cancellation or a withdrawal the person, the day, the cause and the note of the last line that ended so, or the sender
 * and today when none says.
 */
export function requestEndingOf(
  outcome: 'COMPLETED' | 'FAILED' | 'REJECTED' | 'CANCELLED' | 'WITHDRAWN',
  lines: readonly EndedLine[],
  requesterEmployeeId: string,
  now: Date,
): RequestEnding {
  if (outcome === 'COMPLETED' || outcome === 'FAILED') {
    return { kind: 'GRANT_OUTCOME', outcome, endedAt: lastEnd(lines) ?? now };
  }
  if (outcome === 'CANCELLED') return cancellationOf(lines, requesterEmployeeId, now);
  if (outcome === 'WITHDRAWN') return withdrawalOf(lines, requesterEmployeeId, now);

  return { kind: 'STATE', state: outcome };
}
