import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestNotPriceableError } from '../access-request/access-request.errors';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import { RepricingService } from '../assessment/repricing.service';
import { GroupSupplementService } from '../group-request/group-supplement.service';
import { supplementChangeOf } from '../spend/spend-submission.policy';
import { SpendSupplementRefusedError } from '../spend/spend.errors';

/**
 * The request priced again for the new day and for the people who remain (`QĐ-82n`, `US-06-14` AC-13): the budget year follows the day.
 * A quote may fix the day of the first payment itself, and then the day did not change, and neither did anything else (`NO_CHANGE`).
 * Throws SpendSupplementRefusedError and AccessRequestNotPriceableError.
 */
@Injectable()
export class SupplementPricing {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly repricing: RepricingService,
    private readonly groups: GroupSupplementService,
  ) {}

  async repriceFor(
    tx: DbTx,
    request: AccessRequestRecord,
    input: { dropped: readonly string[]; now: Date },
  ): Promise<{ repriced: PricingRecord; change: NonNullable<ReturnType<typeof supplementChangeOf>> }> {
    const { pricing } = request;
    const today = await this.organizationReads.businessToday(input.now, tx);
    const repriced = await this.repricing.reprice(
      tx,
      this.groups.withoutPeople(request, input.dropped),
      pricing.expectedSpendOn as string,
      { today },
    );
    if (input.dropped.length === 0) {
      throw new SpendSupplementRefusedError('NO_CHANGE');
    }
    const change = supplementChangeOf(pricing, repriced);
    if (change === null) throw new AccessRequestNotPriceableError();

    return { repriced, change };
  }
}
