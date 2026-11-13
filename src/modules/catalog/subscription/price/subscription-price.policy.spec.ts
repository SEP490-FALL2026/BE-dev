import { SubscriptionPriceNotVndError } from '../subscription.errors';
import { PRICE_CURRENCY, assertPriceInDong, isPricedInDong, uniformSnapshotOf } from './subscription-price.policy';

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
