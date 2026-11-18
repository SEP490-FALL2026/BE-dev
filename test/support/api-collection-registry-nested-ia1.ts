import type { NestedArrayEntry } from './api-collection-registry';

/** The nested array of the queue of grants added by `IA-1.1` (`QĐ-111m`): what the IT Admin may do next on the grant task of a person. */
export const NESTED_ARRAYS_IA1: readonly NestedArrayEntry[] = [
  {
    key: 'grantQueueList#execution.availableActions',
    classification: 'bounded',
    findings: [],
    owner: 'g4-provisioning-queue-manual',
    businessMaximum: {
      maxItems: 7,
      source:
        'GRANT_EXECUTION_ACTIONS_MAX in grant-queue.dto.ts, the maxItems of availableActions: the acts of a task of a grant (take, complete, report, retry, hand off, close, cancel), never a list that grows',
    },
    rationale: 'The buttons the IT Admin has on the grant task of one person of a request, from the state of the task.',
    removeWhen: 'Review when the acts a grant task offers change.',
  },
];
