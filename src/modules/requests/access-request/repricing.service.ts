import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { pricedPeople } from '../group-request/group-request.types';
import { AccessRequestNotPriceableError } from './access-request.errors';
import type { AccessRequestRecord, PricingRecord } from './access-request.types';
import { AssessmentIncompleteError, AssessmentQuoteRefusedError } from './assessment.errors';
import { AssessmentRepo } from './assessment.repo';
import { QuoteService } from './quote.service';
import { RequestAssessmentService } from './request-assessment.service';

/** The people a request is priced for: all of them, and for a group those who have not been refused, withdrawn or left out. */
const peopleOf = (request: AccessRequestRecord): number =>
  request.type === 'GROUP_GRANT'
    ? pricedPeople(request.lines.map((line) => line.state))
    : request.beneficiaryEmployeeIds.length;

/**
 * What a request costs when the day the money goes out is another day (`US-05-04` AC-16, `US-06-14` AC-13, AC-15): the price
 * of its plan in the catalog laid out from the new day, or the quote the IT Admin recorded, which may fix the day itself.
 * Software that is not priced yet stays so, with the new day and its budget year. It decides nothing: the head's supplementary
 * file and the approval of the need write what this returns.
 */
@Injectable()
export class RepricingService {
  constructor(
    private readonly assessment: RequestAssessmentService,
    private readonly quotes: QuoteService,
    private readonly assessments: AssessmentRepo,
  ) {}

  /** Throws AccessRequestNotPriceableError when the request has no price for that day. */
  async reprice(
    tx: DbTx,
    request: AccessRequestRecord,
    expectedSpendOn: BusinessDate,
    context: { today: BusinessDate; fiscalYearStartMonth: number },
  ): Promise<PricingRecord> {
    if (request.branch === 'PAID_IN_CATALOG' && request.planId !== null) {
      return this.assessment.priceFor(tx, {
        planId: request.planId,
        departmentId: request.departmentId,
        free: false,
        termMonths: request.termMonths,
        beneficiaries: peopleOf(request),
        expectedSpendOn,
        today: context.today,
        fiscalYearStartMonth: context.fiscalYearStartMonth,
      });
    }
    if (request.branch !== 'NEW_SOFTWARE') throw new AccessRequestNotPriceableError();

    const assessment = await this.assessments.findAssessment(request.id, tx);
    if (assessment?.status !== 'COMPLETED' || assessment.quote === null) {
      return {
        status: 'MISSING',
        missingReason: 'AWAITING_QUOTE',
        expectedSpendOn,
        budgetYear: fiscalYearOf(expectedSpendOn, context.fiscalYearStartMonth),
        amount: null,
        unitPrice: null,
        billingCycle: null,
        schedule: null,
      };
    }
    try {
      return this.quotes.price(
        assessment.quote,
        { termMonths: request.termMonths, beneficiaries: peopleOf(request), expectedSpendOn },
        context,
      );
    } catch (error) {
      if (error instanceof AssessmentIncompleteError || error instanceof AssessmentQuoteRefusedError) {
        throw new AccessRequestNotPriceableError();
      }
      throw error;
    }
  }
}
