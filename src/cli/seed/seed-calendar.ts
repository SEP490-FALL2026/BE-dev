import { businessDateAt } from '../../core/business-date';

import { addDays } from '../../core/business-date';
import { addMonths } from '../../core/fiscal-year';
import { addWorkingDays } from '../../core/working-days';
import type { DemoRunContext } from './demo-run.types';

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
      `${year}. Running it again would write into another year: run the seed wrapper and choose reset. Nothing written.`
    );
  }

  return null;
}

/** All paid requests share one spend date; only in-plan scenarios determine the required budget window. */
export function seedCalendar(
  today: string,
  termMonths: number,
  forceNextFiscalYear = false,
): { spendDay: string; years: number[] } {
  const year = Number(today.slice(0, 4));
  const first = addDays(today, 7);
  const end = addDays(addMonths(first, termMonths), -1);
  const next = forceNextFiscalYear || end > `${year}-12-31`;
  return next
    ? { spendDay: addWorkingDays(`${year}-12-31`, 1, new Set()), years: [year, year + 1] }
    : { spendDay: first, years: [year] };
}

export function calendarFor(ctx: DemoRunContext & { forceNextFiscalYear?: boolean }): ReturnType<typeof seedCalendar> {
  const term = Math.max(
    0,
    ...ctx.fixture.requests.filter((request) => request.planLine).map((request) => request.termMonths),
  );
  return seedCalendar(ctx.today, term, ctx.forceNextFiscalYear === true);
}
