import {
  assessUsage,
  chainEvidenceOf,
  consideredFrom,
  coveredRanges,
  daysAfter,
  oneMonthAfter,
  personEvidenceOf,
  reactionToActivity,
  thresholdsOf,
} from './usage-assessment.policy';

const T = thresholdsOf(null, null);
const ranges = (
  windows: Array<{ from: string; to: string }>,
  usableOn: string,
  today: string,
  leaves: Array<{ from: string; until: string | null }> = [],
) => coveredRanges({ windows, usableOn, today, leaves });

describe('thresholds: application over organization over default (FR-4.13, US-10-03 AC-6)', () => {
  it('takes the application first, then the parameter, then 30/60/90', () => {
    expect(thresholdsOf({ monitor: 40, review: 120, action: 200 }, [20, 40, 80])).toMatchObject({
      review: 120,
      origin: 'APPLICATION',
    });
    expect(thresholdsOf(null, [20, 40, 80])).toMatchObject({
      monitor: 20,
      review: 40,
      action: 80,
      origin: 'ORGANIZATION',
    });
    expect(thresholdsOf(null, null)).toMatchObject({ monitor: 30, review: 60, action: 90, origin: 'DEFAULT' });
  });
});

describe('counting the days without activity over the days a source covers (FR-4.14a(3), DA6-05)', () => {
  it('reports of 01/06-30/06 and 01/08-31/08 with the last day 10/06 give 20 + 31 = 51, not 82', () => {
    const covered = ranges(
      [
        { from: '2026-06-01', to: '2026-06-30' },
        { from: '2026-08-01', to: '2026-08-31' },
      ],
      '2026-01-05',
      '2026-09-01',
    );
    const out = assessUsage({ activeDates: ['2026-06-10'], appeared: true, ranges: covered, thresholds: T });

    expect(out).toMatchObject({ status: 'INACTIVE', inactiveDays: 51, tier: 'MONITOR', lastActiveDate: '2026-06-10' });
  });

  it('subtracts the days of long leave: 75 days after the last day with 20 on leave leave 55 (watch)', () => {
    const covered = ranges([{ from: '2026-06-01', to: '2026-09-01' }], '2026-01-05', '2026-09-01', [
      { from: '2026-07-01', until: '2026-07-21' },
    ]);
    const out = assessUsage({ activeDates: ['2026-06-18'], appeared: true, ranges: covered, thresholds: T });

    expect(out.inactiveDays).toBe(75 - 20);
    expect(out.tier).toBe('MONITOR');
  });

  it('counts only from the day the seat could be used', () => {
    const covered = ranges([{ from: '2026-06-01', to: '2026-08-31' }], '2026-07-15', '2026-09-01');

    expect(daysAfter(covered, null)).toBe(48);
  });

  it('a last day before the window counts the whole window: the action tier, not a G3', () => {
    const covered = ranges([{ from: '2026-06-03', to: '2026-09-01' }], '2026-01-05', '2026-09-01');
    const out = assessUsage({ activeDates: ['2026-04-05'], appeared: true, ranges: covered, thresholds: T });

    expect(out).toMatchObject({ status: 'INACTIVE', inactiveDays: 91, tier: 'ACTION' });
  });

  it('a person only seen (a login) is inactive for every covered day, never never-active (FR-4.11, DA6-13)', () => {
    const covered = ranges([{ from: '2026-06-24', to: '2026-09-01' }], '2026-01-05', '2026-09-01');
    const out = assessUsage({ activeDates: [], appeared: true, ranges: covered, thresholds: T });

    expect(out).toMatchObject({ status: 'INACTIVE', inactiveDays: 70, tier: 'REVIEW' });
  });

  it('a person who does not appear at all is G3: never active, action tier', () => {
    const covered = ranges([{ from: '2026-06-03', to: '2026-09-01' }], '2026-06-03', '2026-09-02');
    const out = assessUsage({ activeDates: [], appeared: false, ranges: covered, thresholds: T });

    expect(out).toMatchObject({ status: 'NEVER_ACTIVE', tier: 'ACTION', inactiveDays: null });
  });

  it('below the lowest threshold is active, with no tier', () => {
    const covered = ranges([{ from: '2026-06-03', to: '2026-09-01' }], '2026-01-05', '2026-09-01');

    expect(assessUsage({ activeDates: ['2026-08-20'], appeared: true, ranges: covered, thresholds: T })).toMatchObject({
      status: 'ACTIVE',
      tier: null,
    });
  });

  it('an application threshold of 120 for review keeps 80 days at the watch tier', () => {
    const covered = ranges([{ from: '2026-06-03', to: '2026-09-01' }], '2026-01-05', '2026-09-01');
    const thresholds = thresholdsOf({ monitor: 30, review: 120, action: 200 }, null);
    const out = assessUsage({ activeDates: ['2026-06-13'], appeared: true, ranges: covered, thresholds });

    expect(out.inactiveDays).toBe(80);
    expect(out.tier).toBe('MONITOR');
  });
});

