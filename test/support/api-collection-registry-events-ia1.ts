import type { RegistryEvent } from './api-collection-registry';

/** The event of the nested-array registry written by `IA-1.1` (the queue of grants by person, `QĐ-111m`, of `fe-feedback`). */
export const IA1_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  {
    registry: 'nested',
    key: 'grantQueueList#execution.availableActions',
    change: 'added',
    to: 'bounded',
    bound: 'GRANT_EXECUTION_ACTIONS_MAX',
    finding: 'LD-14',
    item: 'g4-provisioning-queue-manual',
    date: '2026-11-15',
    reason: 'What the IT Admin may do next on the grant task of a person: at most GRANT_EXECUTION_ACTIONS_MAX acts.',
  },
];
