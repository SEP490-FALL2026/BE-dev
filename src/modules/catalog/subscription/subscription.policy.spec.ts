import {
  SubscriptionDatesInvalidError,
  SubscriptionPerpetualHasNoTermError,
  SubscriptionPerpetualNeedsLicensedApplicationError,
  SubscriptionPlanHasNoSubscriptionError,
} from './subscription.errors';
import {
  alertDates,
  assertSubscriptionShape,
  declaredStateOf,
  deriveNotice,
  missingData,
  nextStateOf,
  noticeWarnings,
  sameUnitPrice,
  subscriptionStatusOf,
} from './subscription.policy';

const none = { noticeDeadline: null, noticePeriodDays: null, renewalDate: null, endDate: null, autoRenew: false };

describe('deriveNotice (US-04-03: the table that picks the milestone)', () => {
  it('AC-1: a declared deadline is used, whatever else is known', () => {
    expect(
      deriveNotice({ kind: 'TERM', ...none, noticeDeadline: '2026-12-01', renewalDate: '2026-12-31', autoRenew: true }),
    ).toEqual({ source: 'DECLARED', deadline: '2026-12-01', baseDate: '2026-12-01' });
    expect(
      deriveNotice({
        kind: 'TERM',
        ...none,
        noticeDeadline: '2026-12-01',
        noticePeriodDays: 30,
        renewalDate: '2026-12-31',
      }),
    ).toMatchObject({ source: 'DECLARED', deadline: '2026-12-01' });
  });

  it('AC-2: no deadline but a notice period infers the deadline from the renewal date, marked unconfirmed', () => {
    expect(deriveNotice({ kind: 'TERM', ...none, noticePeriodDays: 30, renewalDate: '2026-12-31' })).toEqual({
      source: 'INFERRED_UNCONFIRMED',
      deadline: '2026-12-01',
      baseDate: '2026-12-01',
    });
  });

  it('infers from the end date when there is no renewal date', () => {
    expect(deriveNotice({ kind: 'TERM', ...none, noticePeriodDays: 15, endDate: '2026-12-31' })).toMatchObject({
      source: 'INFERRED_UNCONFIRMED',
      deadline: '2026-12-16',
    });
  });

  it('prefers the renewal date to the end date when both are known', () => {
    expect(
      deriveNotice({ kind: 'TERM', ...none, noticePeriodDays: 30, renewalDate: '2027-01-01', endDate: '2026-12-31' }),
    ).toMatchObject({ deadline: '2026-12-02' });
  });

  it('AC-3: auto renewal with no deadline and no notice period is not guessed', () => {
    expect(deriveNotice({ kind: 'TERM', ...none, autoRenew: true, endDate: '2026-12-31' })).toEqual({
      source: 'MISSING',
      deadline: null,
      baseDate: null,
    });
  });

  it('AC-7: no deadline, no notice period and no auto renewal take the end date as the base', () => {
    expect(deriveNotice({ kind: 'TERM', ...none, endDate: '2026-12-31' })).toEqual({
      source: 'BY_END_DATE',
      deadline: null,
      baseDate: '2026-12-31',
    });
  });

  it('AC-12: nothing at all is not guessed either', () => {
    expect(deriveNotice({ kind: 'TERM', ...none })).toEqual({ source: 'MISSING', deadline: null, baseDate: null });
  });

  it('a notice period with no date to count from cannot be inferred and counts as nothing known', () => {
    expect(deriveNotice({ kind: 'TERM', ...none, noticePeriodDays: 30 })).toMatchObject({ source: 'MISSING' });
    expect(deriveNotice({ kind: 'TERM', ...none, noticePeriodDays: 30, autoRenew: true })).toMatchObject({
      source: 'MISSING',
    });
  });

  it('AC-8: a perpetual purchase has no milestone and nothing to warn about', () => {
    expect(deriveNotice({ kind: 'PERPETUAL', ...none })).toEqual({
      source: 'NOT_APPLICABLE',
      deadline: null,
      baseDate: null,
    });
  });
});

describe('noticeWarnings', () => {
  it('warns about the data quality only when the source is missing', () => {
    expect(noticeWarnings('MISSING')).toEqual(['NO_ALERT_ANCHOR']);
    for (const source of ['DECLARED', 'INFERRED_UNCONFIRMED', 'BY_END_DATE', 'NOT_APPLICABLE'] as const) {
      expect(noticeWarnings(source)).toEqual([]);
    }
  });
});

describe('alertDates', () => {
  it('AC-1: counts back from the base date by each number of days of the parameter', () => {
    expect(alertDates('2026-12-01', [15, 7])).toEqual(['2026-11-16', '2026-11-24']);
  });

  it('AC-7: counts from the end date when that is the base', () => {
    expect(alertDates('2026-12-31', [15, 7])).toEqual(['2026-12-16', '2026-12-24']);
  });

  it('is empty without a base date', () => {
    expect(alertDates(null, [15, 7])).toEqual([]);
  });

  it('follows the parameter: one alert, or five', () => {
    expect(alertDates('2026-12-31', [30])).toEqual(['2026-12-01']);
    expect(alertDates('2026-12-31', [60, 30, 15, 7, 1])).toHaveLength(5);
  });
});

