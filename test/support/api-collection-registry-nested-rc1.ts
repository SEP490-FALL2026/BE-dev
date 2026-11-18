import type { NestedArrayEntry } from './api-collection-registry';

const OWNER = 'api-list-detail-contract-remediation';

/**
 * The nested array of a case of an invoice that differs added by `RC-1` (`QĐ-111y`): what differs, at most the two things the match judges (the
 * count of seats and the price of one, each at most once), the `maxItems` of the schema, so it never grows the answer.
 */
export const NESTED_ARRAYS_RC1: readonly NestedArrayEntry[] = ['invoiceDiscrepancyGet', 'invoiceDiscrepancyList'].map(
  (operation): NestedArrayEntry => ({
    key: `${operation}#mismatches`,
    classification: 'bounded',
    findings: [],
    owner: OWNER,
    businessMaximum: {
      maxItems: 2,
      source:
        'INVOICE_DISCREPANCY_MISMATCHES_MAX in invoice-discrepancy.dto.ts, the maxItems of the array in the schema: the match judges the count and the price of one, each at most once',
    },
    rationale:
      'What differs in the case: the count of seats, the price of one, or both; there are two kinds and each comes at most once.',
    removeWhen: 'Review when the match judges a third thing, or the case stops being one per invoice.',
  }),
);
