import {
  BOOTSTRAP_ACTIONS,
  CURRENT_INSTALLATION_RECORDS,
  EARLIER_INSTALLATION_RECORDS,
  NO_ANNOUNCEMENT_GAPS,
  announcementGapTotal,
  bootstrapMismatches,
  maskEmail,
  problemsOf,
  summarizeMigrations,
} from './inspection-facts.policy';

describe('summarizeMigrations', () => {
  const committed = ['20261001_a', '20261002_b', '20261003_c'];
  const row = (name: string, finished = true, rolledBack = false) => ({ name, finished, rolledBack });

  it('reports every committed migration pending when none was ever applied', () => {
    expect(summarizeMigrations(committed, null)).toEqual({
      committed: 3,
      applied: 0,
      pending: committed,
      failed: [],
      unknown: [],
    });
  });

  it('separates applied, failed, pending and unknown migrations', () => {
    expect(summarizeMigrations(committed, [row('20261001_a'), row('20261002_b', false), row('20260930_x')])).toEqual({
      committed: 3,
      applied: 1,
      pending: ['20261003_c'],
      failed: ['20261002_b'],
      unknown: ['20260930_x'],
    });
  });

  it('counts a migration rolled back and then applied again once, as applied', () => {
    expect(summarizeMigrations(['20261001_a'], [row('20261001_a', false, true), row('20261001_a')])).toEqual({
      committed: 1,
      applied: 1,
      pending: [],
      failed: [],
      unknown: [],
    });
  });

  it('reports a rolled-back migration that was not applied again as pending', () => {
    expect(summarizeMigrations(['20261001_a'], [row('20261001_a', false, true)]).pending).toEqual(['20261001_a']);
  });
});

describe('bootstrapMismatches (QĐ-87f: the current set and the set of an earlier installation)', () => {
  const current = new Map(Object.entries(CURRENT_INSTALLATION_RECORDS));
  const earlier = new Map(Object.entries(EARLIER_INSTALLATION_RECORDS));

  it('counts the same five actions in both sets; they differ in the Cost Center event and the number of employees', () => {
    expect(BOOTSTRAP_ACTIONS).toEqual([
      'INSTALLATION.ORGANIZATION_CREATED',
      'INSTALLATION.COST_CENTER_CREATED',
      'INSTALLATION.DEPARTMENT_CREATED',
      'INSTALLATION.EMPLOYEE_CREATED',
      'INSTALLATION.SUPER_ADMIN_CREATED',
    ]);
    expect(Object.keys(EARLIER_INSTALLATION_RECORDS)).toEqual(Object.keys(CURRENT_INSTALLATION_RECORDS));
    expect(CURRENT_INSTALLATION_RECORDS).toMatchObject({
      'INSTALLATION.COST_CENTER_CREATED': 0,
      'INSTALLATION.EMPLOYEE_CREATED': 1,
    });
    expect(EARLIER_INSTALLATION_RECORDS).toMatchObject({
      'INSTALLATION.COST_CENTER_CREATED': 1,
      'INSTALLATION.EMPLOYEE_CREATED': 2,
    });
  });

  it('accepts the current set: one department, one employee, no Cost Center (an absent action counts 0)', () => {
    expect(bootstrapMismatches(current)).toEqual([]);

    const withoutZeros = new Map([...current].filter(([, count]) => count > 0));
    expect(bootstrapMismatches(withoutZeros)).toEqual([]);
  });

  it('accepts the set of an earlier installation: a Cost Center and the IT employee beside the Super Admin', () => {
    expect(bootstrapMismatches(earlier)).toEqual([]);
  });

  it('names each action whose count differs, missing or repeated, against the set the installation belongs to', () => {
    const counts = new Map(current);
    counts.set('INSTALLATION.EMPLOYEE_CREATED', 2);
    counts.set('INSTALLATION.DEPARTMENT_CREATED', 2);
    counts.delete('INSTALLATION.SUPER_ADMIN_CREATED');

    expect(bootstrapMismatches(counts)).toEqual([
      'INSTALLATION.DEPARTMENT_CREATED',
      'INSTALLATION.EMPLOYEE_CREATED',
      'INSTALLATION.SUPER_ADMIN_CREATED',
    ]);

    const oldOnes = new Map(earlier);
    oldOnes.set('INSTALLATION.EMPLOYEE_CREATED', 1);
    expect(bootstrapMismatches(oldOnes)).toEqual(['INSTALLATION.EMPLOYEE_CREATED']);
  });

  it('does not accept a mixture: a Cost Center event with one employee, or two employees with no Cost Center', () => {
    expect(bootstrapMismatches(new Map(current).set('INSTALLATION.COST_CENTER_CREATED', 1))).toEqual([
      'INSTALLATION.EMPLOYEE_CREATED',
    ]);
    expect(bootstrapMismatches(new Map(current).set('INSTALLATION.EMPLOYEE_CREATED', 2))).toEqual([
      'INSTALLATION.EMPLOYEE_CREATED',
    ]);
    expect(bootstrapMismatches(new Map(current).set('INSTALLATION.COST_CENTER_CREATED', 2))).toEqual([
      'INSTALLATION.COST_CENTER_CREATED',
    ]);
  });
});