describe('what the sources say of one person', () => {
  it('puts the days of every source together and keeps the weakest tie', () => {
    const source = (kind: 'VENDOR' | 'COLLECTOR', days: string[], method: 'EXACT_EMAIL' | 'ALIAS_RULE' | null) =>
      ({
        kind,
        employees: [
          {
            employeeId: 'e1',
            activeDates: days,
            appeared: true,
            lastAuthOnlyDate: null,
            weakestMethod: method,
            mappingChangedOn: null,
          },
        ],
      }) as never;
    const out = personEvidenceOf(
      [
        source('VENDOR', ['2026-08-01'], 'EXACT_EMAIL'),
        source('COLLECTOR', ['2026-08-05'], null),
        source('VENDOR', ['2026-08-01'], 'ALIAS_RULE'),
      ],
      'e1',
    );

    expect(out).toMatchObject({
      activeDates: ['2026-08-01', '2026-08-05'],
      weakestMethod: 'ALIAS_RULE',
      inCollector: true,
      appeared: true,
    });
    expect(personEvidenceOf([], 'e1').appeared).toBe(false);
  });
});

describe('what a day of activity does to a recommendation (US-10-04 AC-5, Q-92)', () => {
  it('denies an undecided one with a later day (any day for a G3) and flags a decided reclaim', () => {
    expect(reactionToActivity({ state: 'OPEN', lastActiveDate: '2026-06-10' }, ['2026-06-10'], null)).toEqual({
      kind: 'NONE',
    });
    expect(reactionToActivity({ state: 'OPEN', lastActiveDate: '2026-06-10' }, ['2026-08-31'], null)).toEqual({
      kind: 'NEGATE',
    });
    expect(reactionToActivity({ state: 'AWAITING_DECISION', lastActiveDate: null }, ['2026-08-31'], null)).toEqual({
      kind: 'NEGATE',
    });
    expect(
      reactionToActivity({ state: 'RECLAIM_DECIDED', lastActiveDate: null }, ['2026-08-31'], '2026-08-01'),
    ).toEqual({ kind: 'FLAG', firstDay: '2026-08-31' });
    expect(
      reactionToActivity({ state: 'RECLAIM_DECIDED', lastActiveDate: null }, ['2026-07-01'], '2026-08-01'),
    ).toEqual({
      kind: 'NONE',
    });
  });
});

describe('one calendar month after a day (R-J01)', () => {
  it('clamps to the end of a shorter month', () => {
    expect(oneMonthAfter('2026-12-01')).toBe('2027-01-01');
    expect(oneMonthAfter('2026-01-31')).toBe('2026-02-28');
    expect(oneMonthAfter('2026-12-31')).toBe('2027-01-31');
  });
});

describe('chainEvidenceOf — M5-15 (QĐ-35c, FR-4.7, FR-4.10): a seat given again inherits nothing of the old one', () => {
  const source = (windowTo: string, person: Partial<Record<string, unknown>>) =>
    ({
      kind: 'VENDOR',
      windows: [{ from: '2026-01-01', to: windowTo }],
      employees: [
        {
          employeeId: 'e1',
          activeDates: [],
          appeared: true,
          lastAuthOnlyDate: null,
          weakestMethod: 'EXACT_EMAIL',
          mappingChangedOn: null,
          ...person,
        },
      ],
    }) as never;

  it('a person seen only in a report that ended before the seat could be used has not appeared for it: a G3, never INACTIVE', () => {
    const out = chainEvidenceOf([source('2026-05-31', { activeDates: ['2026-03-10'] })], 'e1', '2026-06-01');

    expect(out).toMatchObject({ activeDates: [], appeared: false });
  });

  it('keeps the days, the sign-in without use and the change of mapping from the usable day only', () => {
    const out = chainEvidenceOf(
      [
        source('2026-08-31', {
          activeDates: ['2026-03-10', '2026-07-02'],
          lastAuthOnlyDate: '2026-04-01',
          mappingChangedOn: '2026-04-02',
        }),
      ],
      'e1',
      '2026-06-01',
    );

    expect(out).toMatchObject({
      activeDates: ['2026-07-02'],
      appeared: true,
      lastAuthOnlyDate: null,
      mappingChangedOn: null,
    });
  });
});

describe('consideredFrom — M5-17 (FR-4.14 CF-4): the days considered start where a source could first see them', () => {
  it('starts at the first day a source covers when the seat is older than every report', () => {
    expect(consideredFrom('2025-01-10', [{ windows: [{ from: '2026-06-01', to: '2026-08-31' }] }])).toBe('2026-06-01');
  });

  it('starts at the usable day when the seat is newer than the reports', () => {
    expect(consideredFrom('2026-07-01', [{ windows: [{ from: '2026-06-01', to: '2026-08-31' }] }])).toBe('2026-07-01');
    expect(consideredFrom('2026-07-01', [])).toBe('2026-07-01');
  });
});
