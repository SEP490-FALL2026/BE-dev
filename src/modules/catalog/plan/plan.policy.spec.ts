import {
  PlanControlLevelRequiredError,
  PlanPricingModelNotDerivedError,
  PlanReferencePriceNotApplicableError,
  PlanReferencePriceNotVndError,
  PlanDataLossNoteRequiredError,
  PlanNameInvalidError,
  PlanNoteInvalidError,
  PlanPricingModelNotApplicableError,
  PlanPricingModelRequiredError,
  PlanPrimaryOwnerNotListedError,
  PlanProvisioningTypeMismatchError,
  PlanProvisioningTypeNotSupportedError,
  PlanReferenceCommitmentNotApplicableError,
  PlanWorkspaceLimitExceededError,
  PlanWorkspaceMemberDuplicateError,
  PlanWorkspaceTextInvalidError,
} from './plan.errors';
import {
  applicationPlanName,
  assertPlanShape,
  assertPricingModelDerived,
  assertReferenceCommitmentMonths,
  assertReferencePrice,
  assertWorkspaceShape,
  canAdoptQuotePrice,
  referenceCommitmentOnKindChange,
  referencePriceOnKindChange,
  cleanPlanName,
  derivedPricingModel,
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

  it('needs a pricing model for K1 and K2, lets K4 have none (it is bought once, B-5) and forbids one for K5', () => {
    for (const type of ['K1', 'K2'] as const) {
      expect(() =>
        assertPlanShape({ ...saas, provisioningType: type, pricingModel: null, controlLevel: 'FULL' }),
      ).toThrow(PlanPricingModelRequiredError);
    }
    expect(() =>
      assertPlanShape({ ...saas, provisioningType: 'K4', pricingModel: null, controlLevel: 'FULL' }),
    ).not.toThrow();
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

describe('derivedPricingModel (B-5: the kind of provisioning says how a plan is priced)', () => {
  it('prices K1 and K2 per seat, and K4 (bought once) and K5 (no price) by no model at all', () => {
    expect(derivedPricingModel('K1')).toBe('PER_SEAT');
    expect(derivedPricingModel('K2')).toBe('PER_SEAT');
    expect(derivedPricingModel('K4')).toBeNull();
    expect(derivedPricingModel('K5')).toBeNull();
  });

  it('leaves K3, which cannot be declared yet, with none', () => {
    expect(derivedPricingModel('K3')).toBeNull();
  });
});

describe('assertPricingModelDerived (B-5: a pricing model that is sent is the one the kind implies)', () => {
  it('lets through what is not sent and the model the kind implies', () => {
    expect(() => assertPricingModelDerived('K1', undefined)).not.toThrow();
    expect(() => assertPricingModelDerived('K2', 'PER_SEAT')).not.toThrow();
    expect(() => assertPricingModelDerived('K4', null)).not.toThrow();
    expect(() => assertPricingModelDerived('K5', null)).not.toThrow();
  });

  it('refuses any other, telling the model the kind implies', () => {
    expect(() => assertPricingModelDerived('K1', 'FLAT_RATE')).toThrow(PlanPricingModelNotDerivedError);
    expect(() => assertPricingModelDerived('K2', null)).toThrow(PlanPricingModelNotDerivedError);
    expect(() => assertPricingModelDerived('K4', 'PER_SEAT')).toThrow(PlanPricingModelNotDerivedError);
    expect(() => assertPricingModelDerived('K4', 'PER_HOST')).toThrow(PlanPricingModelNotDerivedError);
    expect(new PlanPricingModelNotDerivedError('PER_SEAT').expected).toBe('PER_SEAT');
  });
});

describe('applicationPlanName', () => {
  it('names a plan by its application and itself, with an en dash', () => {
    expect(applicationPlanName('Figma', 'Professional')).toBe('Figma – Professional');
  });
});

describe('QĐ-113a: the reference price of a plan', () => {
  const price = { amountMinor: 500_000n, currency: 'VND' };

  it.each(['K1', 'K2', 'K4'] as const)('is accepted on a %s plan, or left out', (kind) => {
    expect(() => assertReferencePrice(kind, price)).not.toThrow();
    expect(() => assertReferencePrice(kind, null)).not.toThrow();
    expect(() => assertReferencePrice(kind, { amountMinor: 0n, currency: 'VND' })).not.toThrow();
  });

  it.each(['K3', 'K5'] as const)('is refused on a %s plan', (kind) => {
    expect(() => assertReferencePrice(kind, price)).toThrow(PlanReferencePriceNotApplicableError);
    expect(() => assertReferencePrice(kind, null)).not.toThrow();
  });

  it('is refused in another currency than dong, with its own code', () => {
    expect(() => assertReferencePrice('K2', { amountMinor: 1n, currency: 'USD' })).toThrow(
      PlanReferencePriceNotVndError,
    );
  });

  it('is cleared when the kind moves to K5 or between a per-seat kind and K4, kept otherwise', () => {
    expect(referencePriceOnKindChange('K2', 'K5')).toBe('CLEAR');
    expect(referencePriceOnKindChange('K2', 'K4')).toBe('CLEAR');
    expect(referencePriceOnKindChange('K4', 'K2')).toBe('CLEAR');
    expect(referencePriceOnKindChange('K1', 'K2')).toBe('KEEP');
    expect(referencePriceOnKindChange('K2', 'K1')).toBe('KEEP');
    expect(referencePriceOnKindChange('K2', 'K2')).toBe('KEEP');
    expect(referencePriceOnKindChange('K4', 'K4')).toBe('KEEP');
  });

  it('takes a price from a quote only for a K1 or K2 plan that has none', () => {
    expect(canAdoptQuotePrice('K1', null)).toBe(true);
    expect(canAdoptQuotePrice('K2', null)).toBe(true);
    expect(canAdoptQuotePrice('K4', null)).toBe(false);
    expect(canAdoptQuotePrice('K5', null)).toBe(false);
    expect(canAdoptQuotePrice('K2', price)).toBe(false);
  });
});

describe('W3-02: referenceCommitmentMonths of a plan', () => {
  it.each(['K1', 'K2'] as const)('accepts 1, 12 or null on a %s plan', (kind) => {
    expect(() => assertReferenceCommitmentMonths(kind, 1)).not.toThrow();
    expect(() => assertReferenceCommitmentMonths(kind, 12)).not.toThrow();
    expect(() => assertReferenceCommitmentMonths(kind, null)).not.toThrow();
  });

  it.each(['K3', 'K4', 'K5'] as const)('refuses non-null on a %s plan', (kind) => {
    expect(() => assertReferenceCommitmentMonths(kind, 12)).toThrow(PlanReferenceCommitmentNotApplicableError);
    expect(() => assertReferenceCommitmentMonths(kind, null)).not.toThrow();
  });

  it('clears referenceCommitmentMonths when leaving K1/K2 and keeps it between K1 and K2', () => {
    expect(referenceCommitmentOnKindChange('K2', 'K4')).toBe('CLEAR');
    expect(referenceCommitmentOnKindChange('K1', 'K5')).toBe('CLEAR');
    expect(referenceCommitmentOnKindChange('K1', 'K2')).toBe('KEEP');
    expect(referenceCommitmentOnKindChange('K2', 'K1')).toBe('KEEP');
    expect(referenceCommitmentOnKindChange('K2', 'K2')).toBe('KEEP');
  });
});
