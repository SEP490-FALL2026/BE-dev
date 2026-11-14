import { addDays, type BusinessDate } from '../../../core/business-date';
import { addWorkingDays, type NonWorkingDates } from '../../../core/working-days';
import type { CalendarWindow } from '../public/personnel-dashboard.types';

export type { NonWorkingDates };

/**
 * How many working days ahead the calendar of the departures and of the ends of the grace looks (`QĐ-110` G2, R5 E2). Not an operating parameter:
 * it is the window of a screen, not a rule of the process.
 */
export const CALENDAR_WORKING_DAYS = 10;

/** The most calendar days ten working days can take with the longest break of the year (nine days off) and the weekends in between. */
const CALENDAR_LOOK_AHEAD_DAYS = 45;

/** The last day whose days off the window needs: the caller reads the non-working dates from today to here. */
export function calendarLookAheadEnd(today: BusinessDate): BusinessDate {
  return addDays(today, CALENDAR_LOOK_AHEAD_DAYS);
}

/**
 * The window of the calendar of the next working days (a person whose last working day is today is in it; both ends are included): from today to the
 * `workingDays`th working day after it. Today is never counted as one of the days, so on a Saturday the window ends on the Friday two weeks on, like on the Friday before.
 */
export function calendarWindowOf(
  today: BusinessDate,
  nonWorkingDates: NonWorkingDates,
  workingDays: number = CALENDAR_WORKING_DAYS,
): CalendarWindow {
  return { from: today, to: addWorkingDays(today, workingDays, nonWorkingDates) };
}