describe('missingData (what keeps a subscription a draft)', () => {
  const complete = {
    kind: 'TERM' as const,
    planPricingModel: 'PER_SEAT' as const,
    quantity: 100,
    startDate: '2026-01-01',
    billingCycle: 'ANNUAL',
    hasPrice: true,
    hasSnapshot: true,
  };

  it('is empty when everything a per-seat term subscription needs is there', () => {
    expect(missingData(complete)).toEqual([]);
  });

  it('AC-4: lists everything for a subscription of which only the use is known', () => {
    expect(
      missingData({
        kind: 'TERM',
        planPricingModel: 'PER_SEAT',
        quantity: null,
        startDate: null,
        billingCycle: null,
        hasPrice: false,
        hasSnapshot: false,
      }),
    ).toEqual(['QUANTITY', 'START_DATE', 'BILLING_CYCLE', 'UNIT_PRICE']);
  });

  it('US-04-05 AC-5: a price with no snapshot lacks the exchange rate, not the price', () => {
    expect(missingData({ ...complete, hasSnapshot: false })).toEqual(['EXCHANGE_RATE']);
  });

  it('a flat-rate plan does not need a quantity', () => {
    expect(missingData({ ...complete, planPricingModel: 'FLAT_RATE', quantity: null })).toEqual([]);
    expect(missingData({ ...complete, planPricingModel: 'CONCURRENT', quantity: null })).toEqual([]);
  });

  it('a perpetual purchase needs a quantity and a purchase date but no billing cycle', () => {
    const perpetual = { ...complete, kind: 'PERPETUAL' as const, billingCycle: null };

    expect(missingData(perpetual)).toEqual([]);
    expect(missingData({ ...perpetual, quantity: null, planPricingModel: 'FLAT_RATE' })).toEqual(['QUANTITY']);
    expect(missingData({ ...perpetual, startDate: null })).toEqual(['START_DATE']);
  });
});

