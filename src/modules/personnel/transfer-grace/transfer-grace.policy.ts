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
