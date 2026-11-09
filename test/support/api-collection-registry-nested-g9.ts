import type { NestedArrayEntry } from './api-collection-registry';

/** Gói 9: the arrays the subscription read model gained with the rule against a second live subscription of a K2 or K4 plan. */
export const NESTED_ARRAYS_G9: readonly NestedArrayEntry[] = [
  {
    key: 'subscriptionList#mergeCandidateIds',
    classification: 'bounded',
    findings: [],
    owner: 'catalog-subscription-read-model',
    businessMaximum: {
      maxItems: 20,
      source:
        'MERGE_CANDIDATES_MAX in subscription-view.service.ts caps the live subscriptions of a K2 or K4 plan an answer names',
    },
    rationale:
      'The other live subscriptions of the same K2 or K4 plan, which exist only while the seat baseline is open (SHOULD_MERGE).',
    removeWhen: 'Review when the rule against a second subscription of a plan changes.',
  },
  {
    key: 'subscriptionGet#mergeCandidateIds',
    classification: 'bounded',
    findings: [],
    owner: 'catalog-subscription-read-model',
    businessMaximum: {
      maxItems: 20,
      source:
        'MERGE_CANDIDATES_MAX in subscription-view.service.ts caps the live subscriptions of a K2 or K4 plan an answer names',
    },
    rationale:
      'The other live subscriptions of the same K2 or K4 plan, which exist only while the seat baseline is open (SHOULD_MERGE).',
    removeWhen: 'Review when the rule against a second subscription of a plan changes.',
  },
];
