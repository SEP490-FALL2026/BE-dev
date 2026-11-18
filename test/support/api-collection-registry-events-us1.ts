import type { RegistryEvent } from './api-collection-registry';

/** The events of the nested-array registry written by `US-1.3` (the detail of one person's usage of one software, `QĐ-111aw`, of `fe-feedback`). */
export const US1_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  { key: 'usageEmployeeSoftwareGet#vendorSources', bound: 'MAX_DETAIL_SOURCES' },
  { key: 'usageEmployeeSoftwareGet#vendorSources.activeDates', bound: 'MAX_RANGE_DAYS' },
  { key: 'usageEmployeeSoftwareGet#collector.days', bound: 'MAX_RANGE_DAYS' },
].map(({ key, bound }): RegistryEvent => ({
  registry: 'nested',
  key,
  change: 'added',
  to: 'bounded',
  bound,
  finding: 'LD-14',
  item: 'qd103-vendor-usage-import',
  date: '2026-11-15',
  reason:
    'The detail of one person and one software lists what each source says of them: at most what the schema says (one entry for each day of a range of at most 366 days, at most 50 sources with a flag that says when there are more).',
}));
