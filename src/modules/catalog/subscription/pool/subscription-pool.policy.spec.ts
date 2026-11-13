import {
  SubscriptionBillingCycleUnsupportedError,
  SubscriptionBillingLongerThanCommitmentError,
  SubscriptionCommitmentTermNotAllowedError,
  SubscriptionCommitmentTermRequiredError,
  SubscriptionK1MonthlyOnlyError,
  SubscriptionResponsibleRequiredError,
  SubscriptionVendorAdminsRequiredError,
} from '../subscription.errors';
import {
  assertDeclarableCycle,
  assertPoolTerms,
  assertResponsibleNamed,
  assertVendorAdminsRecorded,
  defaultResponsibleOf,
  isLiveSubscription,
  isPooledPlan,
  liveIdsByPlan,
  liveSiblingsOf,
  orderBySourcePreference,
  pickPriceSource,
  poolWarnings,
  vendorAdminFlags,
  type LivenessFacts,
  type PriceSource,
} from './subscription-pool.policy';

describe('the rules of the shared pool on a write (QĐ-103e, QĐ-104d(3), R-E01, R-G01)', () => {
  const term = {
    kind: 'TERM' as const,
    planProvisioningType: 'K2' as const,
    billingCycle: 'ANNUAL' as const,
    commitmentTermMonths: 12,
    activating: false,
  };

  it('R-G01: refuses a term that becomes active with no commitment, and accepts one with a month or a year', () => {
    expect(() => assertPoolTerms({ ...term, commitmentTermMonths: null, activating: true })).toThrow(
      SubscriptionCommitmentTermRequiredError,
    );
    expect(() => assertPoolTerms({ ...term, commitmentTermMonths: null })).not.toThrow();
    expect(() => assertPoolTerms({ ...term, activating: true })).not.toThrow();
    expect(() =>
      assertPoolTerms({ ...term, billingCycle: 'MONTHLY', commitmentTermMonths: 1, activating: true }),
    ).not.toThrow();
  });

  it('R-G01: a commitment of one month is not paid by the year, and a commitment of a year may be paid by the month', () => {
    expect(() => assertPoolTerms({ ...term, commitmentTermMonths: 1 })).toThrow(
      SubscriptionBillingLongerThanCommitmentError,
    );
    expect(() => assertPoolTerms({ ...term, billingCycle: 'MONTHLY', commitmentTermMonths: 12 })).not.toThrow();
  });

  it('R-G01: a perpetual purchase commits to no term', () => {
    expect(() => assertPoolTerms({ ...term, kind: 'PERPETUAL', billingCycle: null, commitmentTermMonths: 12 })).toThrow(
      SubscriptionCommitmentTermNotAllowedError,
    );
    expect(() =>
      assertPoolTerms({ ...term, kind: 'PERPETUAL', billingCycle: null, commitmentTermMonths: null, activating: true }),
    ).not.toThrow();
  });

  it('R-E01: a K1 plan is for one month and paid by the month', () => {
    const k1 = { ...term, planProvisioningType: 'K1' as const };

    expect(() => assertPoolTerms({ ...k1, billingCycle: 'MONTHLY', commitmentTermMonths: 12 })).toThrow(
      SubscriptionK1MonthlyOnlyError,
    );
    expect(() => assertPoolTerms({ ...k1, billingCycle: 'ANNUAL', commitmentTermMonths: null })).toThrow(
      SubscriptionK1MonthlyOnlyError,
    );
    expect(() =>
      assertPoolTerms({ ...k1, billingCycle: 'MONTHLY', commitmentTermMonths: 1, activating: true }),
    ).not.toThrow();
  });

  it('Q-09: a new write names only a monthly or an annual cycle, and the data written earlier keeps its own', () => {
    expect(() => assertDeclarableCycle(undefined)).not.toThrow();
    expect(() => assertDeclarableCycle('MONTHLY')).not.toThrow();
    expect(() => assertDeclarableCycle('ANNUAL')).not.toThrow();
    expect(() => assertDeclarableCycle('QUARTERLY')).toThrow(SubscriptionBillingCycleUnsupportedError);
    expect(() => assertDeclarableCycle('OTHER')).toThrow(SubscriptionBillingCycleUnsupportedError);
  });

  it('R-E03: an active subscription names the IT Admin who answers for it; a draft need not', () => {
    expect(() => assertResponsibleNamed(null, true)).toThrow(SubscriptionResponsibleRequiredError);
    expect(() => assertResponsibleNamed(null, false)).not.toThrow();
    expect(() => assertResponsibleNamed('it-1', true)).not.toThrow();
  });

  it('warns of an active subscription nobody answers for and of a cycle that is no longer taken', () => {
    expect(poolWarnings({ status: 'ACTIVE', billingCycle: 'MONTHLY', responsibleItAdminEmployeeId: null })).toEqual([
      'RESPONSIBLE_MISSING',
    ]);
    expect(poolWarnings({ status: 'DRAFT', billingCycle: null, responsibleItAdminEmployeeId: null })).toEqual([]);
    expect(poolWarnings({ status: 'ACTIVE', billingCycle: 'QUARTERLY', responsibleItAdminEmployeeId: 'it-1' })).toEqual(
      ['BILLING_CYCLE_LEGACY'],
    );
    expect(poolWarnings({ status: 'ACTIVE', billingCycle: 'OTHER', responsibleItAdminEmployeeId: null })).toEqual([
      'RESPONSIBLE_MISSING',
      'BILLING_CYCLE_LEGACY',
    ]);
  });
});

