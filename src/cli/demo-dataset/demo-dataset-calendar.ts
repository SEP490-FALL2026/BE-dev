import { businessDateAt } from '../../core/business-date';

/**
 * When a fixture can be applied. The scenarios live in one fiscal year: the subscriptions run from the 1st of January to
 * the 31st of December, the budget of the year is built from today, and the requests checked against it (R1, R2) are
 * priced to be paid a week after the run, inside that year. Late in December, or once the year has turned, the same
 * writes would reach the next year, which has no budget, and the requests would stop at another state than their
 * scenario — so the command refuses before writing instead of reporting a dataset that is not the one described.
 */

/** The last day of the year (`MM-DD`) on which `apply` may write: a payment a week later still falls in the year. */
export const LAST_APPLY_DAY = '11-30';

export interface CalendarFacts {
  mode: 'plan' | 'apply';
  /** The business day of the organization, `YYYY-MM-DD`. */
  today: string;
  /** The operating parameter `FISCAL_YEAR_START_MONTH`. */
  fiscalYearStartMonth: number;
  /** The year this fixture was first applied in on this database (from its audit events); null when never applied. */
  datasetYear: number | null;
}

/**
 * The business year of an instant in the organization's time zone: an apply early on the 1st of January east of UTC is
 * still the 31st of December in UTC, and must count in the year the organization lives in.
 */
export function businessYearOf(occurredAt: string, timeZone: string): number {
  return Number(businessDateAt(new Date(occurredAt), timeZone).slice(0, 4));
}

/** Why the calendar does not allow this run, or null. */
export function calendarRefusal(facts: CalendarFacts): string | null {
  const year = Number(facts.today.slice(0, 4));
  if (facts.fiscalYearStartMonth !== 1) {
    return (
      `The fixture assumes a fiscal year from January to December; this installation starts it in month ` +
      `${facts.fiscalYearStartMonth} (FISCAL_YEAR_START_MONTH). Nothing written.`
    );
  }
  if (facts.datasetYear !== null && facts.datasetYear !== year) {
    return (
      `The dataset was applied in ${facts.datasetYear}; its subscriptions and budget belong to that year and this is ` +
      `${year}. Running it again would write into another year: use a new fixture version. Nothing written.`
    );
  }
  if (facts.mode === 'apply' && facts.today > `${year}-${LAST_APPLY_DAY}`) {
    return (
      `apply writes from the 1st of January to the ${LAST_APPLY_DAY.slice(3)}th of November only (today is ${facts.today}): ` +
      'later, the requests priced against this year would be paid in the next one. plan still reads. Nothing written.'
    );
  }

  return null;
}
