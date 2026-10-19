import { BOOTSTRAP_ACTIONS, bootstrapMismatches, maskEmail, problemsOf, summarizeMigrations } from './inspection-facts';

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

describe('bootstrapMismatches', () => {
  const complete = new Map(BOOTSTRAP_ACTIONS.map(({ action, expected }) => [action, expected]));

  it('expects the seven installation actions, the employee one twice', () => {
    expect(BOOTSTRAP_ACTIONS).toEqual([
      { action: 'INSTALLATION.ORGANIZATION_CREATED', expected: 1 },
      { action: 'INSTALLATION.COST_CENTER_CREATED', expected: 1 },
      { action: 'INSTALLATION.DEPARTMENT_CREATED', expected: 1 },
      { action: 'INSTALLATION.JOB_TITLE_CREATED', expected: 1 },
      { action: 'INSTALLATION.EMPLOYEE_CREATED', expected: 2 },
      { action: 'INSTALLATION.SUPER_ADMIN_CREATED', expected: 1 },
    ]);
    expect(bootstrapMismatches(complete)).toEqual([]);
  });

  it('names each action whose count differs, missing or repeated', () => {
    const counts = new Map(complete);
    counts.set('INSTALLATION.EMPLOYEE_CREATED', 1);
    counts.set('INSTALLATION.DEPARTMENT_CREATED', 2);
    counts.delete('INSTALLATION.SUPER_ADMIN_CREATED');

    expect(bootstrapMismatches(counts)).toEqual([
      'INSTALLATION.DEPARTMENT_CREATED',
      'INSTALLATION.EMPLOYEE_CREATED',
      'INSTALLATION.SUPER_ADMIN_CREATED',
    ]);
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

  it('finds nothing wrong with a complete, consistent installation', () => {
    expect(problemsOf({ migrations, bootstrapMismatches: [], superAdmin })).toEqual([]);
  });

  it('lists every problem in a fixed order', () => {
    expect(
      problemsOf({
        migrations: { ...migrations, pending: ['a'], failed: ['b'], unknown: ['c'] },
        bootstrapMismatches: ['INSTALLATION.EMPLOYEE_CREATED'],
        superAdmin: { ...superAdmin, status: 'LOCKED' },
      }),
    ).toEqual([
      'MIGRATIONS_PENDING',
      'MIGRATIONS_FAILED',
      'MIGRATIONS_UNKNOWN',
      'BOOTSTRAP_RECORDS_INCOMPLETE',
      'SUPER_ADMIN_NOT_USABLE',
    ]);
  });

  it('reports a missing Super Admin, and an invited one as not usable', () => {
    expect(problemsOf({ migrations, bootstrapMismatches: [], superAdmin: null })).toEqual(['SUPER_ADMIN_MISSING']);
    expect(
      problemsOf({ migrations, bootstrapMismatches: [], superAdmin: { ...superAdmin, activationState: 'INVITED' } }),
    ).toEqual(['SUPER_ADMIN_NOT_USABLE']);
  });
});
