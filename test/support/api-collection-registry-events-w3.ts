import type { RegistryEvent } from './api-collection-registry';

/** The events of the nested-array registry written by the package 3 (MF1-B) of `mf1-mf4-reaudit`. */
export const W3_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  'accessRequestGet#request.spend.blockedReasons',
  'budgetCheckGet#budgetCheck.blockedReasons',
  'spendApprovalGet#spendApproval.budgetSnapshot.blockedReasons',
  'spendQueueList#blockedReasons',
].map(
  (key): RegistryEvent => ({
    registry: 'nested',
    key,
    change: 'added',
    to: 'bounded',
    bound: 'BlockReason',
    finding: 'LD-14',
    item: 'qd103-budget-check-three-outcomes',
    date: '2026-11-09',
    reason:
      'The reasons a request is blocked when the budget is checked (BR-MF1-06g): at most the three values of BlockReason, each once.',
  }),
);
