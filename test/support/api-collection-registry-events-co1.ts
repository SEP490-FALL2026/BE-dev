import type { RegistryEvent } from './api-collection-registry';

/** The events of the nested-array registry written by `CO-1.2` (the detail of a contract with its subscriptions, files and applications, `QĐ-111t`, of `fe-feedback`). */
export const CO1_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  'contractGet#contract.subscriptions',
  'contractGet#contract.documents',
  'contractGet#contract.applicationIds',
].map((key): RegistryEvent => ({
  registry: 'nested',
  key,
  change: 'added',
  to: 'bounded',
  bound: 'CONTRACT_DETAIL_ARRAY_MAX',
  finding: 'LD-14',
  item: 'c1-contract-list-and-fields',
  date: '2026-11-15',
  reason:
    'A slice of what hangs on a contract: at most CONTRACT_DETAIL_ARRAY_MAX entries, with a flag that says when the contract has more.',
}));
