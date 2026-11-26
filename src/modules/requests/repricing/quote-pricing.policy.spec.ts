import type { BusinessDate } from '../../../core/business-date';
import type { Quote } from '../access-request/assessment-record.types';
import { priceFromQuote, pricingRecordOfQuote, type QuotePricingInput } from './quote-pricing.policy';

const day = (value: string): BusinessDate => value;
const dong = (units: number) => ({ amountMinor: BigInt(units) * 100n, currency: 'VND' });

const quote = (over: Partial<Quote> = {}): Quote => ({
  unitPrice: dong(8),
  originalPrice: null,
  billingCycle: 'MONTHLY',
  validFrom: day('2026-10-01'),
  validUntil: day('2026-12-31'),
  ...over,
});
const input = (over: Partial<QuotePricingInput> = {}): QuotePricingInput => ({
  quote: quote(),
  beneficiaries: 1,
  checkDate: day('2026-10-23'),
  endDate: null,
  ...over,
});
const priced = (over: Partial<QuotePricingInput> = {}) => {
  const result = priceFromQuote(input(over));
  if (result.status !== 'PRICED') throw new Error(`refused: ${result.reason}`);

  return result;
};

describe('the amount of a request from a quote (US-05-06 AC-14, BR-MF1-06)', () => {
  it('BR-MF1-06a: is the price of the months left of the year, the month of the check counted whole (23/10 ⟹ 3 months)', () => {
    const result = priced();

    expect(result.amount).toEqual(dong(24));
    expect(result.months).toBe(3);
    expect(result.budgetYear).toBe(2026);
  });

  it('BR-MF1-06c, R-39: counts the months that have begun by the end date the request asked for (23/10 and 23/11 begin by 25/11, not by 05/11)', () => {
    expect(priced({ endDate: day('2026-11-25') }).amount).toEqual(dong(16));
    expect(priced({ endDate: day('2026-11-05') }).amount).toEqual(dong(8));
  });

  it('is multiplied by the people it is for', () => {
    expect(priced({ beneficiaries: 3 }).amount).toEqual(dong(72));
  });

  it('BR-MF1-06d: a quarterly or annual price is a third or a twelfth a month, rounded up once', () => {
    expect(priced({ quote: quote({ billingCycle: 'QUARTERLY', unitPrice: dong(30) }) }).amount).toEqual(dong(30));
    expect(priced({ quote: quote({ billingCycle: 'ANNUAL', unitPrice: dong(120) }) }).amount).toEqual(dong(30));
  });

  it('B-5: populates monthlyPriceMinor on quote pricing and PricingRecord for persistence at submit time', () => {
    const res = priced({
      quote: quote({ billingCycle: 'ANNUAL', unitPrice: { amountMinor: 10_000_000n, currency: 'VND' } }),
    });
    const record = pricingRecordOfQuote(res, null);

    expect(record.monthlyPriceMinor).toBe(833_334n);
  });

  describe('what is refused', () => {
    it.each([
      ['not yet in force', quote({ validFrom: day('2026-11-01'), validUntil: null })],
      ['expired', quote({ validUntil: day('2026-10-22') })],
    ])('a quote that is %s', (_name, given) => {
      expect(priceFromQuote(input({ quote: given }))).toEqual({ status: 'REFUSED', reason: 'QUOTE_NOT_IN_FORCE' });
    });

    it('BR-MF1-06g(iv) (review G23-01): an expired quote still prices a check made again, which then blocks it with PRICE_EXPIRED', () => {
      const result = priceFromQuote(
        input({ quote: quote({ validUntil: day('2026-10-22') }), expiredStillPrices: true }),
      );

      expect(result.status).toBe('PRICED');
    });

    it('a quote not yet in force is refused even for a check made again', () => {
      const result = priceFromQuote(
        input({ quote: quote({ validFrom: day('2026-11-01'), validUntil: null }), expiredStillPrices: true }),
      );

      expect(result).toEqual({ status: 'REFUSED', reason: 'QUOTE_NOT_IN_FORCE' });
    });

    it('is in force on its last day', () => {
      expect(priceFromQuote(input({ quote: quote({ validUntil: day('2026-10-23') }) })).status).toBe('PRICED');
    });

    it('a quote of nothing: the price data is incomplete (F34)', () => {
      expect(priceFromQuote(input({ quote: quote({ unitPrice: dong(0) }) }))).toEqual({
        status: 'REFUSED',
        reason: 'PRICE_REQUIRED',
        missing: ['quote.unitPrice'],
      });
    });

    it('QĐ-111an: a quote that is not in dong is refused, in force or not, and for a check made again: nothing here converts', () => {
      const foreign = quote({ unitPrice: { amountMinor: 800n, currency: 'USD' } });

      expect(priceFromQuote(input({ quote: foreign }))).toEqual({ status: 'REFUSED', reason: 'QUOTE_PRICE_NOT_VND' });
      expect(priceFromQuote(input({ quote: foreign, expiredStillPrices: true }))).toEqual({
        status: 'REFUSED',
        reason: 'QUOTE_PRICE_NOT_VND',
      });
    });

    it('a total that does not fit', () => {
      const result = priceFromQuote(
        input({ quote: quote({ unitPrice: { amountMinor: 10n ** 30n, currency: 'VND' } }) }),
      );

      expect(result).toEqual({ status: 'REFUSED', reason: 'AMOUNT_TOO_LARGE' });
    });
  });
});