describe('BR-MF1-07: the subscription that gives a plan its price (Q-04 C)', () => {
  const source = (over: Partial<PriceSource> & { id: string }): PriceSource => ({
    isPrimaryForPlan: false,
    unitPriceMinor: 1000n,
    billingCycle: 'MONTHLY',
    startDate: '2026-01-01',
    ...over,
  });

  it('is the one flagged primary, whatever the others cost', () => {
    const chosen = pickPriceSource([
      source({ id: 'a', unitPriceMinor: 9000n }),
      source({ id: 'b', isPrimaryForPlan: true, unitPriceMinor: 100n }),
    ]);

    expect(chosen?.id).toBe('b');
  });

  it('with no flag is the one with the highest price a month: an annual price is compared by a twelfth', () => {
    expect(
      pickPriceSource([
        source({ id: 'monthly', unitPriceMinor: 1000n }),
        source({ id: 'annual', billingCycle: 'ANNUAL', unitPriceMinor: 15_000n }),
        source({ id: 'quarterly', billingCycle: 'QUARTERLY', unitPriceMinor: 2000n }),
      ])?.id,
    ).toBe('annual');
  });

  it('on a tie takes the older start date, a missing one last, then the smaller id', () => {
    expect(
      pickPriceSource([
        source({ id: 'new', startDate: '2026-06-01' }),
        source({ id: 'old', startDate: '2026-02-01' }),
        source({ id: 'none', startDate: null }),
      ])?.id,
    ).toBe('old');
    expect(pickPriceSource([source({ id: 'b' }), source({ id: 'a' })])?.id).toBe('a');
  });

  it('G9-07 compares the price converted to the reporting currency, not the raw prices of two currencies', () => {
    expect(
      pickPriceSource([
        source({ id: 'usd', unitPriceMinor: 2_000n, reportingPriceMinor: 500_000n }),
        source({ id: 'vnd', unitPriceMinor: 300_000n, reportingPriceMinor: 300_000n }),
      ])?.id,
    ).toBe('usd');
    expect(
      pickPriceSource([
        source({ id: 'not-converted', unitPriceMinor: 10n ** 9n, reportingPriceMinor: null }),
        source({ id: 'converted', unitPriceMinor: 100n, reportingPriceMinor: 100n }),
      ])?.id,
    ).toBe('converted');
  });

  it('puts a cycle that is not in months after the ones that are, and is null for no subscription', () => {
    expect(
      pickPriceSource([source({ id: 'other', billingCycle: 'OTHER', unitPriceMinor: 10n ** 9n }), source({ id: 'm' })])
        ?.id,
    ).toBe('m');
    expect(pickPriceSource([])).toBeNull();
  });
});

describe('the subscription that still holds the pool of its plan (R-E02, QĐ-104k(3))', () => {
  const row = (extra: Partial<LivenessFacts> = {}): LivenessFacts => ({
    id: 's1',
    planId: 'p1',
    status: 'ACTIVE',
    kind: 'TERM',
    endDate: null,
    renewed: false,
    ...extra,
  });
  const TODAY = '2026-11-09';

  it('is live as a draft, active with no end, active ending today or later, and perpetual whatever its end', () => {
    expect(isLiveSubscription(row({ status: 'DRAFT', endDate: '2020-01-01' }), TODAY)).toBe(true);
    expect(isLiveSubscription(row(), TODAY)).toBe(true);
    expect(isLiveSubscription(row({ endDate: TODAY }), TODAY)).toBe(true);
    expect(isLiveSubscription(row({ kind: 'PERPETUAL', endDate: '2020-01-01' }), TODAY)).toBe(true);
  });

  it('is not live once its period ended, or when a later period continues it', () => {
    expect(isLiveSubscription(row({ endDate: '2026-11-08' }), TODAY)).toBe(false);
    expect(isLiveSubscription(row({ renewed: true }), TODAY)).toBe(false);
  });

  it('lists the live ones by plan and leaves out the subscription being written, a renewal included', () => {
    const live = liveIdsByPlan(
      [
        row({ id: 'a' }),
        row({ id: 'b', status: 'DRAFT' }),
        row({ id: 'c', endDate: '2025-01-01' }),
        row({ id: 'd', planId: 'p2' }),
      ],
      TODAY,
    );

    expect(liveSiblingsOf(live, 'p1', null)).toEqual(['a', 'b']);
    expect(liveSiblingsOf(live, 'p1', 'b')).toEqual(['a']);
    expect(liveSiblingsOf(live, 'p3', null)).toEqual([]);
  });

  it('knows that only the K2 and K4 plans have the pool', () => {
    expect(['K1', 'K2', 'K3', 'K4', 'K5'].filter((type) => isPooledPlan(type as 'K1'))).toEqual(['K2', 'K4']);
  });
});

