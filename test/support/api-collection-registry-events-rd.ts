import type { RegistryEvent } from './api-collection-registry';

/** The events of the nested-array registry written by `RD.2` (the rows of the report of the SLA of the revocations, P22, `QĐ-110c`, of `mf2-mf3`). */
export const RD_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  {
    registry: 'nested',
    key: 'revocationSlaGet#rows',
    change: 'added',
    to: 'bounded',
    bound: 'REPORT_PAGE_SIZE_MAX',
    finding: 'LD-14',
    item: 'a10-operational-dashboards',
    date: '2026-11-14',
    reason:
      'The rows of the report of the SLA of the revocations (P22): one page of the groups, at most REPORT_PAGE_SIZE_MAX, an IT Admin or a department for each.',
  },
];
