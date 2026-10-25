import type { BusinessDate } from '../../../core/business-date';
import { priceFromQuote, type Quote, type QuotePricingInput } from './quote-pricing.policy';

const day = (value: string): BusinessDate => value;
const usd = (units: number) => ({ amountMinor: BigInt(units) * 100n, currency: 'USD' });

const quote = (over: Partial<Quote> = {}): Quote => ({
  unitPrice: usd(8),
  billingCycle: 'MONTHLY',
  validFrom: day('2026-10-01'),
  validUntil: day('2026-12-31'),
  commitmentMonths: null,
  paymentFrequency: null,
  firstPaymentOn: null,
  ...over,
});
const input = (over: Partial<QuotePricingInput> = {}): QuotePricingInput => ({
  quote: quote(),
  termMonths: 1,
  beneficiaries: 1,
  today: day('2026-10-23'),
  expectedSpendOn: day('2026-10-23'),
  fiscalYearStartMonth: 1,
  ...over,
});
const priced = (over: Partial<QuotePricingInput> = {}) => {
  const result = priceFromQuote(input(over));
  if (result.status !== 'PRICED') throw new Error(`refused: ${result.reason}`);

  return result;
};

describe('the amount of a request from a quote (US-05-06 AC-14, AC-15)', () => {
  describe('a term of one billing cycle', () => {
    it('is the price of one person, needs no schedule and is one payment on the day the money goes out', () => {
      const result = priced();

      expect(result.amount).toEqual(usd(8));
      expect(result.periods).toEqual([{ dueOn: '2026-10-23', amountMinor: 800n, budgetYear: 2026, binding: true }]);
    });

    it('is multiplied by the people it is for', () => {
      expect(priced({ beneficiaries: 3 }).amount).toEqual(usd(24));
    });
  });

  describe('a term of several billing cycles', () => {
    it('with a monthly payment and a commitment as long as the term is every month, all binding (AC-14)', () => {
      const result = priced({
        termMonths: 6,
        quote: quote({ paymentFrequency: 'MONTHLY', commitmentMonths: 6 }),
      });

      expect(result.amount).toEqual(usd(48));
      expect(result.periods).toHaveLength(6);
      expect(result.periods.every((period) => period.binding)).toBe(true);
    });

    it('with a contract of twelve months paid by the year, binds the first year and forecasts the second (AC-15)', () => {
      const result = priced({
        termMonths: 24,
        quote: quote({
          paymentFrequency: 'ANNUAL',
          commitmentMonths: 12,
          firstPaymentOn: day('2026-11-01'),
          validUntil: null,
        }),
      });

      expect(result.periods).toEqual([
        { dueOn: '2026-11-01', amountMinor: 9600n, budgetYear: 2026, binding: true },
        { dueOn: '2027-11-01', amountMinor: 9600n, budgetYear: 2027, binding: false },
      ]);
      expect(result.amount).toEqual(usd(96));
    });

    it('paid up front once is one payment for the whole term, binding, with no commitment to give', () => {
      const result = priced({
        termMonths: 24,
        quote: quote({ paymentFrequency: 'UPFRONT_ONCE', validUntil: null }),
      });

      expect(result.periods).toEqual([{ dueOn: '2026-10-23', amountMinor: 19200n, budgetYear: 2026, binding: true }]);
      expect(result.amount).toEqual(usd(192));
    });

    it('prices a last payment that covers less than a full frequency by the cycles it covers', () => {
      const result = priced({
        termMonths: 18,
        quote: quote({ paymentFrequency: 'ANNUAL', commitmentMonths: 24, validUntil: null }),
      });

      expect(result.periods.map((period) => period.amountMinor)).toEqual([9600n, 4800n]);
      expect(result.amount).toEqual(usd(144));
    });

    it('names the fiscal year of every payment and of the request by the day of the first payment', () => {
      const result = priced({
        termMonths: 24,
        fiscalYearStartMonth: 4,
        quote: quote({
          paymentFrequency: 'ANNUAL',
          commitmentMonths: 24,
          firstPaymentOn: day('2027-03-01'),
          validUntil: null,
        }),
      });

      expect(result.periods.map((period) => period.budgetYear)).toEqual([2026, 2027]);
      expect(result.budgetYear).toBe(2026);
    });
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

    it.each([
      ['no payment frequency and no commitment', quote(), ['quote.paymentFrequency', 'quote.commitmentMonths']],
      ['a frequency but no commitment', quote({ paymentFrequency: 'ANNUAL' }), ['quote.commitmentMonths']],
      ['a commitment but no frequency', quote({ commitmentMonths: 12 }), ['quote.paymentFrequency']],
    ])('a term of 24 months with %s: nobody guesses a single payment', (_name, given, missing) => {
      expect(priceFromQuote(input({ termMonths: 24, quote: given }))).toEqual({
        status: 'REFUSED',
        reason: 'SCHEDULE_REQUIRED',
        missing,
      });
    });

    it('a payment shorter than the billing cycle of the price', () => {
      const result = priceFromQuote(
        input({
          termMonths: 24,
          quote: quote({ billingCycle: 'ANNUAL', paymentFrequency: 'MONTHLY', commitmentMonths: 12 }),
        }),
      );

      expect(result).toEqual({ status: 'REFUSED', reason: 'PAYMENT_FREQUENCY_INVALID' });
    });

    it('a total that does not fit', () => {
      const result = priceFromQuote(
        input({ quote: quote({ unitPrice: { amountMinor: 10n ** 30n, currency: 'USD' } }) }),
      );

      expect(result).toEqual({ status: 'REFUSED', reason: 'AMOUNT_TOO_LARGE' });
    });
  });
});
