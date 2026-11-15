import type { BusinessDate } from '../../../core/business-date';

/** How the days of a range are cut into periods: each day, each ISO week (Monday to Sunday) or each calendar month (`QĐ-111aw`). */
export const GRANULARITIES = ['DAY', 'WEEK', 'MONTH'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

/** What a point of the series stands for: a department, an application or a source of usage (a vendor source, or the collector of a tool). */
export const GROUPINGS = ['DEPARTMENT', 'APPLICATION', 'SOURCE'] as const;
export type Grouping = (typeof GROUPINGS)[number];

export const SOURCE_KINDS = ['VENDOR', 'COLLECTOR'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** Whether anything told what happened in a period: all of its days, some of them, or none (no data is not no activity: `FR-4.10`). */
export type DataStatus = 'HAS_DATA' | 'PARTIAL' | 'NO_DATA';

/** The longest range a series is asked for: one report of a vendor covers at most this many days (`MAX_WINDOW_DAYS`, `INV-10`). */
export const MAX_RANGE_DAYS = 366;
/** The range of a series asked for with nothing said: the last thirty days, today included. */
export const DEFAULT_RANGE_DAYS = 30;

/** The days a series is asked for, and the last of them that can have data (a day to come has none). */
export interface UsageRange {
  from: BusinessDate;
  to: BusinessDate;
  effectiveTo: BusinessDate;
}

/** One period of a series, cut to the range: the days it counts are `days`, from `start` to `end` both included. */
export interface UsagePeriod {
  start: BusinessDate;
  end: BusinessDate;
  days: number;
}

export type RangeProblem = 'RANGE_INVERTED' | 'RANGE_TOO_LONG';
