import { addDays, weekBoundsOf, type BusinessDate } from '../../../core/business-date';
import {
  DEFAULT_RANGE_DAYS,
  MAX_RANGE_DAYS,
  type DataStatus,
  type Granularity,
  type RangeProblem,
  type UsagePeriod,
  type UsageRange,
} from './usage-overview.types';

const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (from: BusinessDate, to: BusinessDate): number =>
  Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS);

/**
 * The days a series is asked for: the last thirty days when nothing is said, thirty days back from `to` or forward to today from `from`. A
 * range ends before it starts, or is longer than one report of a vendor can cover (366 days), is refused. The days after today are still in
 * the range but nothing counts them: `effectiveTo` is the last day that can have data.
 */
export function resolveRange(input: {
  today: BusinessDate;
  from?: BusinessDate | undefined;
  to?: BusinessDate | undefined;
}): { ok: true; range: UsageRange } | { ok: false; problem: RangeProblem } {
  const to = input.to ?? input.today;
  const from = input.from ?? addDays(to, 1 - DEFAULT_RANGE_DAYS);
  if (from > to) return { ok: false, problem: 'RANGE_INVERTED' };
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) return { ok: false, problem: 'RANGE_TOO_LONG' };

  return { ok: true, range: { from, to, effectiveTo: to < input.today ? to : input.today } };
}

/** The first day of the period a day falls in. */
function periodStartOf(day: BusinessDate, granularity: Granularity): BusinessDate {
  if (granularity === 'DAY') return day;

  return granularity === 'WEEK' ? weekBoundsOf(day).start : `${day.slice(0, 8)}01`;
}

/**
 * The periods of a range, oldest first, each cut to the days the range counts (the first and the last may be shorter than a whole week or
 * month); none when every day of the range is still to come. Weeks are ISO weeks, Monday to Sunday, so a week may begin in one year and end
 * in the next; months are those of the calendar. Whole days of the calendar of the organization: no time zone is involved.
 */
export function periodsOf(range: UsageRange, granularity: Granularity): UsagePeriod[] {
  const periods: UsagePeriod[] = [];
  for (let day = range.from; day <= range.effectiveTo; day = addDays(day, 1)) {
    const start = periodStartOf(day, granularity);
    const last = periods[periods.length - 1];
    if (last && periodStartOf(last.start, granularity) === start) {
      last.end = day;
      last.days += 1;
    } else {
      periods.push({ start: day, end: day, days: 1 });
    }
  }

  return periods;
}

/** The whole range as one period (what a view of one person over the range counts): null when every day of it is still to come. */
export function wholeRangeOf(range: UsageRange): UsagePeriod | null {
  if (range.from > range.effectiveTo) return null;

  return { start: range.from, end: range.effectiveTo, days: daysBetween(range.from, range.effectiveTo) + 1 };
}

/**
 * What the days covered say of a period: `NO_DATA` when no source covered any day of it (a person's silence is then no activity, only an
 * absence of data), `HAS_DATA` when every day was covered, `PARTIAL` otherwise (`FR-4.10`, `FR-4.14a`). The days where something was active
 * are a count of their own; they never decide the status.
 */
export function dataStatusOf(coveredDays: number, periodDays: number): DataStatus {
  if (coveredDays <= 0) return 'NO_DATA';

  return coveredDays >= periodDays ? 'HAS_DATA' : 'PARTIAL';
}
