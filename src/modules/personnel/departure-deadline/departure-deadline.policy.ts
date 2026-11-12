import { addDays, type BusinessDate } from '../../../core/business-date';
import { isWorkingDay, nthWorkingDayFrom, type NonWorkingDates } from '../../../core/working-days';

/** The most calendar days after the last working day that a deadline of working days is counted over: ninety days hold them with the days off in between. */
const CALENDAR_WINDOW_DAYS = 90;

/**
 * The day the IT Admin has until to take every right of the person away (`QĐ-110c`): the `workingDays`th working day counting the day
 * after the last working day as day 1, or the next working day when that one is a day off. A planned handover ending on Wednesday
 * 30/09 gives Thursday 01/10, and a departure blocked now on Thursday 12/11 (last working day 12/11) gives Friday 13/11 (SPEC §8, T-MF2).
 * The same day is kept on the case (`offboarding_cases.revocation_due_on`) and given to every task of revocation the case opens.
 */
export function revocationDueOn(
  lastWorkingDay: BusinessDate,
  workingDays: number,
  nonWorkingDates: NonWorkingDates,
): BusinessDate {
  return nthWorkingDayFrom(addDays(lastWorkingDay, 1), workingDays, nonWorkingDates);
}

/** The last day whose days off the deadline needs: the caller reads the non-working dates from the day after the last working day to here. */
export function deadlineWindowEnd(lastWorkingDay: BusinessDate): BusinessDate {
  return addDays(addDays(lastWorkingDay, 1), CALENDAR_WINDOW_DAYS);
}

/**
 * How many of the personal seats of a person have no task of revocation completed (`QĐ-110c`): the seats nobody has opened a task for and
 * those whose task still waits, runs or failed. A task completed is the end of the right (or of its renewal, with the access running on to
 * the end of the paid period: the person in charge of that is the warning of the access that runs on), so only these keep the case late.
 */
export function rightsWithoutCompletedTask(seats: readonly { revocation: { status: string } | null }[]): number {
  return seats.filter((seat) => seat.revocation?.status !== 'COMPLETED').length;
}

/** What a case is judged late by: where it stands, its deadline and how many rights are left without a completed task. */
export interface RevocationStanding {
  state: 'HANDING_OVER' | 'LEFT' | 'CANCELLED';
  closed: boolean;
  /** Null for a case closed or cancelled before the rule: it has no deadline and is never late. */
  dueOn: BusinessDate | null;
  rightsWithoutCompletedTask: number;
}

/**
 * Whether the rights of a departure are late (`QĐ-110c`, `M-09`): today is after the deadline of the case and a right is left without a
 * completed task, **whether or not the IT Admin opened a task for it**. A cancelled or closed case has nothing left to take away.
 */
export function isRevocationOverdue(standing: RevocationStanding, today: BusinessDate): boolean {
  return (
    standing.dueOn !== null &&
    standing.state !== 'CANCELLED' &&
    !standing.closed &&
    today > standing.dueOn &&
    standing.rightsWithoutCompletedTask > 0
  );
}

/** Whether the IT Admin in charge and the Super Admin are told today: the case is late and today is a working day (SPEC T-MF2: not on Saturday or Sunday). */
export function overdueNoticeOwed(
  standing: RevocationStanding,
  today: BusinessDate,
  nonWorkingDates: NonWorkingDates,
): boolean {
  return isRevocationOverdue(standing, today) && isWorkingDay(today, nonWorkingDates);
}
