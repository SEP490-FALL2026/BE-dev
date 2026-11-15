import { SubscriptionPriceNotVndError } from '../subscription.errors';
import { missingDataOf } from '../subscription.policy';
import {
  PRICE_CURRENCY,
  assertPriceInDong,
  isPricedInDong,
  monthlyCostOf,
  uniformSnapshotOf,
} from './subscription-price.policy';

describe('QĐ-111an: the price of a subscription is in dong, with a snapshot of the same currency', () => {
  describe('assertPriceInDong', () => {
    it('takes dong', () => {
      expect(PRICE_CURRENCY).toBe('VND');
      expect(() => assertPriceInDong('VND')).not.toThrow();
    });

    it.each(['USD', 'EUR', 'JPY', 'XYZ'])('refuses %s with the currency it was given', (currency) => {
      expect(() => assertPriceInDong(currency)).toThrow(SubscriptionPriceNotVndError);
      try {
        assertPriceInDong(currency);
      } catch (error) {
        expect((error as SubscriptionPriceNotVndError).currency).toBe(currency);
      }
    });
  });

  describe('uniformSnapshotOf', () => {
    const snapshot = uniformSnapshotOf({ amountMinor: 600_000n, currency: 'VND' }, '2026-11-14');

    it('is the rate 1 of the same currency, dated by the day the price is recorded, with no exchange rate row behind it', () => {
      expect(snapshot).toEqual({
        rate: 10_000_000_000n,
        rateDate: '2026-11-14',
        rateSource: 'SAME_CURRENCY',
        reportingMinor: 600_000n,
        reportingCurrency: 'VND',
        exchangeRateId: null,
      });
    });

    it('is whole: every field the CHECK `subscriptions_snapshot_whole` asks for goes together, and the reporting price is the price', () => {
      expect(snapshot.rate).toBeGreaterThan(0n);
      expect(snapshot.rateDate).not.toBeNull();
      expect(snapshot.rateSource).not.toBeNull();
      expect(snapshot.reportingMinor).toBe(600_000n);
      expect(snapshot.reportingCurrency).toBe(PRICE_CURRENCY);
    });

    it('keeps a price of nothing as nothing (a free plan is a price of 0, still whole)', () => {
      expect(uniformSnapshotOf({ amountMinor: 0n, currency: 'VND' }, '2026-11-14').reportingMinor).toBe(0n);
    });

    it('is only for dong: a price in another currency is a programming error, never converted here', () => {
      expect(() => uniformSnapshotOf({ amountMinor: 1_000n, currency: 'USD' }, '2026-11-14')).toThrow(
        SubscriptionPriceNotVndError,
      );
    });
  });

  describe('isPricedInDong', () => {
    it('is a price in dong with its snapshot', () => {
      expect(isPricedInDong({ unitPrice: { currency: 'VND' }, priceSnapshot: {} })).toBe(true);
    });

    it.each([
      ['no price', { unitPrice: null, priceSnapshot: null }],
      ['a price in dong with no snapshot', { unitPrice: { currency: 'VND' }, priceSnapshot: null }],
      ['a price an earlier release left in dollars', { unitPrice: { currency: 'USD' }, priceSnapshot: {} }],
      ['a price in dollars with no snapshot', { unitPrice: { currency: 'USD' }, priceSnapshot: null }],
    ])('is not %s', (_name, state) => {
      expect(isPricedInDong(state)).toBe(false);
    });
  });
});

describe('B1A-03: what a state lacks, so a change that would lower an active subscription can say why', () => {
  const whole = {
    purchasedQuantity: 5,
    startDate: '2026-01-01',
    billingCycle: 'ANNUAL',
    unitPrice: { currency: 'VND' },
    priceSnapshot: {},
  };

  it('lacks nothing with a price in dong, and the price when it was left in dollars', () => {
    expect(missingDataOf({ pricingModel: 'PER_SEAT' }, 'TERM', whole)).toEqual([]);
    expect(missingDataOf({ pricingModel: 'PER_SEAT' }, 'TERM', { ...whole, unitPrice: { currency: 'USD' } })).toEqual([
      'UNIT_PRICE',
    ]);
  });

  it('names every missing item, in the fixed order', () => {
    const lacking = { ...whole, purchasedQuantity: null, priceSnapshot: null };

    expect(missingDataOf({ pricingModel: 'PER_SEAT' }, 'TERM', lacking)).toEqual(['QUANTITY', 'UNIT_PRICE']);
  });
});

describe('monthlyCostOf (the price of a seat for a month, in dong, rounded up)', () => {
  const priced = (amountMinor: bigint, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER' | null) => ({
    billingCycle,
    priceSnapshot: null,
    unitPrice: { amountMinor, currency: 'VND', recordedOn: '2026-01-05' },
  });

  it('is the price of a monthly plan as it is, and a quarter or a year over its months, rounded up', () => {
    expect(monthlyCostOf(priced(200_000n, 'MONTHLY'))).toEqual({ monthlyPriceMinor: 200_000n, cycleMonths: 1 });
    expect(monthlyCostOf(priced(1_000_000n, 'QUARTERLY'))).toEqual({ monthlyPriceMinor: 333_334n, cycleMonths: 3 });
    expect(monthlyCostOf(priced(2_400_001n, 'ANNUAL'))).toEqual({ monthlyPriceMinor: 200_001n, cycleMonths: 12 });
  });

  it('reads the price in the reporting currency when the subscription carries one', () => {
    expect(
      monthlyCostOf({
        billingCycle: 'MONTHLY',
        unitPrice: { amountMinor: 10n, currency: 'USD', recordedOn: '2026-01-05' },
        priceSnapshot: {
          rate: 1n,
          rateDate: '2026-01-05',
          rateSource: 'MANUAL',
          reportingMinor: 250_000n,
          reportingCurrency: 'VND',
          exchangeRateId: null,
        },
      }),
    ).toEqual({ monthlyPriceMinor: 250_000n, cycleMonths: 1 });
  });

  it('knows no price for another cycle, none, or a price that is not in dong and was never converted', () => {
    expect(monthlyCostOf(priced(200_000n, 'OTHER'))).toEqual({ monthlyPriceMinor: null, cycleMonths: null });
    expect(monthlyCostOf(priced(200_000n, null))).toEqual({ monthlyPriceMinor: null, cycleMonths: null });
    expect(
      monthlyCostOf({
        billingCycle: 'MONTHLY',
        priceSnapshot: null,
        unitPrice: { amountMinor: 10n, currency: 'USD', recordedOn: '2026-01-05' },
      }),
    ).toEqual({ monthlyPriceMinor: null, cycleMonths: 1 });
  });
});
