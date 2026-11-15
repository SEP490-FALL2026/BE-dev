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
export const DATA_STATUSES = ['HAS_DATA', 'PARTIAL', 'NO_DATA'] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];

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

/** A software as a point of the series names it: the name and the logo of the catalog (the logo may not be set). */
export interface ApplicationRef {
  id: string;
  name: string;
  logoUrl: string | null;
}

/**
 * One point of the series: what one group (a department, an application or a source) did in one period. `activeDays` are the days on which
 * anybody of the group did something, `coveredDays` the days something told what happened; both count a day once however many sources told
 * of it. Never a name of a person, a volume, a token or a rank.
 */
export interface UsagePoint {
  period: UsagePeriod;
  department: { id: string; code: string; name: string } | null;
  application: ApplicationRef | null;
  source: { kind: SourceKind; id: string | null; name: string; application: ApplicationRef } | null;
  activeDays: number;
  coveredDays: number;
  status: DataStatus;
  updatedAt: Date | null;
}

/** What a series is asked for (the query of `GET /usage-overview` once it is read). */
export interface UsageOverviewQuery {
  from?: BusinessDate | undefined;
  to?: BusinessDate | undefined;
  granularity: Granularity;
  groupBy: Grouping;
  departmentId?: string | undefined;
  employeeId?: string | undefined;
  applicationId?: string | undefined;
  sourceKind?: SourceKind | undefined;
  sourceId?: string | undefined;
  page: number;
  pageSize: number;
}
