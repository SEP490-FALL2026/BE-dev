import type { RegistryEvent } from './api-collection-registry';

/** The events of the nested-array registry written by `K1-CL` (the checklist of the revocation of a K1 seat, `QĐ-111az`, of `mf2-mf3`). */
export const K1CL_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  {
    registry: 'nested',
    key: 'provisioningTaskGet#task.k1Checklist.items',
    change: 'added',
    to: 'bounded',
    bound: 'K1_CHECKLIST_MAX_ITEMS',
    finding: 'LD-14',
    item: 'licensing-provisioning-task-read-contracts',
    date: '2026-11-13',
    reason:
      'The steps of the checklist of a K1 revocation (QĐ-111az): at most K1_CHECKLIST_MAX_ITEMS, six for a departure and two for a person who still works.',
  },
];
