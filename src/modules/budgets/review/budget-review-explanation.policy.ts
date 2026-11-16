import { weekBoundsOf, type BusinessDate } from '../../../core/business-date';
import { nthWorkingDayFrom, type NonWorkingDates } from '../../../core/working-days';
import type { ReviewKind, ReviewLight } from './budget-review.types';

/**
 * Where the explanation of a Cost Center stands in a quarterly review (`QĐ-111ah`, R-10, R-17): not asked (green, or a month), asked and waiting, given, or
 * not given when Finance signed (the head did not, or the department had no head to ask).
 */
export type ExplanationStatus = 'NOT_REQUIRED' | 'PENDING' | 'EXPLAINED' | 'UNEXPLAINED' | 'NO_HEAD';

/** The days the head of a department has to explain, counted in working days from the day the quarter is closed (the day of the close is the first), a fixed rule (R-47). */
export const EXPLANATION_WORKING_DAYS = 5;

/** Only a Cost Center that is yellow, red or under what it should have used is asked (`QĐ-111ah`), and only in the quarterly review. */
export function initialExplanationStatus(kind: ReviewKind, light: ReviewLight): ExplanationStatus {
  return kind === 'QUARTER' && light !== 'GREEN' ? 'PENDING' : 'NOT_REQUIRED';
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

/** What a line that was asked and never answered is when Finance signs: a department with no head had nobody to ask and it is not held against it (R-17). */
export function statusWhenSigned(hasHead: boolean): Extract<ExplanationStatus, 'UNEXPLAINED' | 'NO_HEAD'> {
  return hasHead ? 'UNEXPLAINED' : 'NO_HEAD';
}
