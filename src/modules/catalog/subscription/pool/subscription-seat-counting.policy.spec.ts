import { declaredStateOf, nextStateOf } from '../subscription.policy';
import {
  SubscriptionMembersMonthlyOnlyError,
  SubscriptionMembersPaymentDayRequiredError,
} from '../subscription.errors';
import { assertPoolTerms } from './subscription-pool.policy';

describe('W3-11 (QĐ-115g): a subscription counted by the members the vendor counts', () => {
  const members = (over: Partial<Parameters<typeof assertPoolTerms>[0]> = {}) => ({
    kind: 'TERM' as const,
    planProvisioningType: 'K2' as const,
    billingCycle: 'MONTHLY' as const,
    commitmentTermMonths: 1,
    activating: true,
    seatCounting: 'MEMBERS' as const,
    renewalDate: '2026-12-05',
    ...over,
  });

  it('commits for one month and, once active, names its payment day', () => {
    expect(() => assertPoolTerms(members())).not.toThrow();
    expect(() =>
      assertPoolTerms(members({ commitmentTermMonths: null, activating: false, renewalDate: null })),
    ).not.toThrow();
  });

  it('refuses a commitment of a year, with the code of the rule', () => {
    expect(() => assertPoolTerms(members({ commitmentTermMonths: 12, billingCycle: 'ANNUAL' }))).toThrow(
      SubscriptionMembersMonthlyOnlyError,
    );
  });

  it('refuses an active subscription with no payment day, and lets a draft have none', () => {
    expect(() => assertPoolTerms(members({ renewalDate: null }))).toThrow(SubscriptionMembersPaymentDayRequiredError);
    expect(() => assertPoolTerms(members({ renewalDate: undefined }))).toThrow(
      SubscriptionMembersPaymentDayRequiredError,
    );
    expect(() => assertPoolTerms(members({ renewalDate: null, activating: false }))).not.toThrow();
  });

  it('is judged by nothing for a fixed count, which needs no payment day', () => {
    expect(() => assertPoolTerms(members({ seatCounting: 'FIXED', renewalDate: null }))).not.toThrow();
    expect(() => assertPoolTerms(members({ seatCounting: undefined, renewalDate: null }))).not.toThrow();
  });

  it('is not judged for a perpetual purchase, which commits to no term at all', () => {
    expect(() =>
      assertPoolTerms(members({ kind: 'PERPETUAL', commitmentTermMonths: null, renewalDate: null })),
    ).not.toThrow();
  });
});

describe('the state a subscription starts with and the one an update leaves: how its seats are counted (W3-11)', () => {
  const current = {
    purchasedQuantity: 10 as number | null,
    billingCycle: 'MONTHLY' as string | null,
    startDate: '2026-11-01' as string | null,
    endDate: null as string | null,
    renewalDate: '2026-12-05' as string | null,
    noticeDeadline: null as string | null,
    noticePeriodDays: null as number | null,
    autoRenew: true,
    allowsMidTermReduction: false,
    commitmentTermMonths: 1 as number | null,
    responsibleItAdminEmployeeId: 'it-1' as string | null,
    vendorMinimumSeats: null as number | null,
    isPrimaryForPlan: false,
    seatCounting: 'FIXED' as 'FIXED' | 'MEMBERS' | undefined,
    minimumSeatsTotal: 25 as number | null | undefined,
    invoicedLater: false as boolean | undefined,
  };

  it('a declaration keeps what it gives, and leaves out what it does not (the columns default to a fixed count)', () => {
    expect(declaredStateOf({ seatCounting: 'MEMBERS', minimumSeatsTotal: 25, invoicedLater: true })).toMatchObject({
      seatCounting: 'MEMBERS',
      minimumSeatsTotal: 25,
      invoicedLater: true,
    });
    expect(declaredStateOf({}).seatCounting).toBeUndefined();
  });

  it('an update takes what it gives and keeps what it does not', () => {
    expect(nextStateOf(current, { seatCounting: 'MEMBERS', invoicedLater: true })).toMatchObject({
      seatCounting: 'MEMBERS',
      minimumSeatsTotal: 25,
      invoicedLater: true,
    });
    expect(nextStateOf(current, {})).toMatchObject({
      seatCounting: 'FIXED',
      minimumSeatsTotal: 25,
      invoicedLater: false,
    });
  });

  it('an update takes the least seats across the workspace away when it says null', () => {
    expect(nextStateOf(current, { minimumSeatsTotal: null }).minimumSeatsTotal).toBeNull();
  });
});
