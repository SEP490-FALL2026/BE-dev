import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestNotPriceableError } from '../access-request/access-request.errors';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import { RepricingService } from '../assessment/repricing.service';
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
  ) {}

  async repriceFor(
    tx: DbTx,
    request: AccessRequestRecord,
    input: { dropped: readonly string[]; expectedEndDate?: BusinessDate; now: Date },
  ): Promise<{ repriced: PricingRecord; change: NonNullable<ReturnType<typeof supplementChangeOf>> }> {
    const { pricing } = request;
    const today = await this.organizationReads.businessToday(input.now, tx);
    if (input.dropped.length === 0 && input.expectedEndDate === undefined) {
      throw new SpendSupplementRefusedError('NO_CHANGE');
    }
    const remaining = this.groups.withoutPeople(request, input.dropped);
    const repriced = await this.repricing.reprice(
      tx,
      input.expectedEndDate === undefined ? remaining : { ...remaining, expectedEndDate: input.expectedEndDate },
      today,
    );
    const change = supplementChangeOf(pricing, repriced);
    if (change === null) throw new AccessRequestNotPriceableError();

    return { repriced, change };
  }
}
