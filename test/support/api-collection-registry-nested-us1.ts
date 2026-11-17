import type { NestedArrayEntry } from './api-collection-registry';

const OWNER = 'qd103-vendor-usage-import';
const DAYS_SOURCE =
  'MAX_RANGE_DAYS in usage-overview.types.ts, the range check of resolveRange in usage-overview.policy.ts and the maxItems of the schema in usage-employee.dto.ts: a range is at most 366 days and each array holds at most one entry for each day of it';

/**
 * The nested arrays of the detail of one person's usage of one software added by `US-1.3` (`QĐ-111aw`): the vendor sources of the application, the days the
 * person was active in each, and the days the collector saw their tool. Each holds at most what the schema says, and the detail says with
 * `sourcesTruncated` when the application has more sources than it lists.
 */
export const NESTED_ARRAYS_US1: readonly NestedArrayEntry[] = [
  {
    key: 'usageEmployeeSoftwareGet#vendorSources',
    classification: 'bounded',
    findings: [],
    owner: OWNER,
    businessMaximum: {
      maxItems: 50,
      source:
        'MAX_DETAIL_SOURCES in usage-employee.types.ts, the maxItems of the schema in usage-employee.dto.ts: the detail lists at most that many sources, the newest first, and sourcesTruncated says when the application has more',
    },
    rationale: 'The vendor sources of the application, each with what its reports say of the person.',
    removeWhen:
      'Review when MAX_DETAIL_SOURCES changes or the sources of an application become a paged subresource of the person.',
  },
  {
    key: 'usageEmployeeSoftwareGet#vendorSources.activeDates',
    classification: 'bounded',
    findings: [],
    owner: OWNER,
    businessMaximum: { maxItems: 366, source: DAYS_SOURCE },
    rationale: 'The days of the range the person was active in one vendor source.',
    removeWhen: 'Review when MAX_RANGE_DAYS changes.',
  },
  {
    key: 'usageEmployeeSoftwareGet#collector.days',
    classification: 'bounded',
    findings: [],
    owner: OWNER,
    businessMaximum: { maxItems: 366, source: DAYS_SOURCE },
    rationale:
      'The days of the range the collector saw the tool of the person, with the count of answers and of tokens of each.',
    removeWhen: 'Review when MAX_RANGE_DAYS changes.',
  },
];
