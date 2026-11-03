import {
  assessSuperAdmin,
  departureLevel,
  flagMap,
  flagsOf,
  isHighPriority,
  sameFlags,
  type HolderFacts,
  type RoleFacts,
} from './role-duties.policy';

const none: RoleFacts = {
  superAdmin: false,
  finance: false,
  spendingApprover: false,
  itAdminDepartments: 0,
  headsDepartment: false,
  workspaces: 0,
};

const holder = (extra: Partial<HolderFacts> = {}): HolderFacts => ({
  locked: false,
  activated: true,
  awaitingCredentialReset: false,
  employeeTerminated: false,
  workState: 'WORKING',
  ...extra,
});

describe('the roles a person who leaves holds (US-03-04 AC-11, AC-27, AC-28)', () => {
  it('gives no flag to a person who holds nothing', () => {
    expect(flagsOf(none)).toEqual([]);
    expect(isHighPriority([])).toBe(false);
  });

  it.each([
    [{ superAdmin: true }, ['SUPER_ADMIN_HOLDER']],
    [{ finance: true }, ['FINANCE']],
    [{ spendingApprover: true }, ['SPENDING_APPROVER']],
    [{ itAdminDepartments: 2 }, ['IT_ADMIN_IN_CHARGE']],
    [{ headsDepartment: true }, ['DEPARTMENT_HEAD']],
    [{ workspaces: 1 }, ['WORKSPACE_OWNER']],
  ] as [Partial<RoleFacts>, string[]][])('names the role of %j', (facts, expected) => {
    expect(flagsOf({ ...none, ...facts })).toEqual(expected);
  });

  it('never makes a flag of the substitute or the fallback approver, which are gone (QĐ-93c)', () => {
    const every: RoleFacts = {
      superAdmin: true,
      finance: true,
      spendingApprover: true,
      itAdminDepartments: 1,
      headsDepartment: true,
      workspaces: 1,
    };

    expect(flagsOf(every)).not.toContain('SUBSTITUTE_APPROVER');
    expect(flagsOf(every)).not.toContain('FALLBACK_APPROVER');
    expect(flagMap(flagsOf(every))).toMatchObject({ SUBSTITUTE_APPROVER: false, FALLBACK_APPROVER: false });
  });

  it('lists several roles in the order of the wire', () => {
    expect(flagsOf({ ...none, workspaces: 3, finance: true, headsDepartment: true, superAdmin: true })).toEqual([
      'SUPER_ADMIN_HOLDER',
      'FINANCE',
      'DEPARTMENT_HEAD',
      'WORKSPACE_OWNER',
    ]);
  });

  it('asks the highest priority only for the Super Admin and for a workspace', () => {
    expect(isHighPriority(['SUPER_ADMIN_HOLDER'])).toBe(true);
    expect(isHighPriority(['WORKSPACE_OWNER', 'FINANCE'])).toBe(true);
    expect(isHighPriority(['FINANCE', 'SPENDING_APPROVER', 'DEPARTMENT_HEAD', 'IT_ADMIN_IN_CHARGE'])).toBe(false);
  });

  it('gives every flag on the wire, true or false', () => {
    const wire = flagMap(['FINANCE']);

    expect(Object.keys(wire)).toHaveLength(8);
    expect(wire).toMatchObject({ FINANCE: true, SUPER_ADMIN_HOLDER: false, WORKSPACE_OWNER: false });
  });

  it('compares two sets of flags whatever their order', () => {
    expect(sameFlags(['FINANCE', 'DEPARTMENT_HEAD'], ['DEPARTMENT_HEAD', 'FINANCE'])).toBe(true);
    expect(sameFlags(['FINANCE'], ['FINANCE', 'DEPARTMENT_HEAD'])).toBe(false);
    expect(sameFlags([], [])).toBe(true);
  });
});

describe('how far the departure of the person has come (US-03-04 AC-12)', () => {
  it.each([
    ['HANDING_OVER', '2026-10-05', '2026-10-02', 'LEAVING'],
    ['HANDING_OVER', '2026-10-05', '2026-10-05', 'LEAVING'],
    ['HANDING_OVER', '2026-09-30', '2026-10-02', 'OVERDUE_HANDOVER'],
    ['LEFT', '2026-09-30', '2026-10-02', 'LEAVING'],
  ] as const)('%s with the last day %s on %s is %s', (state, lastWorkingDay, today, expected) => {
    expect(departureLevel({ state, lastWorkingDay }, today)).toBe(expected);
  });
});

describe('the four states of the Super Admin role (US-03-04 AC-13)', () => {
  const day = '2026-10-02';

  it('is healthy when the holder works and can act', () => {
    expect(assessSuperAdmin(holder(), null, day)).toMatchObject({
      status: 'HEALTHY',
      warnings: { HOLDER_LEAVING: false, HANDOVER_OVERDUE: false },
    });
  });

  it('is healthy for a holder on long leave: only the state of the person who is leaving or gone counts', () => {
    expect(assessSuperAdmin(holder({ workState: 'ON_LONG_LEAVE' }), null, day).status).toBe('HEALTHY');
  });

  it('says nobody holds the role', () => {
    const assessed = assessSuperAdmin(null, null, day);

    expect(assessed.status).toBe('NO_HOLDER');
    expect(Object.values(assessed.reasons).some(Boolean)).toBe(false);
  });

  it('keeps a holder who is handing over among those who can act, even after the last working day', () => {
    const handing = holder({ workState: 'HANDING_OVER' });

    expect(assessSuperAdmin(handing, { lastWorkingDay: '2026-10-05' }, day)).toMatchObject({
      status: 'HOLDER_LEAVING_STILL_USABLE',
      warnings: { HOLDER_LEAVING: true, HANDOVER_OVERDUE: false },
    });
    expect(assessSuperAdmin(handing, { lastWorkingDay: '2026-09-30' }, day)).toMatchObject({
      status: 'HOLDER_LEAVING_STILL_USABLE',
      warnings: { HOLDER_LEAVING: true, HANDOVER_OVERDUE: true },
    });
    expect(assessSuperAdmin(handing, { lastWorkingDay: day }, day).warnings.HANDOVER_OVERDUE).toBe(false);
  });

  it.each([
    [{ locked: true }, 'LOCKED'],
    [{ workState: 'LEFT' as const }, 'LEFT'],
    [{ employeeTerminated: true }, 'LEFT'],
    [{ activated: false }, 'NOT_ACTIVATED'],
    [{ awaitingCredentialReset: true }, 'AWAITING_CREDENTIAL_RESET'],
  ] as [Partial<HolderFacts>, string][])('cannot act when %j', (extra, reason) => {
    const assessed = assessSuperAdmin(holder(extra), null, day);

    expect(assessed.status).toBe('HOLDER_UNUSABLE');
    expect(assessed.reasons[reason as keyof typeof assessed.reasons]).toBe(true);
    expect(assessed.warnings).toEqual({ HOLDER_LEAVING: false, HANDOVER_OVERDUE: false });
  });

  it('gives every reason that holds, and puts a holder who is handing over and locked among those who cannot act', () => {
    const assessed = assessSuperAdmin(holder({ workState: 'HANDING_OVER', locked: true, activated: false }), null, day);

    expect(assessed.status).toBe('HOLDER_UNUSABLE');
    expect(assessed.reasons).toEqual({
      LOCKED: true,
      LEFT: false,
      NOT_ACTIVATED: true,
      AWAITING_CREDENTIAL_RESET: false,
    });
  });
});
