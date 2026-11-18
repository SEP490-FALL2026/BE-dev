import type { RegistryEvent } from './api-collection-registry';

/** The events of the nested-array registry written by `RC-2` (the proofs of payment of a case outside the process, `QĐ-111y`, of `fe-feedback`). */
export const RC2_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  { key: 'outOfProcessCaseList#documentIds', bound: 'OUT_OF_PROCESS_DOCUMENTS_MAX' },
].map(({ key, bound }): RegistryEvent => ({
  registry: 'nested',
  key,
  change: 'added',
  to: 'bounded',
  bound,
  finding: 'LD-14',
  item: 'api-list-detail-contract-remediation',
  date: '2026-11-15',
  reason: `The proofs of payment of a case outside the process: at most ${bound} entries, the maxItems of the schema.`,
}));
