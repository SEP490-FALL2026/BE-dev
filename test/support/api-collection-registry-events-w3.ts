import type { RegistryEvent } from './api-collection-registry';
import { G9_REGISTRY_EVENTS } from './api-collection-registry-events-g9';
import { K1CL_REGISTRY_EVENTS } from './api-collection-registry-events-k1cl';
import { W6_REGISTRY_EVENTS } from './api-collection-registry-events-w6';

/** The events of the nested-array registry written by the package 3 (MF1-B) of `mf1-mf4-reaudit`. */
const W3_OWN_EVENTS: readonly RegistryEvent[] = [
  'accessRequestGet#request.spend.blockedReasons',
  'budgetCheckGet#budgetCheck.blockedReasons',
  'spendApprovalGet#spendApproval.budgetSnapshot.blockedReasons',
  'spendQueueList#blockedReasons',
].map((key): RegistryEvent => ({
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
}));

/**
 * The events of the packages 3 and 9 of `mf1-mf4-reaudit`, and those of MF-5 (W6), kept here because the main file of the events is at the
 * line limit of the support files.
 */
export const W3_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  ...W3_OWN_EVENTS,
  ...G9_REGISTRY_EVENTS,
  ...W6_REGISTRY_EVENTS,
  ...K1CL_REGISTRY_EVENTS,
];
