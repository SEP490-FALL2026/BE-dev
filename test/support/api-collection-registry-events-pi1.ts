import type { RegistryEvent } from './api-collection-registry';

/** The events of the nested-array registry written by `PI-1.4` (the files and the marks of a purchase invoice, `QĐ-111u`, of `fe-feedback`). */
export const PI1_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  { key: 'purchaseInvoiceGet#documents', bound: 'PURCHASE_INVOICE_DOCUMENTS_MAX' },
  { key: 'purchaseInvoiceGet#flags', bound: 'PURCHASE_INVOICE_FLAGS_MAX' },
  { key: 'purchaseInvoiceList#flags', bound: 'PURCHASE_INVOICE_FLAGS_MAX' },
].map(({ key, bound }): RegistryEvent => ({
  registry: 'nested',
  key,
  change: 'added',
  to: 'bounded',
  bound,
  finding: 'LD-14',
  item: 'api-list-detail-contract-remediation',
  date: '2026-11-15',
  reason: `The files and the marks of a purchase invoice: at most ${bound} entries, the maxItems of the schema.`,
}));
