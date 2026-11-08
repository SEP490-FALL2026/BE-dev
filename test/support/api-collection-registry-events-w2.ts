import type { RegistryEvent } from './api-collection-registry';

/** The events of the nested-array registry written by the items of the wave W2 of `qd103-108-alignment`. */
export const W2_REGISTRY_EVENTS: readonly RegistryEvent[] = [
  {
    registry: 'nested',
    key: 'meGet#upcomingUnits',
    change: 'added',
    to: 'bounded',
    bound: 'UPCOMING_UNITS_LIMIT',
    finding: 'LD-14',
    item: 'qd103-department-effective-year',
    date: '2026-11-09',
    reason:
      'The units the caller is to head from the day their department takes effect: at most UPCOMING_UNITS_LIMIT (QĐ-106k).',
  },
];
