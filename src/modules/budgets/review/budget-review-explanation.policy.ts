import { weekBoundsOf, type BusinessDate } from '../../../core/business-date';
import { nthWorkingDayFrom, type NonWorkingDates } from '../../../core/working-days';
import type { ReviewKind, ReviewLight } from './budget-review.types';

/**
 * Where the explanation of a Cost Center stands in a quarterly review (`QĐ-111ah`, R-10, R-17): not asked (green, or a month), asked and waiting, given, not given when Finance
 * signed (the head who was asked did not), or never asked because the department had no head when the quarter opened (not held against it).
 */
export type ExplanationStatus = 'NOT_REQUIRED' | 'PENDING' | 'EXPLAINED' | 'UNEXPLAINED' | 'NO_HEAD';

/** The days the head of a department has to explain, counted in working days from the day the quarter is closed (the day of the close is the first), a fixed rule (R-47). */
export const EXPLANATION_WORKING_DAYS = 5;

/**
 * Only a Cost Center that is yellow, red or under what it should have used is asked (`QĐ-111ah`), and only in the quarterly review. Whether it can be asked is decided when the quarter opens
 * (US-12-21 AC-12): a department that has no head that day is NO_HEAD from the start, nobody is asked for it and the quarter does not wait for it; a head named later does not change it.
 */
export function initialExplanationStatus(kind: ReviewKind, light: ReviewLight, hasHead: boolean): ExplanationStatus {
  if (kind !== 'QUARTER' || light === 'GREEN') return 'NOT_REQUIRED';

  return hasHead ? 'PENDING' : 'NO_HEAD';
}

/** The last day the head is asked to explain by: the fifth working day from the day of the close. */
export function explanationDueOn(closedOn: BusinessDate, nonWorkingDates: NonWorkingDates): BusinessDate {
  return nthWorkingDayFrom(closedOn, EXPLANATION_WORKING_DAYS, nonWorkingDates);
}

/**
 * Whether `today` is a day the head is reminded (`B-7`): the day the explanation is due, and then every Monday, until the head explains or Finance signs the quarter.
 * It only reminds: nothing is refused for being late, and nothing is reminded before the due day.
 */
export function explanationReminderDay(today: BusinessDate, dueOn: BusinessDate): boolean {
  if (today === dueOn) return true;

  return today > dueOn && weekBoundsOf(today).start === today;
}
