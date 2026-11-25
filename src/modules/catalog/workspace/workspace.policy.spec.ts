import {
  WorkspaceAdminsTooFewError,
  WorkspaceLimitExceededError,
  WorkspaceNotResponsibleError,
  WorkspacePrimaryOwnerNotAdminError,
  WorkspaceResponsibleNotItAdminError,
  WorkspaceTextInvalidError,
} from './workspace.errors';
import {
  assertAdminsShape,
  assertResponsible,
  cleanWorkspaceText,
  judgeResponsibleChange,
  MIN_WORKSPACE_ADMINS,
  notYetBlocked,
  workspaceFlags,
} from './workspace.policy';

const KHOA = 'khoa';
const NAM = 'nam';
const LAN = 'lan';

describe('the text of a workspace', () => {
  it('collapses blanks, takes nothing or blanks for null, and refuses more than 2000 characters', () => {
    expect(cleanWorkspaceText('  a   b ')).toBe('a b');
    expect(cleanWorkspaceText('   ')).toBeNull();
    expect(cleanWorkspaceText(null)).toBeNull();
    expect(cleanWorkspaceText(undefined)).toBeNull();
    expect(cleanWorkspaceText('x'.repeat(2000))).toHaveLength(2000);
    expect(() => cleanWorkspaceText('x'.repeat(2001))).toThrow(WorkspaceTextInvalidError);
  });
});

describe('who administers a workspace', () => {
  const shape = (overrides: Partial<Parameters<typeof assertAdminsShape>[0]> = {}) => ({
    admins: [
      { employeeId: KHOA, role: 'OWNER' as const },
      { employeeId: NAM, role: 'ADMIN' as const },
    ],
    primaryOwnerEmployeeId: KHOA,
    ownerLimit: null,
    adminLimit: null,
    ...overrides,
  });

  it('needs at least two different people (the minimum is two)', () => {
    expect(MIN_WORKSPACE_ADMINS).toBe(2);
    expect(() => assertAdminsShape(shape())).not.toThrow();
    expect(() => assertAdminsShape(shape({ admins: [{ employeeId: KHOA, role: 'OWNER' }] }))).toThrow(
      WorkspaceAdminsTooFewError,
    );
    try {
      assertAdminsShape(shape({ admins: [{ employeeId: KHOA, role: 'OWNER' }] }));
    } catch (error) {
      expect(error).toMatchObject({ given: 1, minimum: 2 });
    }
  });

  it('counts a person named twice once', () => {
    expect(() =>
      assertAdminsShape(
        shape({
          admins: [
            { employeeId: KHOA, role: 'OWNER' },
            { employeeId: KHOA, role: 'ADMIN' },
          ],
        }),
      ),
    ).toThrow(WorkspaceAdminsTooFewError);
  });

  it('wants the primary owner among the administrators, with the role OWNER', () => {
    expect(() => assertAdminsShape(shape({ primaryOwnerEmployeeId: LAN }))).toThrow(WorkspacePrimaryOwnerNotAdminError);
    expect(() => assertAdminsShape(shape({ primaryOwnerEmployeeId: NAM }))).toThrow(WorkspacePrimaryOwnerNotAdminError);
  });

  it.each([
    { ownerLimit: 1, adminLimit: null, owners: 2, admins: 1, role: 'OWNER' },
    { ownerLimit: null, adminLimit: 1, owners: 1, admins: 2, role: 'ADMIN' },
  ])('refuses more $role than the limit allows', ({ ownerLimit, adminLimit, owners, admins, role }) => {
    const people = [
      ...Array.from({ length: owners }, (_, index) => ({ employeeId: `o${index}`, role: 'OWNER' as const })),
      ...Array.from({ length: admins }, (_, index) => ({ employeeId: `a${index}`, role: 'ADMIN' as const })),
    ];
    try {
      assertAdminsShape({ admins: people, primaryOwnerEmployeeId: 'o0', ownerLimit, adminLimit });
      throw new Error('not refused');
    } catch (error) {
      expect(error).toBeInstanceOf(WorkspaceLimitExceededError);
      expect(error).toMatchObject({ role });
    }
  });

  it('lets the limit itself pass', () => {
    expect(() => assertAdminsShape(shape({ ownerLimit: 1, adminLimit: 1 }))).not.toThrow();
  });
});

describe('who answers for a workspace', () => {
  it('lets only the IT Admin in charge change it; nobody is in charge of one without a person', () => {
    expect(() => assertResponsible(KHOA, KHOA)).not.toThrow();
    expect(() => assertResponsible(NAM, KHOA)).toThrow(WorkspaceNotResponsibleError);
    expect(() => assertResponsible(KHOA, null)).toThrow(WorkspaceNotResponsibleError);
  });

  it('judges the person named first, then whether they already answer for it', () => {
    expect(judgeResponsibleChange({ currentEmployeeId: KHOA, toEmployeeId: NAM, toIsUsableItAdmin: true })).toBe(
      'CHANGE',
    );
    expect(judgeResponsibleChange({ currentEmployeeId: NAM, toEmployeeId: NAM, toIsUsableItAdmin: true })).toBe(
      'UNCHANGED',
    );
    expect(judgeResponsibleChange({ currentEmployeeId: null, toEmployeeId: NAM, toIsUsableItAdmin: true })).toBe(
      'CHANGE',
    );
    expect(() =>
      judgeResponsibleChange({ currentEmployeeId: NAM, toEmployeeId: NAM, toIsUsableItAdmin: false }),
    ).toThrow(WorkspaceResponsibleNotItAdminError);
  });
});

describe('the flags of a workspace', () => {
  it.each([
    { working: 2, email: 'it@acme.vn', responsible: KHOA, flags: [] },
    { working: 1, email: 'it@acme.vn', responsible: KHOA, flags: ['ADMINS_BELOW_MINIMUM'] },
    { working: 0, email: null, responsible: null, flags: ['ADMINS_BELOW_MINIMUM', 'NO_OWNER_EMAIL', 'NO_RESPONSIBLE'] },
    { working: 3, email: null, responsible: KHOA, flags: ['NO_OWNER_EMAIL'] },
    { working: 5, email: 'it@acme.vn', responsible: null, flags: ['NO_RESPONSIBLE'] },
  ])(
    '$working working administrators, email $email, in charge $responsible: $flags',
    ({ working, email, responsible, flags }) => {
      expect(
        workspaceFlags({
          workingAdminCount: working,
          ownerAccountEmail: email,
          responsibleItAdminEmployeeId: responsible,
        }),
      ).toEqual(flags);
    },
  );
});

describe('the administrators a departure does not refuse yet', () => {
  it('keeps who has no block and whoever is blocked from a later day, and drops whoever is blocked today or earlier', () => {
    const people = new Set(['a', 'b', 'c', 'd']);
    const blocks = new Map([
      ['b', '2026-12-10'],
      ['c', '2026-12-09'],
      ['d', '2026-12-08'],
    ]);

    expect([...notYetBlocked(people, blocks, '2026-12-09')].sort()).toEqual(['a', 'b']);
  });
});