describe('assertSubscriptionShape', () => {
  const term = {
    kind: 'TERM' as const,
    applicationKind: 'SAAS' as const,
    planProvisioningType: 'K2' as const,
    startDate: '2026-01-01' as string | null,
    endDate: '2026-12-31' as string | null,
    renewalDate: null as string | null,
    noticeDeadline: null as string | null,
    noticePeriodDays: null as number | null,
    billingCycle: 'ANNUAL' as string | null,
    autoRenew: false,
    allowsMidTermReduction: false,
  };
  const perpetual = {
    ...term,
    kind: 'PERPETUAL' as const,
    applicationKind: 'LICENSED' as const,
    endDate: null,
    billingCycle: null,
    startDate: '2026-03-15',
  };

  it('accepts a term subscription and a perpetual purchase of licensed software', () => {
    expect(() => assertSubscriptionShape(term)).not.toThrow();
    expect(() => assertSubscriptionShape(perpetual)).not.toThrow();
  });

  it('gives a K5 plan of an internal application no subscription', () => {
    expect(() => assertSubscriptionShape({ ...term, applicationKind: 'INTERNAL', planProvisioningType: 'K5' })).toThrow(
      SubscriptionPlanHasNoSubscriptionError,
    );
  });

  it('keeps a perpetual purchase to licensed software', () => {
    expect(() => assertSubscriptionShape({ ...perpetual, applicationKind: 'SAAS' })).toThrow(
      SubscriptionPerpetualNeedsLicensedApplicationError,
    );
  });

  it.each([
    ['endDate', { endDate: '2027-01-01' }],
    ['renewalDate', { renewalDate: '2027-01-01' }],
    ['noticeDeadline', { noticeDeadline: '2026-12-01' }],
    ['noticePeriodDays', { noticePeriodDays: 30 }],
    ['billingCycle', { billingCycle: 'ANNUAL' }],
    ['autoRenew', { autoRenew: true }],
    ['allowsMidTermReduction', { allowsMidTermReduction: true }],
  ])('AC-8: refuses %s on a perpetual purchase, naming it', (field, extra) => {
    try {
      assertSubscriptionShape({ ...perpetual, ...extra });
      throw new Error('was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(SubscriptionPerpetualHasNoTermError);
      expect((error as SubscriptionPerpetualHasNoTermError).fields).toEqual([field]);
    }
  });

  it('names every term field a perpetual purchase carries at once', () => {
    try {
      assertSubscriptionShape({ ...perpetual, endDate: '2027-01-01', autoRenew: true });
      throw new Error('was accepted');
    } catch (error) {
      expect((error as SubscriptionPerpetualHasNoTermError).fields).toEqual(['endDate', 'autoRenew']);
    }
  });

  it.each([
    ['START_AFTER_END', { startDate: '2027-01-01', endDate: '2026-12-31' }],
    ['RENEWAL_AFTER_END_PLUS_ONE', { endDate: '2026-12-31', renewalDate: '2027-01-02' }],
    ['NOTICE_AFTER_RENEWAL', { renewalDate: '2026-12-01', noticeDeadline: '2026-12-31' }],
  ])('refuses dates out of order: %s', (reason, extra) => {
    try {
      assertSubscriptionShape({ ...term, ...extra });
      throw new Error('was accepted');
    } catch (error) {
      expect(error).toBeInstanceOf(SubscriptionDatesInvalidError);
      expect((error as SubscriptionDatesInvalidError).reason).toBe(reason);
    }
  });

  it('accepts the day after the end for the renewal, and equal dates', () => {
    expect(() => assertSubscriptionShape({ ...term, renewalDate: '2027-01-01' })).not.toThrow();
    expect(() => assertSubscriptionShape({ ...term, startDate: '2026-12-31' })).not.toThrow();
    expect(() =>
      assertSubscriptionShape({ ...term, renewalDate: '2026-12-01', noticeDeadline: '2026-12-01' }),
    ).not.toThrow();
  });
});

describe('what an update of a subscription makes of its state, and when it is a draft (US-04-03)', () => {
  const current = {
    purchasedQuantity: 10 as number | null,
    billingCycle: 'ANNUAL' as string | null,
    startDate: '2026-01-01' as string | null,
    endDate: '2026-12-31' as string | null,
    renewalDate: '2026-12-31' as string | null,
    noticeDeadline: '2026-11-01' as string | null,
    noticePeriodDays: 60 as number | null,
    autoRenew: false,
    allowsMidTermReduction: true,
  };

  it('keeps what the update does not give', () => {
    expect(nextStateOf(current, {})).toEqual(current);
  });

  it('takes what the update gives, and clears the four dates and the notice period when it says null', () => {
    expect(
      nextStateOf(current, {
        purchasedQuantity: 12,
        billingCycle: 'MONTHLY',
        startDate: '2026-02-01',
        endDate: null,
        renewalDate: null,
        noticeDeadline: null,
        noticePeriodDays: null,
        autoRenew: true,
        allowsMidTermReduction: false,
      }),
    ).toEqual({
      purchasedQuantity: 12,
      billingCycle: 'MONTHLY',
      startDate: '2026-02-01',
      endDate: null,
      renewalDate: null,
      noticeDeadline: null,
      noticePeriodDays: null,
      autoRenew: true,
      allowsMidTermReduction: false,
    });
  });

  it('is the same price when no price is given, or the amount and the currency are those recorded', () => {
    expect(sameUnitPrice({ amountMinor: 100n, currency: 'USD' }, null)).toBe(true);
    expect(sameUnitPrice(null, null)).toBe(true);
    expect(sameUnitPrice({ amountMinor: 100n, currency: 'USD' }, { amountMinor: 100n, currency: 'USD' })).toBe(true);
    expect(sameUnitPrice({ amountMinor: 100n, currency: 'USD' }, { amountMinor: 120n, currency: 'USD' })).toBe(false);
    expect(sameUnitPrice({ amountMinor: 100n, currency: 'USD' }, { amountMinor: 100n, currency: 'VND' })).toBe(false);
    expect(sameUnitPrice(null, { amountMinor: 100n, currency: 'USD' })).toBe(false);
  });

  const whole = {
    purchasedQuantity: 5,
    startDate: '2026-01-01',
    billingCycle: 'ANNUAL',
    unitPrice: {},
    priceSnapshot: {},
  };

  it('is active when nothing keeps it a draft, and a draft when anything does', () => {
    expect(subscriptionStatusOf({ pricingModel: 'PER_SEAT' }, 'TERM', whole)).toBe('ACTIVE');
    expect(subscriptionStatusOf({ pricingModel: 'PER_SEAT' }, 'TERM', { ...whole, purchasedQuantity: null })).toBe(
      'DRAFT',
    );
    expect(subscriptionStatusOf({ pricingModel: 'FLAT_RATE' }, 'TERM', { ...whole, purchasedQuantity: null })).toBe(
      'ACTIVE',
    );
    expect(subscriptionStatusOf({ pricingModel: 'FLAT_RATE' }, 'TERM', { ...whole, priceSnapshot: null })).toBe(
      'DRAFT',
    );
  });
});

describe('what a declared subscription starts as (US-04-03)', () => {
  it('has nothing recorded and the two choices off when the declaration gives nothing', () => {
    expect(declaredStateOf({})).toEqual({
      purchasedQuantity: null,
      billingCycle: null,
      startDate: null,
      endDate: null,
      renewalDate: null,
      noticeDeadline: null,
      noticePeriodDays: null,
      autoRenew: false,
      allowsMidTermReduction: false,
    });
  });

  it('keeps what the declaration gives', () => {
    expect(
      declaredStateOf({
        purchasedQuantity: 5,
        billingCycle: 'ANNUAL',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        renewalDate: '2026-12-31',
        noticeDeadline: '2026-11-01',
        noticePeriodDays: 60,
        autoRenew: true,
        allowsMidTermReduction: true,
      }),
    ).toEqual({
      purchasedQuantity: 5,
      billingCycle: 'ANNUAL',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      renewalDate: '2026-12-31',
      noticeDeadline: '2026-11-01',
      noticePeriodDays: 60,
      autoRenew: true,
      allowsMidTermReduction: true,
    });
  });
});
