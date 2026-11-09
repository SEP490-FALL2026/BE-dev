import type { BusinessDate } from '../../../core/business-date';
import type { Money } from '../../../core/money/money';
import type { PricingRecord } from '../access-request/access-request.types';
import type { Quote, QuoteCycle } from '../access-request/assessment-record.types';
import { requestAmountOf } from '../access-request/pricing.policy';

/**
 * What a request for software that is not in the catalog costs, from the quote the IT Admin records (`US-05-06` AC-14, `QĐ-84e`,
 * `BR-MF1-06`), as a pure calculation. The quote gives the price of one person for one billing cycle; the amount is counted as the one
 * of a plan in the catalog is: the months left of the calendar year of the check date, for the people it is for. A request is _priced_
 * only when the quote is in force and has a price; otherwise nothing is guessed and the request stays with the IT Admin.
 */

export interface QuotePricingInput {
  quote: Quote;
  beneficiaries: number;
  /** The day the amount is worked out on (`QĐ-109e`). */
  checkDate: BusinessDate;
  /** The day the right ends; null when it has no end, so the amount runs to the end of the year. */
  endDate: BusinessDate | null;
}

export type QuoteRefusal =
  | { reason: 'QUOTE_NOT_IN_FORCE' }
  /** The quote has no price: a paid request never costs 0, so the price data is incomplete. */
  | { reason: 'PRICE_REQUIRED'; missing: string[] }
  | { reason: 'AMOUNT_TOO_LARGE' };

export type QuotePricing =
  | {
      status: 'PRICED';
      amount: Money;
      unitPrice: Money;
      billingCycle: QuoteCycle;
      months: number | null;
      budgetYear: number;
    }
  | ({ status: 'REFUSED' } & QuoteRefusal);

export function priceFromQuote(input: QuotePricingInput): QuotePricing {
  const { quote } = input;
  if (quote.validFrom > input.checkDate || (quote.validUntil !== null && quote.validUntil < input.checkDate)) {
    return { status: 'REFUSED', reason: 'QUOTE_NOT_IN_FORCE' };
  }
  const priced = requestAmountOf({
    kind: 'RECURRING',
    unitPrice: quote.unitPrice,
    billingCycle: quote.billingCycle,
    beneficiaries: input.beneficiaries,
    checkDate: input.checkDate,
    endDate: input.endDate,
  });
  if (priced.status === 'MISSING') {
    return priced.reason === 'AMOUNT_TOO_LARGE'
      ? { status: 'REFUSED', reason: 'AMOUNT_TOO_LARGE' }
      : { status: 'REFUSED', reason: 'PRICE_REQUIRED', missing: ['quote.unitPrice'] };
  }

  return {
    status: 'PRICED',
    amount: priced.amount,
    unitPrice: quote.unitPrice,
    billingCycle: quote.billingCycle,
    months: priced.months,
    budgetYear: priced.budgetYear,
  };
}

/** The price a request keeps when the quote prices it: one amount for the months left of the year, the same shape as a plan of the catalog. */
export function pricingRecordOfQuote(
  priced: Extract<QuotePricing, { status: 'PRICED' }>,
  endDate: BusinessDate | null,
): PricingRecord {
  return {
    status: 'PRICED',
    missingReason: null,
    kind: 'RECURRING',
    expectedEndDate: endDate,
    amountMonths: priced.months,
    budgetYear: priced.budgetYear,
    amount: priced.amount,
    unitPrice: priced.unitPrice,
    billingCycle: priced.billingCycle,
    nextYearAmount: null,
  };
}
