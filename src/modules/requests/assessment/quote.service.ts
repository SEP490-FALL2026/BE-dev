import { Injectable } from '@nestjs/common';
import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import type { BusinessDate } from '../../../core/business-date';
import { FinanceApi } from '../../finance/public/finance.api';
import type { PricingRecord } from '../access-request/access-request.types';
import { AssessmentIncompleteError, AssessmentQuoteRefusedError } from './assessment.errors';
import type { Quote } from '../access-request/assessment-record.types';
import { priceFromQuote } from './quote-pricing.policy';
import type { AssessmentPatchDto } from './assessment.dto';

/**
 * The quote the IT Admin records, read from the body and turned into the price of a request (`US-05-06` AC-14, AC-15). It is
 * shared by the completion of an assessment and by the registration of internal software that needs a payment, so that a
 * quote is judged the same way wherever it gives a request its amount.
 */
@Injectable()
export class QuoteService {
  constructor(private readonly finance: FinanceApi) {}

  /** Throws the money errors, and AssessmentQuoteRefusedError when the quote ends before it begins. */
  async read(input: NonNullable<AssessmentPatchDto['quote']>): Promise<Quote> {
    const unitPrice = await this.finance.parseMoney(input.unitPrice);
    if (unitPrice.amountMinor < 0n) throw new MoneyOutOfRangeError();
    const validUntil = input.validUntil ?? null;
    if (validUntil !== null && validUntil < input.validFrom) {
      throw new AssessmentQuoteRefusedError('QUOTE_PERIOD_INVALID');
    }

    return {
      unitPrice,
      billingCycle: input.billingCycle,
      validFrom: input.validFrom,
      validUntil,
    };
  }

  /**
   * The request priced by the quote on `checkDate`, as it is kept (`QĐ-109e`). Throws AssessmentIncompleteError when the quote has
   * no price, and AssessmentQuoteRefusedError when it is not in force or too large.
   */
  price(
    quote: Quote,
    request: { beneficiaries: number; endDate: BusinessDate | null },
    context: { checkDate: BusinessDate },
  ): PricingRecord {
    const priced = priceFromQuote({
      quote,
      beneficiaries: request.beneficiaries,
      checkDate: context.checkDate,
      endDate: request.endDate,
    });
    if (priced.status === 'REFUSED') {
      if (priced.reason === 'PRICE_REQUIRED') throw new AssessmentIncompleteError(priced.missing);
      throw new AssessmentQuoteRefusedError(priced.reason);
    }

    return {
      status: 'PRICED',
      missingReason: null,
      kind: 'RECURRING',
      expectedEndDate: request.endDate,
      amountMonths: priced.months,
      budgetYear: priced.budgetYear,
      amount: priced.amount,
      unitPrice: priced.unitPrice,
      billingCycle: priced.billingCycle,
      nextYearAmount: null,
    };
  }
}
