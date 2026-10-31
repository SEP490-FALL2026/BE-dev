import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import type { Quote } from '../access-request/assessment-record.types';
import { QuoteService } from './quote.service';

const NOT_APPLICABLE: PricingRecord = {
  status: 'NOT_APPLICABLE',
  missingReason: null,
  expectedSpendOn: null,
  budgetYear: null,
  amount: null,
  unitPrice: null,
  billingCycle: null,
  schedule: null,
};

/**
 * The request priced by the quote of its assessment, on the business day of the completion (`US-05-06` AC-3, AC-11): for the term it
 * asked for and the people it is for, the day the money goes out being the one it named, or the day itself when it named none.
 * Throws the errors of QuoteService.price for a quote that is not in force or does not say how a term is paid.
 */
@Injectable()
export class AssessmentPricingService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly quotes: QuoteService,
  ) {}

  async priceCompleted(
    tx: DbTx,
    request: AccessRequestRecord,
    quote: Quote,
    when: { now: Date; fiscalYearStartMonth: number },
  ): Promise<PricingRecord> {
    const today = await this.organizationReads.businessToday(when.now, tx);

    return this.quotes.price(
      quote,
      {
        termMonths: request.termMonths,
        beneficiaries: request.beneficiaryEmployeeIds.length,
        expectedSpendOn: request.pricing.expectedSpendOn ?? today,
      },
      { today, fiscalYearStartMonth: when.fiscalYearStartMonth },
    );
  }

  /**
   * The quote a registration of internal software brings when its grant needs a payment, read, and the request priced by it; nothing
   * is priced when nothing is paid (`US-05-20` AC-10). Throws the errors of QuoteService.
   */
  async registrationPricing(
    tx: DbTx,
    request: AccessRequestRecord,
    spendQuote: Parameters<QuoteService['read']>[0] | undefined,
    when: { now: Date; fiscalYearStartMonth: number },
  ): Promise<{ quote: Quote | null; pricing: PricingRecord }> {
    const today = await this.organizationReads.businessToday(when.now, tx);
    const quote = spendQuote ? await this.quotes.read(spendQuote) : null;
    if (!quote) return { quote, pricing: NOT_APPLICABLE };
    const pricing = this.quotes.price(
      quote,
      {
        termMonths: request.termMonths,
        beneficiaries: request.beneficiaryEmployeeIds.length,
        expectedSpendOn: request.pricing.expectedSpendOn ?? today,
      },
      { today, fiscalYearStartMonth: when.fiscalYearStartMonth },
    );

    return { quote, pricing };
  }
}
