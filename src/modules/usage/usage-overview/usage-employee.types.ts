import type { BusinessDate } from '../../../core/business-date';
import type { ApplicationRef, DataStatus } from './usage-overview.types';

/**
 * The most vendor sources the detail of one person's usage of one application lists, the newest first, with `sourcesTruncated` saying when the
 * application has more: an application has no limit of sources in the data, and the detail must not grow with it (`API-LIST-DETAIL.1`).
 */
export const MAX_DETAIL_SOURCES = 50;

/** The person a view is about: the code the company gave them and nothing that names or shows them (`QĐ-111aw`, `OQ-03`). */
export interface EmployeeRef {
  id: string;
  employeeCode: string;
}

/** The days a view counts: from the first day asked for to the last that can have data. */
export interface CountedRange {
  from: BusinessDate;
  to: BusinessDate;
  days: number;
}

/** One software of a person over the range: whether they hold a seat, and the days they were active and the days anything told. */
export interface SoftwareLine {
  application: ApplicationRef;
  hasSeat: boolean;
  status: DataStatus;
  activeDays: number;
  coveredDays: number;
  updatedAt: Date | null;
}

export interface SoftwareList {
  employee: EmployeeRef;
  range: CountedRange;
  items: SoftwareLine[];
  total: number;
}

/** What one vendor source says of the person: the days they were active in it and how many days its reports cover. */
export interface VendorSourceDetail {
  sourceId: string;
  name: string;
  status: DataStatus;
  activeDays: number;
  coveredDays: number;
  activeDates: BusinessDate[];
  updatedAt: Date | null;
}

/** What the collector saw of the person's tool, day by day: the only place a count of answers and of tokens is shown (`QĐ-111aw`, `QĐ-101c`). */
export interface CollectorDetail {
  tool: string;
  status: DataStatus;
  activeDays: number;
  coveredDays: number;
  updatedAt: Date | null;
  days: Array<{
    date: BusinessDate;
    coverage: 'COVERED' | 'PARTIAL';
    active: boolean;
    responses: number;
    totalTokens: number;
  }>;
}

export interface SoftwareDetail {
  employee: EmployeeRef;
  application: ApplicationRef;
  range: CountedRange;
  hasSeat: boolean;
  status: DataStatus;
  activeDays: number;
  coveredDays: number;
  updatedAt: Date | null;
  vendorSources: VendorSourceDetail[];
  sourcesTruncated: boolean;
  collector: CollectorDetail | null;
}
