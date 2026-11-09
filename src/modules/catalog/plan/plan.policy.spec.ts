import {
  PlanControlLevelRequiredError,
  PlanDataLossNoteRequiredError,
  PlanNameInvalidError,
  PlanNoteInvalidError,
  PlanPricingModelNotApplicableError,
  PlanPricingModelRequiredError,
  PlanPrimaryOwnerNotListedError,
  PlanProvisioningTypeMismatchError,
  PlanProvisioningTypeNotSupportedError,
  PlanWorkspaceLimitExceededError,
  PlanWorkspaceMemberDuplicateError,
  PlanWorkspaceTextInvalidError,
} from './plan.errors';
import {
  assertPlanShape,
  assertWorkspaceShape,
  cleanPlanName,
  cleanRevocationNote,
  cleanWorkspaceText,
  kpi3Percent,
  seatTrackingOf,
} from './plan.policy';

const saas = { applicationKind: 'SAAS' as const, dataLossOnRemoval: false, revocationNote: null };

describe('assertPlanShape', () => {
  it.each([
    ['K1', 'PER_SEAT', 'PARTIAL'],
    ['K2', 'PER_SEAT', 'FULL'],
    ['K2', 'FLAT_RATE', 'FULL'],
    ['K4', 'PER_HOST', 'UNCONTROLLABLE'],
  ] as const)('accepts a %s plan priced %s at control level %s for a SaaS application', (type, pricing, control) => {
    expect(() =>
      assertPlanShape({ ...saas, provisioningType: type, pricingModel: pricing, controlLevel: control }),
    ).not.toThrow();
  });

  it('accepts a K4 plan for licensed software and a K5 plan without pricing for an internal application', () => {
    expect(() =>
      assertPlanShape({
        ...saas,
        applicationKind: 'LICENSED',
        provisioningType: 'K4',
        pricingModel: 'PER_SEAT',
        controlLevel: 'FULL',
      }),
    ).not.toThrow();
    expect(() =>
      assertPlanShape({
        ...saas,
        applicationKind: 'INTERNAL',
        provisioningType: 'K5',
        pricingModel: null,
        controlLevel: null,
      }),
    ).not.toThrow();
  });

  it('refuses K3, which is specified only (OQ-B-03), before anything else', () => {
    expect(() =>
      assertPlanShape({
        ...saas,
        applicationKind: 'INTERNAL',
        provisioningType: 'K3',
        pricingModel: null,
        controlLevel: null,
      }),
    ).toThrow(PlanProvisioningTypeNotSupportedError);
  });

  it.each([
    ['INTERNAL', 'K1', 'PER_SEAT', 'FULL'],
    ['INTERNAL', 'K2', 'PER_SEAT', 'FULL'],
    ['INTERNAL', 'K4', 'PER_SEAT', 'FULL'],
    ['SAAS', 'K5', null, null],
    ['LICENSED', 'K5', null, null],
  ] as const)(
    'refuses the wrong pairing of a %s application with a %s plan',
    (applicationKind, type, pricing, control) => {
      expect(() =>
        assertPlanShape({
          ...saas,
          applicationKind,
          provisioningType: type,
          pricingModel: pricing,
          controlLevel: control,
        }),
      ).toThrow(PlanProvisioningTypeMismatchError);
    },
  );

  it('needs a pricing model for K1, K2 and K4 and forbids one for K5', () => {
    for (const type of ['K1', 'K2', 'K4'] as const) {
      expect(() =>
        assertPlanShape({ ...saas, provisioningType: type, pricingModel: null, controlLevel: 'FULL' }),
      ).toThrow(PlanPricingModelRequiredError);
    }
    expect(() =>
      assertPlanShape({
        ...saas,
        applicationKind: 'INTERNAL',
        provisioningType: 'K5',
        pricingModel: 'PER_SEAT',
        controlLevel: null,
      }),
    ).toThrow(PlanPricingModelNotApplicableError);
  });

  it('needs a control level for K1, K2 and K4 but not for K5', () => {
    expect(() =>
      assertPlanShape({ ...saas, provisioningType: 'K1', pricingModel: 'PER_SEAT', controlLevel: null }),
    ).toThrow(PlanControlLevelRequiredError);
    expect(() =>
      assertPlanShape({
        ...saas,
        applicationKind: 'INTERNAL',
        provisioningType: 'K5',
        pricingModel: null,
        controlLevel: 'FULL',
      }),
    ).not.toThrow();
  });

  it('lets the data-loss flag stand only with a note', () => {
    const base = {
      ...saas,
      provisioningType: 'K2' as const,
      pricingModel: 'PER_SEAT' as const,
      controlLevel: 'FULL' as const,
    };

    expect(() => assertPlanShape({ ...base, dataLossOnRemoval: true, revocationNote: null })).toThrow(
      PlanDataLossNoteRequiredError,
    );
    expect(() => assertPlanShape({ ...base, dataLossOnRemoval: true, revocationNote: 'Chats are lost' })).not.toThrow();
    expect(() =>
      assertPlanShape({ ...base, dataLossOnRemoval: false, revocationNote: 'Chats are lost' }),
    ).not.toThrow();
  });
});

