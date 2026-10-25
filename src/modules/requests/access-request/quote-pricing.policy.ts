import type { BusinessDate } from '../../../core/business-date';
import { addMonths, fiscalYearOf } from '../../../core/fiscal-year';
import { MAX_AMOUNT_MINOR, type Money } from '../../../core/money/money';
import type { PaymentPeriod } from './pricing.policy';

/**
 * What a request for software that is not in the catalog costs, from the quote the IT Admin records (`US-05-06` AC-14,
 * AC-15, `QĐ-84e`), as a pure calculation. The quote gives the price of one person for one billing cycle and, when the
 * term spans more than one cycle, how long the contract binds and how it is paid. A request is _priced_ only when the quote
 * is in force and says all of that; otherwise nothing is guessed and the request stays with the IT Admin. A payment after
 * the commitment is a forecast that goes the way of a renewal, so the amount of the request is the payments that bind.
 */

export type QuoteCycle = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
export type QuotePaymentFrequency = 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'UPFRONT_ONCE';

const MONTHS: Readonly<Record<QuoteCycle, number>> = { MONTHLY: 1, QUARTERLY: 3, ANNUAL: 12 };

export interface Quote {
  /** The price before tax of one person for one billing cycle. */
  unitPrice: Money;
  billingCycle: QuoteCycle;
  validFrom: BusinessDate;
  validUntil: BusinessDate | null;
  /** How many months the contract binds the company; null when the whole term is paid up front. */
  commitmentMonths: number | null;
  paymentFrequency: QuotePaymentFrequency | null;
  /** The day of the first payment; the day the money is expected to go out when the quote does not say. */
  firstPaymentOn: BusinessDate | null;
}

export interface QuotePricingInput {
  quote: Quote;
  termMonths: number;
  beneficiaries: number;
  today: BusinessDate;
  /** The day the money is expected to go out, which stands in when the quote has no first payment day. */
  expectedSpendOn: BusinessDate;
  fiscalYearStartMonth: number;
}

export type QuoteRefusal =
  | { reason: 'QUOTE_NOT_IN_FORCE' }
  /** The term has more than one billing cycle and the quote does not say how it is paid: the fields still to give. */
  | { reason: 'SCHEDULE_REQUIRED'; missing: string[] }
  /** The payment frequency is shorter than the billing cycle of the price, so a payment would be a fraction of a price. */
  | { reason: 'PAYMENT_FREQUENCY_INVALID' }
  | { reason: 'AMOUNT_TOO_LARGE' };

export type QuotePricing =
  | {
      status: 'PRICED';
      amount: Money;
      unitPrice: Money;
      billingCycle: QuoteCycle;
      periods: PaymentPeriod[];
      budgetYear: number;
      firstPaymentOn: BusinessDate;
    }
  | ({ status: 'REFUSED' } & QuoteRefusal);

export function priceFromQuote(input: QuotePricingInput): QuotePricing {
  const { quote, termMonths, beneficiaries } = input;
  if (quote.validFrom > input.today || (quote.validUntil !== null && quote.validUntil < input.today)) {
    return { status: 'REFUSED', reason: 'QUOTE_NOT_IN_FORCE' };
  }
  const cycleMonths = MONTHS[quote.billingCycle];
  const cycles = Math.ceil(termMonths / cycleMonths);

  let frequencyMonths = termMonths;
  let commitmentMonths = termMonths;
  if (cycles > 1) {
    const missing: string[] = [];
    if (quote.paymentFrequency === null) missing.push('quote.paymentFrequency');
    if (quote.paymentFrequency !== 'UPFRONT_ONCE' && quote.commitmentMonths === null) {
      missing.push('quote.commitmentMonths');
    }
    if (missing.length > 0) return { status: 'REFUSED', reason: 'SCHEDULE_REQUIRED', missing };

    if (quote.paymentFrequency !== 'UPFRONT_ONCE') {
      frequencyMonths = MONTHS[quote.paymentFrequency as QuoteCycle];
      commitmentMonths = quote.commitmentMonths as number;
      if (frequencyMonths % cycleMonths !== 0) return { status: 'REFUSED', reason: 'PAYMENT_FREQUENCY_INVALID' };
    }
  }

  const firstPaymentOn = quote.firstPaymentOn ?? input.expectedSpendOn;
  const perCycle = quote.unitPrice.amountMinor * BigInt(beneficiaries);
  const count = Math.ceil(termMonths / frequencyMonths);
  let amountMinor = 0n;
  let totalMinor = 0n;
  const periods = Array.from({ length: count }, (_, index): PaymentPeriod => {
    const startMonth = index * frequencyMonths;
    const months = Math.min(frequencyMonths, termMonths - startMonth);
    const payment = perCycle * BigInt(Math.ceil(months / cycleMonths));
    const binding = startMonth < commitmentMonths;
    totalMinor += payment;
    if (binding) amountMinor += payment;
    const dueOn = addMonths(firstPaymentOn, startMonth);

    return {
      dueOn,
      amountMinor: payment,
      budgetYear: fiscalYearOf(dueOn, input.fiscalYearStartMonth),
      binding,
    };
  });
  if (totalMinor > MAX_AMOUNT_MINOR) return { status: 'REFUSED', reason: 'AMOUNT_TOO_LARGE' };

  return {
    status: 'PRICED',
    amount: { amountMinor, currency: quote.unitPrice.currency },
    unitPrice: quote.unitPrice,
    billingCycle: quote.billingCycle,
    periods,
    budgetYear: fiscalYearOf(firstPaymentOn, input.fiscalYearStartMonth),
    firstPaymentOn,
  };
}
