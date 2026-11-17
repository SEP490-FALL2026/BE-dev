import type { NestedArrayEntry } from './api-collection-registry';

/** The nested array of the report of the SLA of the revocations added by `RD.2` (P22, `QĐ-110c`, of `mf2-mf3`). */
export const NESTED_ARRAYS_RD: readonly NestedArrayEntry[] = [
  {
    key: 'revocationSlaGet#rows',
    classification: 'bounded',
    findings: [],
    owner: 'a10-operational-dashboards',
    businessMaximum: {
      maxItems: 100,
      source:
        'REPORT_PAGE_SIZE_MAX in revocation-sla.dto.ts, the maxItems of rows and the maximum of pageSize: the array is one page of the groups (an IT Admin or a department for each row), never the whole set',
    },
    rationale:
      'The figures of each IT Admin or each department of the report, the ones with the most overdue first, paged by page and pageSize.',
    removeWhen: 'Review when the page size maximum of the report changes.',
  },
];
