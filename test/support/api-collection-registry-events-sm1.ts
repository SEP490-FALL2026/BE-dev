import type { RegistryEvent } from './api-collection-registry';

/** The events of the nested-array registry written by `SM-1` (the line of the shared pool of each subscription in the seat-months of a month, `QĐ-104c`, of `fe-feedback`). */
export const SM1_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  { key: 'seatMonthChargeList#data.poolLines', bound: 'MAX_POOL_LINES' },
].map(({ key, bound }): RegistryEvent => ({
  registry: 'nested',
  key,
  change: 'added',
  to: 'bounded',
  bound,
  finding: 'LD-14',
  item: 'api-list-detail-contract-remediation',
  date: '2026-11-16',
  reason: `The line of the shared pool of each subscription with an invoice or a seat-month in the month: at most ${bound} entries, the maxItems of the schema.`,
}));
