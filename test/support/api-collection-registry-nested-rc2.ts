import type { NestedArrayEntry } from './api-collection-registry';

/**
 * The nested array of a case outside the process added by `RC-2` (`QĐ-111y`, R-45): the proofs of payment a case was closed with, at most the
 * `maxItems` of the schema, so it never grows the answer.
 */
export const NESTED_ARRAYS_RC2: readonly NestedArrayEntry[] = ['outOfProcessCaseList'].map(
  (operation): NestedArrayEntry => ({
    key: `${operation}#documentIds`,
    classification: 'bounded',
    findings: [],
    owner: 'api-list-detail-contract-remediation',
    businessMaximum: {
      maxItems: 20,
      source:
        'OUT_OF_PROCESS_DOCUMENTS_MAX in vendor-account-review.dto.ts, the maxItems of the array in the schema: the files a case was closed with, at most twenty',
    },
    rationale:
      'The proofs of payment of the money a case records: at least one for RECORD_SPENT, none for the other outcomes, at most twenty.',
    removeWhen: 'Review when a case may carry more files, or the files move to a collection of their own.',
  }),
);
