import type { BusinessDate } from '../../../core/business-date';
import { DONG, type Money } from '../../../core/money/money';
import { roundHalfAway } from '../../../core/seat-month-cost';
import type { PricingRecord } from '../access-request/access-request.types';
import type { Quote, QuoteCycle } from '../access-request/assessment-record.types';
import { requestAmountOf } from '../access-request/pricing.policy';

const CYCLE_MONTHS: Readonly<Record<QuoteCycle, bigint>> = { MONTHLY: 1n, QUARTERLY: 3n, ANNUAL: 12n };

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
  /**
   * True when a check prices the request again (`QĐ-109e`): a quote that is no longer valid still gives the amount, and the check blocks
   * the request with `PRICE_EXPIRED` (`BR-MF1-06g`(iv)) instead of failing to price it. The IT Admin recording a quote never sets it.
   */
  expiredStillPrices?: boolean;
}

export type QuoteRefusal =
  | { reason: 'QUOTE_NOT_IN_FORCE' }
  /** The quote is kept in another currency (`QĐ-111an`): nothing here converts, so it prices nothing until it is recorded again in dong. */
  | { reason: 'QUOTE_PRICE_NOT_VND' }
  /** The quote has no price: a paid request never costs 0, so the price data is incomplete. */
  | { reason: 'PRICE_REQUIRED'; missing: string[] }
  | { reason: 'AMOUNT_TOO_LARGE' };

export type QuotePricing =
  | {
      status: 'PRICED';
      amount: Money;
      unitPrice: Money;
      monthlyPriceMinor: bigint;
      billingCycle: QuoteCycle;
      months: number | null;
      budgetYear: number;
      /** The cost of the months that begin in the year after (`QĐ-111k`); null when none does. */
      nextYearAmount: Money | null;
    }
  | ({ status: 'REFUSED' } & QuoteRefusal);

export function priceFromQuote(input: QuotePricingInput): QuotePricing {
  const { quote } = input;
  if (quote.unitPrice.currency !== DONG) return { status: 'REFUSED', reason: 'QUOTE_PRICE_NOT_VND' };
  const expired = quote.validUntil !== null && quote.validUntil < input.checkDate;
  if (quote.validFrom > input.checkDate || (expired && input.expiredStillPrices !== true)) {
    return { status: 'REFUSED', reason: 'QUOTE_NOT_IN_FORCE' };
  }
  const monthlyPriceMinor = roundHalfAway(quote.unitPrice.amountMinor, CYCLE_MONTHS[quote.billingCycle]);
  const priced = requestAmountOf({
    kind: 'RECURRING',
    unitPrice: quote.unitPrice,
    monthlyPriceMinor,
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
    monthlyPriceMinor,
    billingCycle: quote.billingCycle,
    months: priced.months,
    budgetYear: priced.budgetYear,
    nextYearAmount: priced.nextYearAmount,
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
    monthlyPriceMinor: priced.monthlyPriceMinor,
    billingCycle: priced.billingCycle,
    nextYearAmount: priced.nextYearAmount,
  };
}
