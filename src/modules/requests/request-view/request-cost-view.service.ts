import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { termRunOf } from '../../../core/term-limit';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import { PricingViewService, type CostView } from './pricing-view.service';

/**
 * What a request that was sent costs by the year, for the readers of its detail and of its spend step (`QĐ-111j`, `QĐ-111k`, R-38, R-39): the
 * amounts are the ones the request keeps (or the ones the check just worked out for today), the months and the cut at the end of a contract
 * are the run its time of use has from today. A request of an older release that carries an end date, and one for a group, whose people have
 * each their own contract, show the amounts and no run.
 */
@Injectable()
export class RequestCostViewService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly pricing: PricingViewService,
  ) {}

  async of(
    request: Pick<AccessRequestRecord, 'type' | 'termMonths' | 'expectedEndDate' | 'beneficiaryEmployeeIds'>,
    pricing: PricingRecord,
    tx?: DbTx,
  ): Promise<CostView | null> {
    if (pricing.status !== 'PRICED' || request.expectedEndDate !== null) return this.pricing.costView(pricing, null);
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const contractEndsOn =
      request.type === 'GROUP_GRANT' ? null : await this.contractEndOf(request.beneficiaryEmployeeIds[0], tx);

    return this.pricing.costView(pricing, termRunOf({ start: today, months: request.termMonths, contractEndsOn }));
  }

  private async contractEndOf(employeeId: string | undefined, tx?: DbTx): Promise<BusinessDate | null> {
    if (employeeId === undefined) return null;

    return (await this.organizationReads.getEmployee(employeeId, tx))?.contractEndsOn ?? null;
  }
}
