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
  {
    registry: 'nested',
    key: 'budgetCycleBaseline#departments',
    change: 'added',
    to: 'bounded',
    bound: 'DEPARTMENTS_LISTED_MAX',
    finding: 'LD-14',
    item: 'qd103-budget-baseline-annual-check',
    date: '2026-11-09',
    reason:
      'The departments of the year listed by the baseline: at most DEPARTMENTS_LISTED_MAX, with the total beside it.',
  },
  {
    registry: 'nested',
    key: 'budgetCycleBaseline#departments.software',
    change: 'added',
    to: 'bounded',
    bound: 'SOFTWARE_LISTED_MAX',
    finding: 'LD-14',
    item: 'qd103-budget-baseline-annual-check',
    date: '2026-11-09',
    reason:
      'The subscriptions of one department listed by the baseline: at most SOFTWARE_LISTED_MAX, with the total beside it.',
  },
  {
    registry: 'nested',
    key: 'budgetCycleBaseline#sharedPoolUnallocated.software',
    change: 'added',
    to: 'bounded',
    bound: 'SOFTWARE_LISTED_MAX',
    finding: 'LD-14',
    item: 'qd103-budget-baseline-annual-check',
    date: '2026-11-10',
    reason:
      'The K2/K4 subscriptions with idle seats on the line of the shared pool (AF-05): at most SOFTWARE_LISTED_MAX, with the total beside it.',
  },
  {
    registry: 'nested',
    key: 'budgetCyclePackage#departments',
    change: 'added',
    to: 'bounded',
    bound: 'DEPARTMENTS_LISTED_MAX',
    finding: 'LD-14',
    item: 'qd103-budget-baseline-annual-check',
    date: '2026-11-09',
    reason:
      'The departments of the year listed by the package: at most DEPARTMENTS_LISTED_MAX, with the total beside it.',
  },
  {
    registry: 'nested',
    key: 'budgetCyclePackage#departments.proposal.lines',
    change: 'added',
    to: 'bounded',
    bound: 'LINES_MAX',
    finding: 'LD-14',
    item: 'qd103-budget-proposal-lines-cleanup',
    date: '2026-11-09',
    reason:
      'The lines of the open proposal of a department listed by the package: at most LINES_MAX (a proposal takes no more).',
  },
];
