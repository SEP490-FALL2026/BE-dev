import { businessDateAt } from '../../core/business-date';
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

/**
 * The business years the budgets are written for: the year of today and the next one, always. A Request of 2 to 12 months started
 * today can end in the next year, and the check of the budget reads every year the term touches, so without the budget of the next
 * year such a Request would wait for review instead of reaching the spending approver.
 */
export function seedCalendar(today: string): { years: number[] } {
  const year = Number(today.slice(0, 4));

  return { years: [year, year + 1] };
}

export function calendarFor(ctx: DemoRunContext): ReturnType<typeof seedCalendar> {
  return seedCalendar(ctx.today);
}
