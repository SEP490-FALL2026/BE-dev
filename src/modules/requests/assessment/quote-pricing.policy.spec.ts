import type { BusinessDate } from '../../../core/business-date';
import type { Quote } from '../access-request/assessment-record.types';
import { priceFromQuote, type QuotePricingInput } from './quote-pricing.policy';

const day = (value: string): BusinessDate => value;
const usd = (units: number) => ({ amountMinor: BigInt(units) * 100n, currency: 'USD' });

const quote = (over: Partial<Quote> = {}): Quote => ({
  unitPrice: usd(8),
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

    expect(result.amount).toEqual(usd(24));
    expect(result.months).toBe(3);
    expect(result.budgetYear).toBe(2026);
  });

  it('BR-MF1-06c: stops in the month of the end date the request asked for', () => {
    expect(priced({ endDate: day('2026-11-05') }).amount).toEqual(usd(16));
  });

  it('is multiplied by the people it is for', () => {
    expect(priced({ beneficiaries: 3 }).amount).toEqual(usd(72));
  });

  it('BR-MF1-06d: a quarterly or annual price is a third or a twelfth a month, rounded up once', () => {
    expect(priced({ quote: quote({ billingCycle: 'QUARTERLY', unitPrice: usd(30) }) }).amount).toEqual(usd(30));
    expect(priced({ quote: quote({ billingCycle: 'ANNUAL', unitPrice: usd(120) }) }).amount).toEqual(usd(30));
  });

  describe('what is refused', () => {
    it.each([
      ['not yet in force', quote({ validFrom: day('2026-11-01'), validUntil: null })],
      ['expired', quote({ validUntil: day('2026-10-22') })],
    ])('a quote that is %s', (_name, given) => {
      expect(priceFromQuote(input({ quote: given }))).toEqual({ status: 'REFUSED', reason: 'QUOTE_NOT_IN_FORCE' });
    });

    it('is in force on its last day', () => {
      expect(priceFromQuote(input({ quote: quote({ validUntil: day('2026-10-23') }) })).status).toBe('PRICED');
    });

    it('a quote of nothing: the price data is incomplete (F34)', () => {
      expect(priceFromQuote(input({ quote: quote({ unitPrice: usd(0) }) }))).toEqual({
        status: 'REFUSED',
        reason: 'PRICE_REQUIRED',
        missing: ['quote.unitPrice'],
      });
    });

    it('a total that does not fit', () => {
      const result = priceFromQuote(
        input({ quote: quote({ unitPrice: { amountMinor: 10n ** 30n, currency: 'USD' } }) }),
      );

      expect(result).toEqual({ status: 'REFUSED', reason: 'AMOUNT_TOO_LARGE' });
    });
  });
});
