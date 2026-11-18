import { confidenceOf, contradictionsOf, type ConfidenceFacts } from './confidence.policy';

const clean: ConfidenceFacts = {
  weakestMethod: 'EXACT_EMAIL',
  looseSource: false,
  usesCollector: false,
  coverageDays: 90,
  daysConsidered: 90,
  oldestSource: { kind: 'VENDOR', ageDays: 1 },
  daysOverLowerThreshold: 30,
  contradictions: [],
};

describe('confidence (QĐ-35b, QĐ-101j, FR-4.14, US-10-04 AC-7): high, one step down for each factor, never a percentage', () => {
  it('is high for an exact tie, a strict source, full coverage and data of a day', () => {
    expect(confidenceOf(clean)).toEqual({ level: 'HIGH', reasons: [] });
  });

  it('is medium for an alias rule alone, with a sentence', () => {
    const out = confidenceOf({ ...clean, weakestMethod: 'ALIAS_RULE' });

    expect(out.level).toBe('MEDIUM');
    expect(out.reasons).toHaveLength(1);
  });

  it('is low for a loose source and data of 5 days, with two sentences', () => {
    const out = confidenceOf({ ...clean, looseSource: true, oldestSource: { kind: 'VENDOR', ageDays: 5 } });

    expect(out.level).toBe('LOW');
    expect(out.reasons).toHaveLength(2);
  });

  it.each([
    ['CF-3 the collector (P-05)', { usesCollector: true }],
    ['CF-4 coverage under 80%', { coverageDays: 71 }],
    ['CF-5 a collector of 8 days', { oldestSource: { kind: 'COLLECTOR' as const, ageDays: 8 } }],
    ['CF-6 within 14 days of the lower threshold', { daysOverLowerThreshold: 13 }],
    ['CF-7 a contradicting signal', { contradictions: ['Contradicting signal: x'] }],
  ])('%s lowers one step', (_name, over) => {
    expect(confidenceOf({ ...clean, ...over }).level).toBe('MEDIUM');
  });

  it('exactly 80% coverage, a vendor of 3 days and 14 days over the threshold lower nothing', () => {
    expect(
      confidenceOf({
        ...clean,
        coverageDays: 72,
        oldestSource: { kind: 'VENDOR', ageDays: 3 },
        daysOverLowerThreshold: 14,
      }).level,
    ).toBe('HIGH');
  });
});

describe('CF-7: signals that contradict the days (DA6-41)', () => {
  it('names a login, a changed tie and an identifier of no one active after the last day', () => {
    const out = contradictionsOf({
      lastActiveDate: '2026-06-24',
      lastAuthOnlyDate: '2026-08-01',
      mappingChangedOn: '2026-07-01',
      unmatchedLastActivity: ['2026-08-23', null, '2026-01-01'],
    });

    expect(out).toHaveLength(3);
    expect(
      contradictionsOf({
        lastActiveDate: '2026-06-24',
        lastAuthOnlyDate: '2026-06-01',
        mappingChangedOn: null,
        unmatchedLastActivity: [],
      }),
    ).toEqual([]);
  });

  it('E7: an open identifier active 10 days ago against a last day 70 days ago makes a G4 review medium', () => {
    const contradictions = contradictionsOf({
      lastActiveDate: '2026-06-24',
      lastAuthOnlyDate: null,
      mappingChangedOn: null,
      unmatchedLastActivity: ['2026-08-23'],
    });

    expect(confidenceOf({ ...clean, daysOverLowerThreshold: 40, contradictions }).level).toBe('MEDIUM');
  });
});
