import { weekBoundsOf, type BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';

/**
 * The days Finance and the spending approver are asked for the budget of the year after (`QĐ-111am`, B-4): from 01/12 of the year, on that
 * day and then every Monday of December, so they are told enough and not every day. The year it is asked for is the one that follows the
 * year of the day. Whether a Cost Center still lacks an approved budget of that year is for the service to say: the same day is a reminder
 * for each Cost Center that does, and none once its budget is approved. From 01/01 the year after has become the year that runs and
 * nothing is asked (`QĐ-30b` stays: a request waits for a budget until one is approved).
 */
export function nextYearReminderOn(today: BusinessDate): { year: number } | null {
  if (today.slice(5, 7) !== '12') return null;
  const isFirst = today.slice(8, 10) === '01';
  const isMonday = weekBoundsOf(today).start === today;

  return isFirst || isMonday ? { year: fiscalYearOf(today) + 1 } : null;
}
