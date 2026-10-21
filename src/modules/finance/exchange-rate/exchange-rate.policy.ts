import type { BusinessDate } from '../../../core/business-date';

/** No rate is entered for a day before this one: a typo guard, not a business date. */
export const EARLIEST_RATE_DATE: BusinessDate = '2000-01-01';

export type RateDateProblem = 'DATE_IN_FUTURE' | 'DATE_TOO_OLD';

/**
 * Whether the day a rate is entered for can be accepted. `today` is the organization's own calendar day. Business
 * dates are `YYYY-MM-DD`, so comparing them as text is comparing them as dates.
 */
export function rateDateProblem(rateDate: BusinessDate, today: BusinessDate): RateDateProblem | null {
  if (rateDate > today) return 'DATE_IN_FUTURE';
  if (rateDate < EARLIEST_RATE_DATE) return 'DATE_TOO_OLD';

  return null;
}
