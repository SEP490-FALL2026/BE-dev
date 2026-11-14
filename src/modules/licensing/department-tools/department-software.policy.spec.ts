import {
  catalogRefusal,
  decisionRefusal,
  entryKey,
  mayChangeList,
  mayReadList,
  normalizedNote,
  proposerDepartment,
  repeatedItem,
  type CatalogFacts,
} from './department-software.policy';

const APP = '11111111-1111-4111-8111-111111111111';
const APP_2 = '22222222-2222-4222-8222-222222222222';
const PLAN = '33333333-3333-4333-8333-333333333333';
const PLAN_2 = '44444444-4444-4444-8444-444444444444';
const DEPARTMENT = '55555555-5555-4555-8555-555555555555';

const facts = (overrides: Partial<CatalogFacts> = {}): CatalogFacts => ({
  applications: new Map([
    [APP, { retired: false }],
    [APP_2, { retired: true }],
  ]),
  plans: new Map([
    [PLAN, { applicationId: APP }],
    [PLAN_2, { applicationId: APP_2 }],
  ]),
  ...overrides,
});

describe('entryKey', () => {
  it('tells an application alone from the same application with a plan', () => {
    expect(entryKey({ applicationId: APP, planId: null })).not.toBe(entryKey({ applicationId: APP, planId: PLAN }));
    expect(entryKey({ applicationId: APP, planId: null })).toBe(entryKey({ applicationId: APP, planId: null }));
  });
});

describe('repeatedItem (a duplicate in one request is refused, as the unique index refuses it in the table)', () => {
  it('finds the first item that appears twice, an application alone counting as one place', () => {
    expect(
      repeatedItem([
        { applicationId: APP, planId: PLAN },
        { applicationId: APP, planId: null },
        { applicationId: APP, planId: null },
      ]),
    ).toEqual({ applicationId: APP, planId: null });
  });

  it('is null when every item is different, even for one application', () => {
    expect(
      repeatedItem([
        { applicationId: APP, planId: PLAN },
        { applicationId: APP, planId: null },
        { applicationId: APP_2, planId: PLAN },
      ]),
    ).toBeNull();
  });
});

describe('catalogRefusal (only what the catalog offers goes in the list, QĐ-110s)', () => {
  it('accepts an application of the catalog, alone or with one of its plans', () => {
    expect(catalogRefusal({ applicationId: APP, planId: null }, facts())).toBeNull();
    expect(catalogRefusal({ applicationId: APP, planId: PLAN }, facts())).toBeNull();
  });

  it('refuses an application the catalog does not have', () => {
    expect(catalogRefusal({ applicationId: PLAN, planId: null }, facts())).toBe('NOT_IN_CATALOG');
  });

  it('refuses a retired application, with or without a plan', () => {
    expect(catalogRefusal({ applicationId: APP_2, planId: null }, facts())).toBe('NOT_IN_CATALOG');
    expect(catalogRefusal({ applicationId: APP_2, planId: PLAN_2 }, facts())).toBe('NOT_IN_CATALOG');
  });

  it('refuses a plan the catalog does not have', () => {
    expect(catalogRefusal({ applicationId: APP, planId: APP }, facts())).toBe('NOT_IN_CATALOG');
  });

  it('refuses a plan of another application', () => {
    expect(catalogRefusal({ applicationId: APP, planId: PLAN_2 }, facts())).toBe('NOT_IN_CATALOG');
  });
});

describe('mayReadList (a member, the head, the IT Admin and the Super Admin read; nobody else, P16)', () => {
  const none = { roles: [] as string[], isMember: false, isHead: false };

  it.each([
    ['a member of the department', { ...none, isMember: true }],
    ['the head of the department', { ...none, isHead: true }],
    ['an IT Admin, whichever department', { ...none, roles: ['IT_ADMIN'] }],
    ['the Super Admin', { ...none, roles: ['SUPER_ADMIN'] }],
  ])('lets %s read', (_name, who) => {
    expect(mayReadList(who)).toBe(true);
  });

  it('keeps out a person of another department and Finance, whatever else they hold', () => {
    expect(mayReadList({ ...none, roles: ['EMPLOYEE'] })).toBe(false);
    expect(mayReadList({ ...none, roles: ['FINANCE', 'SPENDING_APPROVER'] })).toBe(false);
    expect(mayReadList({ ...none, roles: ['MANAGER'] })).toBe(false);
  });
});

describe('mayChangeList (only the IT Admin who is in charge of the department writes, QĐ-110s)', () => {
  it('lets the IT Admin in charge', () => {
    expect(mayChangeList({ roles: ['IT_ADMIN'], inItAdminScope: true })).toBe(true);
  });

  it('refuses an IT Admin of another department', () => {
    expect(mayChangeList({ roles: ['IT_ADMIN'], inItAdminScope: false })).toBe(false);
  });

  it('refuses the Super Admin, the head and a member even when the department is theirs: they read, they do not write', () => {
    expect(mayChangeList({ roles: ['SUPER_ADMIN'], inItAdminScope: true })).toBe(false);
    expect(mayChangeList({ roles: ['MANAGER'], inItAdminScope: true })).toBe(false);
    expect(mayChangeList({ roles: ['EMPLOYEE'], inItAdminScope: true })).toBe(false);
  });
});

describe('proposerDepartment (only the head of a department proposes, for that department, QĐ-110t)', () => {
  it('is the department the head leads today', () => {
    expect(proposerDepartment({ headedDepartmentId: DEPARTMENT })).toBe(DEPARTMENT);
  });

  it('is null for a person who heads none, whatever role they hold', () => {
    expect(proposerDepartment({ headedDepartmentId: null })).toBeNull();
  });
});

describe('decisionRefusal (an open proposal is decided once)', () => {
  it('lets a pending proposal be accepted or rejected', () => {
    expect(decisionRefusal('PENDING')).toBeNull();
  });

  it.each(['ACCEPTED', 'REJECTED'] as const)('refuses one already %s', (state) => {
    expect(decisionRefusal(state)).toBe('NOT_PENDING');
  });
});

describe('normalizedNote (what the database accepts, said before the insert so a bad note never aborts the transaction of the caller)', () => {
  it('trims the note and keeps what is left', () => {
    expect(normalizedNote('  for the designers  ')).toEqual({ note: 'for the designers' });
  });

  it.each([undefined, null, '', '   ', '\t\n', '\u00a0'])('turns %j into no note', (given) => {
    expect(normalizedNote(given)).toEqual({ note: null });
  });

  it('accepts exactly 500 characters once trimmed and refuses 501', () => {
    expect(normalizedNote(`  ${'x'.repeat(500)}  `)).toEqual({ note: 'x'.repeat(500) });
    expect(normalizedNote('x'.repeat(501))).toEqual({ refusal: 'TOO_LONG' });
  });

  it('refuses a character no text column keeps (NUL)', () => {
    expect(normalizedNote('a\u0000b')).toEqual({ refusal: 'ILLEGAL_CHARACTER' });
  });
});
