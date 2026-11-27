import type { NestedArrayEntry } from './api-collection-registry';

const OWNER = 'api-list-detail-contract-remediation';

/**
 * The nested array of a case of an invoice that differs added by `RC-1` (`QĐ-111y`): what differs, at most the three things checked (the
 * count of seats, the price of one, and expected pool amount, each at most once), the `maxItems` of the schema, so it never grows the answer.
 */
export const NESTED_ARRAYS_RC1: readonly NestedArrayEntry[] = ['invoiceDiscrepancyGet', 'invoiceDiscrepancyList'].map(
  (operation): NestedArrayEntry => ({
    key: `${operation}#mismatches`,
    classification: 'bounded',
    findings: [],
    owner: OWNER,
    businessMaximum: {
      maxItems: 3,
      source:
        'INVOICE_DISCREPANCY_MISMATCHES_MAX in invoice-discrepancy.dto.ts, the maxItems of the array in the schema: the match checks count, unit price, and expected pool amount, each at most once',
    },
    rationale:
      'What differs in the case: the count of seats, the price of one, or expected pool amount; there are three kinds and each comes at most once.',
    removeWhen: 'Review when a fourth mismatch kind is added, or the case stops being one per invoice.',
  }),
);
