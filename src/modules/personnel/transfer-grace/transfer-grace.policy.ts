import { addDays, type BusinessDate } from '../../../core/business-date';
import { nthWorkingDayFrom, subtractWorkingDays, type NonWorkingDates } from '../../../core/working-days';

/** The most calendar days after the day a transfer takes effect that a grace of working days is counted over: ninety days hold them with the days off in between. */
const CALENDAR_WINDOW_DAYS = 90;

/**
 * The last day the person keeps the rights of the old department (`QĐ-110p`, `QĐ-110r`, SPEC T-MF3): the `workingDays`th working day
 * counting the day the transfer takes effect as day 1, or the next working day when that one is a day off. A transfer taking effect on
 * Monday 16/11 with a grace of five working days ends on Friday 20/11; one taking effect on Saturday 14/11 begins on Monday 16/11 and
 * ends on the same Friday. The day after it the system opens the revocation of every right the person still holds.
 */
export function graceEndsOn(
  effectiveOn: BusinessDate,
  workingDays: number,
  nonWorkingDates: NonWorkingDates,
): BusinessDate {
  return nthWorkingDayFrom(effectiveOn, workingDays, nonWorkingDates);
}

/**
 * The day the person is told once more that the rights are about to be taken back (`QĐ-110p`): `reminderWorkingDays` working days before
 * the last day of the grace, never before its first working day (a short grace is told on its first day). The first notice is the one the
 * transfer gives the day it takes effect. A grace ending on Friday 20/11 with two days of notice tells on Wednesday 18/11.
 */
export function graceReminderOn(
  effectiveOn: BusinessDate,
  endsOn: BusinessDate,
  reminderWorkingDays: number,
  nonWorkingDates: NonWorkingDates,
): BusinessDate {
  const firstDay = nthWorkingDayFrom(effectiveOn, 1, nonWorkingDates);
  const before = subtractWorkingDays(endsOn, reminderWorkingDays, nonWorkingDates);

  return before < firstDay ? firstDay : before;
}

/** The last day whose days off the grace needs: the caller reads the non-working dates from the day the transfer takes effect to here. */
export function graceWindowEnd(effectiveOn: BusinessDate): BusinessDate {
  return addDays(effectiveOn, CALENDAR_WINDOW_DAYS);
}

/**
 * The day the grace begins (`QĐ-110p`, m-17): the day the transfer takes effect (day 1), unless the system only notes it later. A transfer
 * that took effect before the release that brought the grace begins it on the day of the release, and one the system sees days after its
 * day (it was not running) begins it on the day it sees it, so the person is never given less than the grace the rule promises.
 */
export function graceStartsOn(effectiveOn: BusinessDate, notedOn: BusinessDate): BusinessDate {
  return notedOn > effectiveOn ? notedOn : effectiveOn;
}

/** The three days of the grace of one transfer. */
export interface TransferGrace {
  /** Day 1 of the grace (a Saturday or Sunday here makes the first working day the Monday after). */
  startsOn: BusinessDate;
  /** The last day the person keeps the rights of the old department. */
  endsOn: BusinessDate;
  /** The day the person is told once more that the rights are about to be taken back. */
  reminderOn: BusinessDate;
}

/** What {@link graceOf} reads: the two parameters and the days off, from the day the grace begins to {@link graceWindowEnd}. */
export interface GraceInput {
  effectiveOn: BusinessDate;
  /** The day the system opens the grace (today when the transfer is being settled). */
  notedOn: BusinessDate;
  workingDays: number;
  reminderWorkingDays: number;
  nonWorkingDates: NonWorkingDates;
}

/** The whole grace of a transfer: where it begins, where it ends and the day of the reminder. The one place the three days are worked out. */
export function graceOf(input: GraceInput): TransferGrace {
  const startsOn = graceStartsOn(input.effectiveOn, input.notedOn);
  const endsOn = graceEndsOn(startsOn, input.workingDays, input.nonWorkingDates);

  return {
    startsOn,
    endsOn,
    reminderOn: graceReminderOn(startsOn, endsOn, input.reminderWorkingDays, input.nonWorkingDates),
  };
}

/**
 * The rights of the person that are rights of the old department (`QĐ-110p`, C.1): the ones held when the transfer takes effect, that is, that
 * began on that day or before. A right that begins after was granted later, to a request of the new head, and is not taken back. A right
 * granted on the day itself is the old department's: its request was sent from there and its grant completed before the system noticed the day.
 */
export function heldOnOrBefore<T extends { effectiveFrom: BusinessDate }>(
  seats: readonly T[],
  effectiveOn: BusinessDate,
): T[] {
  return seats.filter((seat) => seat.effectiveFrom <= effectiveOn);
}

/** Where a transfer stands (P7). `SUPERSEDED`: a departure recorded in the grace took the rights over and closed the transfer (`QĐ-110r`). */
export type TransferPhase = 'PENDING' | 'IN_GRACE' | 'REVOKING' | 'CLOSED' | 'CANCELLED' | 'SUPERSEDED';

/**
 * The phase of a transfer (P7): waiting for its day, the person keeps the old rights until the last day of the grace, the grace is over and the
 * rights are being taken back, closed, or cancelled. The last day of the grace is still the grace: the system opens the revocation the day after.
 */
export function transferPhase(
  transfer: {
    status: 'PENDING' | 'EFFECTIVE' | 'CANCELLED';
    closed: boolean;
    graceEndsOn: BusinessDate | null;
    supersededByCaseId?: string | null;
  },
  today: BusinessDate,
): TransferPhase {
  if (transfer.status === 'PENDING') return 'PENDING';
  if (transfer.status === 'CANCELLED') return 'CANCELLED';
  if (transfer.closed) return transfer.supersededByCaseId ? 'SUPERSEDED' : 'CLOSED';

  return transfer.graceEndsOn === null || today <= transfer.graceEndsOn ? 'IN_GRACE' : 'REVOKING';
}
