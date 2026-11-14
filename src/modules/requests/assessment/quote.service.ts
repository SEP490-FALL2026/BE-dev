import { Injectable } from '@nestjs/common';
import { DONG } from '../../../core/money/money';
import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import type { BusinessDate } from '../../../core/business-date';
import { FinanceApi } from '../../finance/public/finance.api';
import type { PricingRecord } from '../access-request/access-request.types';
import { AssessmentIncompleteError, AssessmentQuoteRefusedError } from './assessment.errors';
import type { Quote } from '../access-request/assessment-record.types';
import { priceFromQuote, pricingRecordOfQuote } from '../repricing/quote-pricing.policy';
import type { AssessmentPatchDto } from './assessment.dto';

/**
 * The quote the IT Admin records, read from the body and turned into the price of a request (`US-05-06` AC-14, AC-15). It is
 * shared by the completion of an assessment and by the registration of internal software that needs a payment, so that a
 * quote is judged the same way wherever it gives a request its amount.
 */
@Injectable()
export class QuoteService {
  constructor(private readonly finance: FinanceApi) {}

  /**
   * Throws AssessmentQuoteRefusedError when the quote is not in dong (`QUOTE_PRICE_NOT_VND`, `QĐ-111an`: nothing here converts) or ends before
   * it begins, and the money errors. The price the vendor quoted in another currency is read in its own currency and only kept.
   */
  async read(input: NonNullable<AssessmentPatchDto['quote']>): Promise<Quote> {
    if (input.unitPrice.currency !== DONG) throw new AssessmentQuoteRefusedError('QUOTE_PRICE_NOT_VND');
    const unitPrice = await this.finance.parseMoney(input.unitPrice);
    if (unitPrice.amountMinor < 0n) throw new MoneyOutOfRangeError();
    const originalPrice = input.originalPrice ? await this.finance.parseMoney(input.originalPrice) : null;
    if (originalPrice !== null && originalPrice.amountMinor < 0n) throw new MoneyOutOfRangeError();
    const validUntil = input.validUntil ?? null;
    if (validUntil !== null && validUntil < input.validFrom) {
      throw new AssessmentQuoteRefusedError('QUOTE_PERIOD_INVALID');
    }

    return {
      unitPrice,
      originalPrice,
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
    /** `endIsDerived`: the end was worked out from the months of use asked, as of `checkDate`; the request carries no end date (`QĐ-111i`). */
    request: { beneficiaries: number; endDate: BusinessDate | null; endIsDerived?: boolean },
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

    return pricingRecordOfQuote(priced, request.endIsDerived === true ? null : request.endDate);
  }
}
