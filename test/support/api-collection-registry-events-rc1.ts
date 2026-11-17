import type { RegistryEvent } from './api-collection-registry';

/** The events of the nested-array registry written by `RC-1` (what differs in a case of an invoice that differs, `QĐ-111y`, of `fe-feedback`). */
export const RC1_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  { key: 'invoiceDiscrepancyGet#mismatches', bound: 'INVOICE_DISCREPANCY_MISMATCHES_MAX' },
  { key: 'invoiceDiscrepancyList#mismatches', bound: 'INVOICE_DISCREPANCY_MISMATCHES_MAX' },
].map(({ key, bound }): RegistryEvent => ({
  registry: 'nested',
  key,
  change: 'added',
  to: 'bounded',
  bound,
  finding: 'LD-14',
  item: 'api-list-detail-contract-remediation',
  date: '2026-11-15',
  reason: `What differs in a case of an invoice that differs: at most ${bound} entries, the maxItems of the schema.`,
}));