describe('seatTrackingOf (BR-06.4: not applicable, never zero)', () => {
  it('counts seats only for a per-seat plan', () => {
    expect(seatTrackingOf('PER_SEAT')).toBe('APPLICABLE');
    for (const model of ['FLAT_RATE', 'CONCURRENT', 'CONSUMPTION', 'PER_HOST', null] as const) {
      expect(seatTrackingOf(model)).toBe('NOT_APPLICABLE');
    }
  });
});

describe('cleanPlanName and cleanRevocationNote', () => {
  it('trims and collapses blanks, and refuses an empty or over-long name', () => {
    expect(cleanPlanName('  Figma   Organization ')).toBe('Figma Organization');
    expect(() => cleanPlanName('   ')).toThrow(PlanNameInvalidError);
    expect(() => cleanPlanName('N'.repeat(201))).toThrow(PlanNameInvalidError);
  });

  it('is null for nothing or blanks, trimmed otherwise, and refuses more than 2000 characters', () => {
    expect(cleanRevocationNote(undefined)).toBeNull();
    expect(cleanRevocationNote('  ')).toBeNull();
    expect(cleanRevocationNote('  chats   are lost ')).toBe('chats are lost');
    expect(cleanRevocationNote('n'.repeat(2000))).toHaveLength(2000);
    expect(() => cleanRevocationNote('n'.repeat(2001))).toThrow(PlanNoteInvalidError);
  });
});

describe('assertWorkspaceShape', () => {
  const A1 = 'a1';
  const A2 = 'a2';

  it('accepts an owner and an admin with the primary owner among the owners', () => {
    expect(() =>
      assertWorkspaceShape({
        primaryOwnerEmployeeId: A1,
        members: [
          { employeeId: A1, role: 'OWNER' },
          { employeeId: A2, role: 'ADMIN' },
        ],
        ownerLimit: 1,
        adminLimit: null,
      }),
    ).not.toThrow();
  });

  it('refuses a primary owner who is not listed, or listed only as an admin', () => {
    expect(() =>
      assertWorkspaceShape({
        primaryOwnerEmployeeId: A1,
        members: [{ employeeId: A2, role: 'OWNER' }],
        ownerLimit: null,
        adminLimit: null,
      }),
    ).toThrow(PlanPrimaryOwnerNotListedError);
    expect(() =>
      assertWorkspaceShape({
        primaryOwnerEmployeeId: A1,
        members: [{ employeeId: A1, role: 'ADMIN' }],
        ownerLimit: null,
        adminLimit: null,
      }),
    ).toThrow(PlanPrimaryOwnerNotListedError);
  });

  it('refuses a person listed twice, even with two roles', () => {
    expect(() =>
      assertWorkspaceShape({
        primaryOwnerEmployeeId: A1,
        members: [
          { employeeId: A1, role: 'OWNER' },
          { employeeId: A1, role: 'ADMIN' },
        ],
        ownerLimit: null,
        adminLimit: null,
      }),
    ).toThrow(PlanWorkspaceMemberDuplicateError);
  });

  it('refuses more owners or more admins than the limit the vendor sets', () => {
    expect(() =>
      assertWorkspaceShape({
        primaryOwnerEmployeeId: A1,
        members: [
          { employeeId: A1, role: 'OWNER' },
          { employeeId: A2, role: 'OWNER' },
        ],
        ownerLimit: 1,
        adminLimit: null,
      }),
    ).toThrow(PlanWorkspaceLimitExceededError);
    expect(() =>
      assertWorkspaceShape({
        primaryOwnerEmployeeId: A1,
        members: [
          { employeeId: A1, role: 'OWNER' },
          { employeeId: A2, role: 'ADMIN' },
          { employeeId: 'a3', role: 'ADMIN' },
        ],
        ownerLimit: null,
        adminLimit: 1,
      }),
    ).toThrow(PlanWorkspaceLimitExceededError);
  });
});

describe('cleanWorkspaceText', () => {
  it('is null for nothing or blanks, trims, and refuses more than 2000 characters', () => {
    expect(cleanWorkspaceText(undefined)).toBeNull();
    expect(cleanWorkspaceText('   ')).toBeNull();
    expect(cleanWorkspaceText('  hand over   in the console ')).toBe('hand over in the console');
    expect(() => cleanWorkspaceText('n'.repeat(2001))).toThrow(PlanWorkspaceTextInvalidError);
  });
});

describe('kpi3Percent (AF-08, QĐ-109d): the seats used over the seats bought', () => {
  it('gives the percent to one decimal', () => {
    expect(kpi3Percent(4, 10)).toBe(40);
    expect(kpi3Percent(2, 3)).toBe(66.7);
  });

  it('gives none when nothing was bought', () => {
    expect(kpi3Percent(3, 0)).toBeNull();
  });
});
