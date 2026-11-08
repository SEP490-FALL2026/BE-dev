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
      commitmentMonths: input.commitmentMonths ?? null,
      paymentFrequency: input.paymentFrequency ?? null,
      firstPaymentOn: input.firstPaymentOn ?? null,
    };
  }

  /**
   * The request priced by the quote, as it is kept. Throws AssessmentIncompleteError when the quote does not say how a term
   * of several billing cycles is paid, and AssessmentQuoteRefusedError when it is not in force or cannot be laid out.
   */
  price(
    quote: Quote,
    request: { termMonths: number; beneficiaries: number; expectedSpendOn: BusinessDate },
    context: { today: BusinessDate },
  ): PricingRecord {
    const priced = priceFromQuote({
      quote,
      termMonths: request.termMonths,
      beneficiaries: request.beneficiaries,
      today: context.today,
      expectedSpendOn: request.expectedSpendOn,
    });
    if (priced.status === 'REFUSED') {
      if (priced.reason === 'SCHEDULE_REQUIRED' || priced.reason === 'PRICE_REQUIRED') {
        throw new AssessmentIncompleteError(priced.missing);
      }
      throw new AssessmentQuoteRefusedError(priced.reason);
    }

    return {
      status: 'PRICED',
      missingReason: null,
      expectedSpendOn: priced.firstPaymentOn,
      budgetYear: priced.budgetYear,
      amount: priced.amount,
      unitPrice: priced.unitPrice,
      billingCycle: priced.billingCycle,
      schedule: priced.periods,
    };
  }
}
