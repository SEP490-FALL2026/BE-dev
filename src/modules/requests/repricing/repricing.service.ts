import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import { renewalStartOf } from '../../../core/term-limit';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { pricedPeople } from '../access-request/group-request.types';
import { AccessRequestNotPriceableError } from '../access-request/access-request.errors';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import { priceFromQuote, pricingRecordOfQuote } from './quote-pricing.policy';
import { RequestFactsService } from '../access-request/request-facts.service';

/** The people a request is priced for: all of them, and for a group those who have not been refused, withdrawn or left out. */
const peopleOf = (request: AccessRequestRecord): number =>
  request.type === 'GROUP_GRANT'
    ? pricedPeople(request.lines.map((line) => line.state))
    : request.beneficiaryEmployeeIds.length;

/**
 * What a request costs on another day (`US-05-04` AC-16, `US-06-14` AC-13, AC-15, `QĐ-109e`): the price of its plan in the catalog
 * worked out for the months left of the year of that day, or the quote the IT Admin recorded. Software that is not priced yet stays
 * so, with the new day and its budget year. It decides nothing: the head's supplementary file and the approval of the need write
 * what this returns.
 */
@Injectable()
export class RepricingService {
  constructor(
    private readonly assessment: RequestFactsService,
    private readonly assessments: AssessmentReadRepo,
  ) {}

  /** Throws AccessRequestNotPriceableError when the request has no price for that day. `asOf` is the day the amount is worked out on. */
  async reprice(tx: DbTx, request: AccessRequestRecord, asOf: BusinessDate): Promise<PricingRecord> {
    if (request.branch === 'PAID_IN_CATALOG' && request.planId !== null) {
      // A request to go on using counts from the day the new period begins, to the end it asked for; there is no month in a year the period
      // has not reached yet (`QĐ-109b`).
      const { renewal } = request;

      return this.assessment.priceFor(tx, {
        planId: request.planId,
        free: false,
        beneficiaries: peopleOf(request),
        checkDate: asOf,
        endDate: renewal ? renewal.newExpectedEndDate : request.expectedEndDate,
        from: renewal ? renewalStartOf({ previousEnd: renewal.previousExpectedEndDate, today: asOf }) : undefined,
      });
    }
    if (request.branch !== 'NEW_SOFTWARE') throw new AccessRequestNotPriceableError();

    const assessment = await this.assessments.findAssessment(request.id, tx);
    if (assessment?.status !== 'COMPLETED' || assessment.quote === null) {
      return {
        status: 'MISSING',
        missingReason: 'AWAITING_QUOTE',
        kind: null,
        expectedEndDate: request.expectedEndDate,
        amountMonths: null,
        budgetYear: fiscalYearOf(asOf),
        amount: null,
        unitPrice: null,
        billingCycle: null,
        nextYearAmount: null,
      };
    }
    const priced = priceFromQuote({
      quote: assessment.quote,
      beneficiaries: peopleOf(request),
      checkDate: asOf,
      endDate: request.expectedEndDate,
      expiredStillPrices: true,
    });
    // A quote that is not in force, has no price or is too large is a request that cannot be priced that day.
    if (priced.status === 'REFUSED') throw new AccessRequestNotPriceableError();

    return pricingRecordOfQuote(priced, request.expectedEndDate);
  }
}
