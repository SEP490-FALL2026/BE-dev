import { addDays, type BusinessDate } from '../../../core/business-date';
import { addWorkingDays, type NonWorkingDates } from '../../../core/working-days';
import type { GhostSeatState, GhostSeatTier } from '../ghost-seat/ghost-seat.types';

/** The ISO week of a day as `YYYY-Www`: the notice of new recommendations is one for each person each week (`SBF-04` _gộp theo tuần_). */
export function isoWeekKeyOf(day: BusinessDate): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);

  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Only the tiers a head is asked about go to the queue; `MONITOR` is the IT Admin's observation (`QĐ-09`, `DA6-20`). */
export const isRoutedTier = (tier: GhostSeatTier | null): boolean => tier === 'REVIEW' || tier === 'ACTION';

/** The day a decision is due: working days from the day the recommendation entered the queue (`US-10-06` AC-16). */
export const decisionDueOn = (
  enteredOn: BusinessDate,
  workingDays: number,
  nonWorking: NonWorkingDates,
): BusinessDate => addWorkingDays(enteredOn, workingDays, nonWorking);

/** Where a recommendation goes when it enters the queue: the head of the department decides, or the department waits for one (`QĐ-104h`). */
export const queueStateOf = (hasHead: boolean, returned: boolean): GhostSeatState =>
  hasHead ? (returned ? 'RETURNED_TO_HEAD' : 'AWAITING_DECISION') : 'WAITING_FOR_HEAD';

export type HeadWatch =
  { kind: 'KEEP' } | { kind: 'WAIT' } | { kind: 'ASSIGN'; to: 'AWAITING_DECISION' | 'RETURNED_TO_HEAD' };

/**
 * What a recommendation in the queue does when the head of its department changed (`US-10-06` AC-9, `DA6-21`): a department that lost its
 * head makes it wait (the due day is kept), one that has a head again hands it back (to the head as _returned_ when the IT Admin had returned
 * it), and the due day is never set again.
 */
export function headWatchOf(input: { state: GhostSeatState; hasHead: boolean; returnCount: number }): HeadWatch {
  const waiting = input.state === 'WAITING_FOR_HEAD';
  const queued = input.state === 'AWAITING_DECISION' || input.state === 'RETURNED_TO_HEAD';
  if (queued && !input.hasHead) return { kind: 'WAIT' };
  if (waiting && input.hasHead) {
    return { kind: 'ASSIGN', to: input.returnCount === 1 ? 'RETURNED_TO_HEAD' : 'AWAITING_DECISION' };
  }

  return { kind: 'KEEP' };
}

/** What a paused recommendation does once the transfer that paused it is looked at (`QĐ-90c`, `US-10-06` AC-15, AC-19). */
export type ResumeStep = { kind: 'STAY' } | { kind: 'SEAT_REVOKED' } | { kind: 'TO_OPEN' } | { kind: 'TO_QUEUE' };

export function resumeStepOf(input: {
  transferOver: boolean;
  seatStillOpen: boolean;
  tier: GhostSeatTier | null;
}): ResumeStep {
  if (!input.transferOver) return { kind: 'STAY' };
  if (!input.seatStillOpen) return { kind: 'SEAT_REVOKED' };

  return isRoutedTier(input.tier) ? { kind: 'TO_QUEUE' } : { kind: 'TO_OPEN' };
}

/** A transfer is over for the rule once it is cancelled or the IT Admin closed it. */
export const isTransferOver = (transfer: { status: string; closedAt: Date | null }): boolean =>
  transfer.status === 'CANCELLED' || transfer.closedAt !== null;

/** The days the window of non-working dates has to cover so the due day is exact. */
export const CALENDAR_LOOKAHEAD_DAYS = 120;
export const calendarEndOf = (today: BusinessDate): BusinessDate => addDays(today, CALENDAR_LOOKAHEAD_DAYS);
