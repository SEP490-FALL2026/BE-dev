import type { NestedArrayEntry } from './api-collection-registry';

/** The nested arrays of the answers added by `K1-CL` (the checklist of the revocation of a K1 seat, `QĐ-111az`, of `mf2-mf3`). */
export const NESTED_ARRAYS_K1CL: readonly NestedArrayEntry[] = [
  {
    key: 'provisioningTaskGet#task.k1Checklist.items',
    classification: 'bounded',
    findings: [],
    owner: 'licensing-provisioning-task-read-contracts',
    businessMaximum: {
      maxItems: 10,
      source:
        'K1_CHECKLIST_MAX_ITEMS in provisioning.dto.ts, the maxItems of the card of the checklist: a departure has six steps and a person who still works two (CODES_OF in provisioning-k1-checklist.policy.ts)',
    },
    rationale:
      'The steps the IT Admin ticks to complete the revocation of a K1 seat, each with the instant it was ticked.',
    removeWhen: 'Review when the steps of a variant change (CODES_OF in provisioning-k1-checklist.policy.ts).',
  },
];