describe('the order a grant that names no subscription takes them (P0-05)', () => {
  const src = (id: string, extra: Partial<PriceSource> = {}): PriceSource => ({
    id,
    isPrimaryForPlan: false,
    unitPriceMinor: 100n,
    billingCycle: 'MONTHLY',
    startDate: null,
    ...extra,
  });

  it('puts the primary first, then the dearest a month, and the subscription with no price last', () => {
    const ordered = orderBySourcePreference([
      src('cheap', { unitPriceMinor: 50n }),
      src('free-of-price', { unitPriceMinor: 0n, billingCycle: 'OTHER' }),
      src('primary', { isPrimaryForPlan: true, unitPriceMinor: 10n }),
      src('dear', { unitPriceMinor: 900n }),
    ]);

    expect(ordered.map((source) => source.id)).toEqual(['primary', 'dear', 'cheap', 'free-of-price']);
  });
});

describe('the IT Admin a new subscription answers to when the declaration names none (QĐ-111g, BB-3)', () => {
  const given = (over: Partial<Parameters<typeof defaultResponsibleOf>[0]> = {}) =>
    defaultResponsibleOf({
      named: undefined,
      applicationResponsible: 'it-app',
      applicationResponsibleIsUsable: true,
      ...over,
    });

  it('keeps the one the declaration names, whatever the application has', () => {
    expect(given({ named: 'it-body' })).toBe('it-body');
    expect(given({ named: 'it-body', applicationResponsible: null, applicationResponsibleIsUsable: false })).toBe(
      'it-body',
    );
  });

  it('takes the IT Admin responsible for the application when none is named and they are still a usable IT Admin', () => {
    expect(given()).toBe('it-app');
  });

  it('leaves it NULL when the application names nobody, or the one it names is no longer a usable IT Admin', () => {
    expect(given({ applicationResponsible: null, applicationResponsibleIsUsable: false })).toBeNull();
    expect(given({ applicationResponsible: 'it-gone', applicationResponsibleIsUsable: false })).toBeNull();
  });
});

describe('the vendor admins of a plan that needs them (QĐ-110k, QĐ-110u, R-53)', () => {
  describe('assertVendorAdminsRecorded: a plan that needs admins is not activated without two different ones recorded', () => {
    it.each([[0], [1]])('refuses a plan that needs them with %i recorded', (given) => {
      expect(() => assertVendorAdminsRecorded({ needs: true, given, planId: 'p-1' })).toThrow(
        SubscriptionVendorAdminsRequiredError,
      );
    });

    it('lets it through with two or more', () => {
      expect(() => assertVendorAdminsRecorded({ needs: true, given: 2, planId: 'p-1' })).not.toThrow();
      expect(() => assertVendorAdminsRecorded({ needs: true, given: 5, planId: 'p-1' })).not.toThrow();
    });

    it('never judges a plan that needs none (K1, K5, K4 with no admin console)', () => {
      expect(() => assertVendorAdminsRecorded({ needs: false, given: 0, planId: 'p-1' })).not.toThrow();
    });
  });

  describe('vendorAdminFlags: what the reader sees, never a refusal (a subscription older than the rule only carries the flags)', () => {
    const working = (n: number) =>
      Array.from({ length: n }, (_unused, index) => ({ employeeId: `e${index}`, working: true }));

    it('says below the minimum when fewer than two of the admins recorded still work', () => {
      expect(vendorAdminFlags({ needs: true, admins: working(2), ownerAccountEmail: 'it@acme.vn' })).toEqual({
        vendorAdminsBelowMinimum: false,
        ownerAccountEmailMissing: false,
      });
      expect(
        vendorAdminFlags({
          needs: true,
          admins: [...working(1), { employeeId: 'gone', working: false }],
          ownerAccountEmail: 'it@acme.vn',
        }),
      ).toMatchObject({ vendorAdminsBelowMinimum: true });
      expect(vendorAdminFlags({ needs: true, admins: [], ownerAccountEmail: null })).toEqual({
        vendorAdminsBelowMinimum: true,
        ownerAccountEmailMissing: true,
      });
    });

    it('says the email of the company account is missing only when the plan needs admins and none is recorded', () => {
      expect(vendorAdminFlags({ needs: true, admins: working(3), ownerAccountEmail: null })).toMatchObject({
        ownerAccountEmailMissing: true,
      });
    });

    it('is quiet for a plan that needs no admins, whatever it holds', () => {
      expect(vendorAdminFlags({ needs: false, admins: [], ownerAccountEmail: null })).toEqual({
        vendorAdminsBelowMinimum: false,
        ownerAccountEmailMissing: false,
      });
    });
  });
});
