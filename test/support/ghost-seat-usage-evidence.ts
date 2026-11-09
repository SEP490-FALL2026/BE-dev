/** The evidence a seeded `G3`/`G4` carries (complete, so the codec reads it): a person never seen, or one inactive for 70 covered days. */
export function seedUsageEvidence(group: 'G3' | 'G4', employeeId: string, planId: string): Record<string, unknown> {
  return {
    group,
    employeeId,
    planId,
    sources: [],
    matchMethod: null,
    activityStatus: group === 'G3' ? 'NEVER_ACTIVE' : 'INACTIVE',
    lastActiveDate: null,
    inactiveDays: group === 'G3' ? null : 70,
    coverageDays: 90,
    thresholds: { values: { monitor: 30, review: 60, action: 90 }, origin: 'DEFAULT' },
    confidence: { level: 'HIGH', reasons: [] },
    labels: [],
    timeBound: null,
    potentialSaving: null,
    previousDecision: null,
  };
}

/** The confidence and the activity status a seeded recommendation of the group carries (the table wants both for a `G3`/`G4`, neither for the others). */
export function seedUsageColumns(group: string): [string | null, string | null] {
  if (group === 'G3') return ['HIGH', 'NEVER_ACTIVE'];

  return group === 'G4' ? ['HIGH', 'INACTIVE'] : [null, null];
}
