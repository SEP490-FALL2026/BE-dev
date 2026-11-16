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
import { pricingRecordFor } from '../access-request/pricing.policy';
import { CatalogPricingApi } from '../../catalog/public/catalog-pricing.api';
import { RequestTermEndsService } from './request-term-ends.service';

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
    private readonly catalog: CatalogPricingApi,
    private readonly assessments: AssessmentReadRepo,
    private readonly termEnds: RequestTermEndsService,
  ) {}

  /** Throws AccessRequestNotPriceableError when the request has no price for that day. `asOf` is the day the amount is worked out on. */
  async reprice(tx: DbTx, request: AccessRequestRecord, asOf: BusinessDate): Promise<PricingRecord> {
    if (request.branch === 'PAID_IN_CATALOG' && request.planId !== null) {
      // A request to go on using counts from the day the new period begins, to the end it asked for; there is no month in a year the period
      // has not reached yet (`QĐ-109b`).
      const { renewal } = request;
      // A request that keeps its months of use is worked out from the day it is checked on, each person for their own end (`QĐ-111i`, R-38).
      const ends = await this.termEnds.of(tx, request, asOf);

      return pricingRecordFor(
        {
          planId: request.planId,
          free: false,
          beneficiaries: peopleOf(request),
          checkDate: asOf,
          endDate: renewal ? renewal.newExpectedEndDate : request.expectedEndDate,
          ...(ends === null ? {} : { endsByPerson: ends, endIsDerived: true }),
          from: renewal ? renewalStartOf({ previousEnd: renewal.previousExpectedEndDate, today: asOf }) : undefined,
        },
        await this.catalog.getPlanPrice(request.planId, tx),
      );
    }
    if (request.branch !== 'NEW_SOFTWARE') throw new AccessRequestNotPriceableError();

    return this.repriceByQuote(tx, request, asOf);
  }

  /** A proposal of software that is not in the catalog is priced by the quote the IT Admin recorded (`US-05-06` AC-14). */
  private async repriceByQuote(tx: DbTx, request: AccessRequestRecord, asOf: BusinessDate): Promise<PricingRecord> {
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
    const ends = await this.termEnds.of(tx, request, asOf);
    const priced = priceFromQuote({
      quote: assessment.quote,
      beneficiaries: peopleOf(request),
      checkDate: asOf,
      // A proposal is for one person; a request that keeps its months of use is worked out from the day it is checked on.
      endDate: ends === null ? request.expectedEndDate : (ends[0] ?? null),
      expiredStillPrices: true,
    });
    // A quote that is not in force, has no price or is too large is a request that cannot be priced that day.
    if (priced.status === 'REFUSED') throw new AccessRequestNotPriceableError();

    return pricingRecordOfQuote(priced, ends === null ? request.expectedEndDate : null);
  }
}
