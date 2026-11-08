import type { NestedArrayEntry } from './api-collection-registry';

/** The nested arrays of the answers added by the wave W2 of `qd103-108-alignment`. */
export const NESTED_ARRAYS_W2: readonly NestedArrayEntry[] = [
  {
    key: 'budgetCycleBaseline#departments',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-budget-baseline-annual-check',
    businessMaximum: {
      maxItems: 500,
      source:
        'DEPARTMENTS_LISTED_MAX in baseline.policy.ts, the maxItems of the schema in cycle.dto.ts: the departments of the year, cut to the most a division of the ceiling names; departmentsTotal says how many there are',
    },
    rationale:
      'the departments of the year, cut to the most a division of the ceiling names; departmentsTotal says how many there are',
    removeWhen: 'Review when DEPARTMENTS_LISTED_MAX changes or the answer is paged.',
  },
  {
    key: 'budgetCycleBaseline#departments.software',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-budget-baseline-annual-check',
    businessMaximum: {
      maxItems: 50,
      source:
        'SOFTWARE_LISTED_MAX in baseline.policy.ts, the maxItems of the schema in cycle.dto.ts: the subscriptions listed for one department, cut to this many; softwareTotal says how many it owns',
    },
    rationale: 'the subscriptions listed for one department, cut to this many; softwareTotal says how many it owns',
    removeWhen: 'Review when SOFTWARE_LISTED_MAX changes or the answer is paged.',
  },
  {
    key: 'budgetCyclePackage#departments',
    classification: 'bounded',
    findings: [],
    owner: 'qd103-budget-baseline-annual-check',
    businessMaximum: {
      maxItems: 500,
      source:
        'DEPARTMENTS_LISTED_MAX in baseline.policy.ts, the maxItems of the schema in cycle.dto.ts: the departments of the year, cut to the most a division of the ceiling names; departmentsTotal says how many there are',
    },
    rationale:
      'the departments of the year, cut to the most a division of the ceiling names; departmentsTotal says how many there are',
    removeWhen: 'Review when DEPARTMENTS_LISTED_MAX changes or the answer is paged.',
  },
];
