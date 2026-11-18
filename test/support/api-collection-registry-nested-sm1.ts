import type { NestedArrayEntry } from './api-collection-registry';

/**
 * The nested array of the seat-months added by `SM-1` (`QĐ-104c`): the line of the shared pool of each subscription that has an invoice or a
 * seat-month in the month, at most the `maxItems` of the schema, so it never grows the answer (Finance only; a manager gets none).
 */
export const NESTED_ARRAYS_SM1: readonly NestedArrayEntry[] = [
  {
    key: 'seatMonthChargeList#data.poolLines',
    classification: 'bounded',
    findings: [],
    owner: 'api-list-detail-contract-remediation',
    businessMaximum: {
      maxItems: 100,
      source:
        'MAX_POOL_LINES in seat-month-query.service.ts, the maxItems of the array in the schema: one line for each subscription of the shared pool with an invoice or a seat-month in the month, at most a hundred',
    },
    rationale:
      'A company has a handful of subscriptions of the shared pool of seats, one for each plan, and the line is read for one month; the rows themselves are paged.',
    removeWhen:
      'Review when the pools of a company can pass a hundred, or the lines move to a collection of their own.',
  },
];
