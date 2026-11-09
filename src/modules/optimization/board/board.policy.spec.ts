import {
  canReclaim,
  confidenceLabelOf,
  departmentsOfScope,
  headEvidenceOf,
  INTERNAL_SOFTWARE_LIMITATION,
  isValidKpi5Period,
  labelsOf,
} from './board.policy';

const g2Evidence = {
  group: 'G2',
  employeeId: 'e',
  leftOn: null,
  planId: 'p',
  provisioningType: 'K1',
  terminatingAccess: null,
} as const;

describe('board policy', () => {
  it('US-10-05 AC-1: labels a G1 and a G2 as internal data, with no level and no percentage', () => {
    expect(confidenceLabelOf('G1')).toBe('INTERNAL_DATA');
    expect(confidenceLabelOf('G2')).toBe('INTERNAL_DATA');
  });

  it('BR-MF5-01: the action to reclaim is offered on an open G2 only', () => {
    expect(canReclaim({ group: 'G2', state: 'OPEN' })).toBe(true);
    expect(canReclaim({ group: 'G2', state: 'RECLAIM_DECIDED' })).toBe(false);
    expect(canReclaim({ group: 'G1', state: 'OPEN' })).toBe(false);
  });

  it('US-07-05 AC-12, DA6-27: says the reclaim is under way, the access runs on, or the holder left', () => {
    const base = { state: 'OPEN', revocationTaskId: null, holderLeftOn: null, evidence: g2Evidence } as const;
    const none = { revocationUnderWay: false, terminatingUntil: false, holderLeft: false };

    expect(labelsOf(base)).toEqual(none);
    expect(labelsOf({ ...base, state: 'RECLAIM_DECIDED', revocationTaskId: 'task' })).toEqual({
      ...none,
      revocationUnderWay: true,
    });
    expect(
      labelsOf({
        ...base,
        state: 'RECLAIM_DECIDED',
        evidence: { ...g2Evidence, terminatingAccess: { until: '2026-11-30' } },
      }),
    ).toEqual({ ...none, terminatingUntil: true });
    expect(labelsOf({ ...base, state: 'RECLAIM_DECIDED', holderLeftOn: '2026-11-09' })).toEqual({
      ...none,
      holderLeft: true,
    });
  });

  it('limits the read to the departments in charge for MINE and to none for ALL', () => {
    expect(departmentsOfScope('MINE', ['d1', 'd2'])).toEqual(['d1', 'd2']);
    expect(departmentsOfScope('MINE', [])).toEqual([]);
    expect(departmentsOfScope('ALL', ['d1'])).toBeUndefined();
  });

  it('DA6-40: carries a limitation for internal software that says there is no usage source yet', () => {
    expect(INTERNAL_SOFTWARE_LIMITATION).toMatch(/chưa có nguồn usage/);
  });

  it('accepts a period of KPI-5 that does not go backwards and spans at most a year', () => {
    expect(isValidKpi5Period('2026-11-01', '2026-11-09')).toBe(true);
    expect(isValidKpi5Period('2026-11-09', '2026-11-09')).toBe(true);
    expect(isValidKpi5Period('2026-11-10', '2026-11-09')).toBe(false);
    expect(isValidKpi5Period('2025-01-01', '2026-11-09')).toBe(false);
  });
});

describe('headEvidenceOf — M5-44 (SoD-2, FR-4.12): a head reads the evidence in short', () => {
  const evidence = {
    group: 'G4' as const,
    employeeId: '00000000-0000-4000-8000-000000000001',
    planId: '00000000-0000-4000-8000-000000000002',
    sources: [
      {
        sourceId: '00000000-0000-4000-8000-000000000003',
        name: 'Figma admin report',
        kind: 'VENDOR' as const,
        coverageFrom: '2026-06-01',
        coverageTo: '2026-08-31',
        ageDays: 2,
        activityDefinition: 'opened a file',
        strictness: 'STRICT' as const,
      },
    ],
    matchMethod: 'ALIAS_RULE' as const,
    activityStatus: 'INACTIVE' as const,
    lastActiveDate: '2026-06-20',
    inactiveDays: 70,
    coverageDays: 91,
    thresholds: { values: { monitor: 30, review: 60, action: 90 }, origin: 'DEFAULT' as const },
    confidence: { level: 'MEDIUM' as const, reasons: ['matched by the rule of aliases'] },
    labels: [],
    timeBound: null,
    potentialSaving: null,
    previousDecision: null,
  };

  it('keeps the state, the days, the thresholds, the level and the name and window of each source', () => {
    expect(headEvidenceOf(evidence)).toEqual({
      group: 'G4',
      activityStatus: 'INACTIVE',
      lastActiveDate: '2026-06-20',
      inactiveDays: 70,
      coverageDays: 91,
      thresholds: evidence.thresholds,
      confidence: { level: 'MEDIUM' },
      timeBound: null,
      potentialSaving: null,
      previousDecision: null,
      sources: [{ name: 'Figma admin report', kind: 'VENDOR', coverageFrom: '2026-06-01', coverageTo: '2026-08-31' }],
    });
  });

  it('never carries how the person was tied, the age or the definition of a source, or the reasons of the confidence', () => {
    const text = JSON.stringify(headEvidenceOf(evidence));

    expect(text).not.toMatch(
      /matchMethod|ALIAS_RULE|ageDays|activityDefinition|strictness|sourceId|reasons|employeeId/,
    );
  });
});