describe('announcementGapTotal (F47)', () => {
  it('is 0 for a database whose announcements are complete, and the sum of the kinds otherwise', () => {
    expect(announcementGapTotal(NO_ANNOUNCEMENT_GAPS)).toBe(0);
    expect(announcementGapTotal({ PLACEMENT_START: 2, HEAD_PERIOD_START: 0, HEAD_PERIOD_END: 1 })).toBe(3);
  });
});

describe('maskEmail', () => {
  it.each([
    ['bao@acme.vn', 'b***@a***.vn'],
    ['Pham.Bao@Mail.Acme.COM', 'p***@m***.com'],
    ['x@y.io', 'x***@y***.io'],
  ])('masks %s as %s', (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });

  it('keeps neither the rest of the local part nor the domain name', () => {
    const masked = maskEmail('secret.person@private-company.example');

    expect(masked).toBe('s***@p***.example');
    expect(masked).not.toContain('person');
    expect(masked).not.toContain('company');
  });

  it('returns a fixed placeholder for a value that is not an email', () => {
    expect(maskEmail('not an email')).toBe('***');
  });
});

describe('problemsOf', () => {
  const migrations = { committed: 2, applied: 2, pending: [], failed: [], unknown: [] };
  const superAdmin = { holders: 1, status: 'ACTIVE' as const, activationState: 'ACTIVATED' as const };
  const changeAnnouncements = NO_ANNOUNCEMENT_GAPS;

  it('finds nothing wrong with a complete, consistent installation', () => {
    expect(problemsOf({ migrations, bootstrapMismatches: [], changeAnnouncements, superAdmin })).toEqual([]);
  });

  it('lists every problem in a fixed order', () => {
    expect(
      problemsOf({
        migrations: { ...migrations, pending: ['a'], failed: ['b'], unknown: ['c'] },
        bootstrapMismatches: ['INSTALLATION.EMPLOYEE_CREATED'],
        changeAnnouncements: { PLACEMENT_START: 1, HEAD_PERIOD_START: 0, HEAD_PERIOD_END: 0 },
        superAdmin: { ...superAdmin, status: 'LOCKED' },
      }),
    ).toEqual([
      'MIGRATIONS_PENDING',
      'MIGRATIONS_FAILED',
      'MIGRATIONS_UNKNOWN',
      'BOOTSTRAP_RECORDS_INCOMPLETE',
      'CHANGE_ANNOUNCEMENTS_MISSING',
      'SUPER_ADMIN_NOT_USABLE',
    ]);
  });

  it('reports a missing Super Admin, and an invited one as not usable', () => {
    expect(problemsOf({ migrations, bootstrapMismatches: [], changeAnnouncements, superAdmin: null })).toEqual([
      'SUPER_ADMIN_MISSING',
    ]);
    expect(
      problemsOf({
        migrations,
        bootstrapMismatches: [],
        changeAnnouncements,
        superAdmin: { ...superAdmin, activationState: 'INVITED' },
      }),
    ).toEqual(['SUPER_ADMIN_NOT_USABLE']);
  });

  it.each([
    [{ PLACEMENT_START: 1, HEAD_PERIOD_START: 0, HEAD_PERIOD_END: 0 }],
    [{ PLACEMENT_START: 0, HEAD_PERIOD_START: 3, HEAD_PERIOD_END: 0 }],
    [{ PLACEMENT_START: 0, HEAD_PERIOD_START: 0, HEAD_PERIOD_END: 2 }],
  ])('reports a change the seeding migration missed, whatever its kind (F47): %j', (gaps) => {
    expect(problemsOf({ migrations, bootstrapMismatches: [], changeAnnouncements: gaps, superAdmin })).toEqual([
      'CHANGE_ANNOUNCEMENTS_MISSING',
    ]);
  });
});
