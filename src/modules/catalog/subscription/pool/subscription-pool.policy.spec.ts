import {
  SubscriptionBillingCycleUnsupportedError,
  SubscriptionBillingLongerThanCommitmentError,
  SubscriptionCommitmentTermNotAllowedError,
  SubscriptionCommitmentTermRequiredError,
  SubscriptionK1MonthlyOnlyError,
  SubscriptionResponsibleRequiredError,
} from '../subscription.errors';
import {
  assertDeclarableCycle,
  assertPoolTerms,
  assertResponsibleNamed,
  poolWarnings,
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
