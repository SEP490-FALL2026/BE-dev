import { weekBoundsOf, type BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';

/**
 * The days Finance and the spending approver are asked for the budget of a year (`QĐ-111am`, B-4: "01/12, then every Monday until a version is
 * approved"), and the year they are asked for. In December the year is the one after: on 01/12 and on every Monday of the month. From 01/01 that
 * year is the year that runs, and the asking goes on every Monday for it, until a version of it is approved: the rule has no end at 01/01, only
 * the approval (`QĐ-30b` keeps a request waiting for a budget meanwhile). Whether a Cost Center lacks an approved budget of that year is for the
 * service to say: the same day is a reminder for each Cost Center that does, and none once its budget is approved. When the year ends, December
 * asks for the next one and the old year is no longer asked for.
 */
export function nextYearReminderOn(today: BusinessDate): { year: number } | null {
  const year = fiscalYearOf(today);
  const isMonday = weekBoundsOf(today).start === today;
  if (today.slice(5, 7) !== '12') return isMonday ? { year } : null;
  const isFirst = today.slice(8, 10) === '01';

  return isFirst || isMonday ? { year: year + 1 } : null;
}
