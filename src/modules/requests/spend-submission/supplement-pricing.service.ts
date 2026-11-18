import { Injectable } from '@nestjs/common';
import { termEndOf } from '../../../core/term-limit';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestNotPriceableError } from '../access-request/access-request.errors';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import { RepricingService } from '../repricing/repricing.service';
import { GroupSupplementService } from '../group-request/group-supplement.service';
import { supplementChangeOf } from '../spend/spend-submission.policy';
import { SpendSupplementRefusedError } from '../spend/spend.errors';

/**
 * The request priced again for an earlier end date and for the people who remain (`QĐ-82n`, `US-06-14` AC-13, `L2-38`): the amount is
 * worked out again for the day of the file (`QĐ-109e`) and the budget year follows the day.
 * Throws SpendSupplementRefusedError and AccessRequestNotPriceableError.
 */
@Injectable()
export class SupplementPricing {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly repricing: RepricingService,
    private readonly groups: GroupSupplementService,
    private readonly catalog: CatalogApi,
  ) {}

  /**
   * What the check of the months of a file reads: the kind of the plan decides what months it takes (a plan bought once takes none, K1 at most
   * 9), and a request of an older release, which carries a day, takes only months that end sooner than that day (`QĐ-111i`, `L2-38`). A proposal
   * of software that is not in the catalog has no kind yet: the rule that takes the most judges it.
   */
  async termFactsOf(tx: DbTx, request: AccessRequestRecord, termMonths: number | undefined, now: Date) {
    if (termMonths === undefined) return undefined;
    const [target] = request.planId === null ? [] : await this.catalog.findPlanSeatTargets([request.planId], tx);
    const asked = { requested: termMonths, kind: target?.provisioningType ?? ('K2' as const) };
    if (request.expectedEndDate === null) return { ...asked, current: request.termMonths };

    return {
      ...asked,
      current: null,
      endDate: { today: await this.organizationReads.businessToday(now, tx), end: request.expectedEndDate },
    };
  }

  async repriceFor(
    tx: DbTx,
    request: AccessRequestRecord,
    input: { dropped: readonly string[]; termMonths?: number; now: Date },
  ): Promise<{ repriced: PricingRecord; change: NonNullable<ReturnType<typeof supplementChangeOf>> }> {
    const { pricing } = request;
    const today = await this.organizationReads.businessToday(input.now, tx);
    if (input.dropped.length === 0 && input.termMonths === undefined) {
      throw new SpendSupplementRefusedError('NO_CHANGE');
    }
    const remaining = this.groups.withoutPeople(request, input.dropped);
    // The file keeps the months of use it asks for and no end date: the request is worked out from today, each person for their own end (`QĐ-111i`).
    const repriced = await this.repricing.reprice(
      tx,
      input.termMonths === undefined
        ? remaining
        : { ...remaining, termMonths: input.termMonths, expectedEndDate: null },
      today,
    );
    const change = supplementChangeOf(pricing, repriced);
    if (change === null) throw new AccessRequestNotPriceableError();
    if (input.termMonths === undefined) return { repriced, change };

    // What the file says of the end is the day the time of use ends if it began today, before and after (the contract is not read: it is a statement of the file).
    const beforeMonths = request.expectedEndDate === null ? request.termMonths : null;

    return {
      repriced,
      change: {
        ...change,
        beforeExpectedEndDate:
          request.expectedEndDate ?? (beforeMonths === null ? null : termEndOf(today, beforeMonths)),
        afterExpectedEndDate: termEndOf(today, input.termMonths),
      },
    };
  }
}
