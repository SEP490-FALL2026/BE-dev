import { addDays, type BusinessDate } from '../../../core/business-date';
import { nthWorkingDayFrom, type NonWorkingDates } from '../../../core/working-days';

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
