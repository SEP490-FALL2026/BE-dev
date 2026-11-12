import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { OpenRequestOfBeneficiary } from '../../public/requests.types';
import { OpenRequestRepo } from './open-request.repo';

/**
 * The requests of a person that are still open, with the plan and who sent each (`US-03-04` AC-24). Nothing here changes a request:
 * closing one is the IT Admin's act (`DepartureCancellationService`). The names are read once for the page.
 */
@Injectable()
export class OpenRequestService {
  constructor(
    private readonly repo: OpenRequestRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
  ) {}

  /** The ids of every request the person is a beneficiary of that is open, oldest first: what the system closes when they are gone. */
  idsOf(tx: DbTx, employeeId: string): Promise<string[]> {
    return this.repo.idsOf(tx, employeeId);
  }

  async pageOf(
    employeeId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
    filter: { departmentId?: string } = {},
  ): Promise<{ items: OpenRequestOfBeneficiary[]; total: number }> {
    const { items, total } = await this.repo.pageOf(employeeId, page, tx, filter);
    const planIds = [...new Set(items.flatMap((item) => (item.planId === null ? [] : [item.planId])))];
    const people = await this.organizationReads.getEmployees(
      [...new Set(items.map((item) => item.requesterEmployeeId))],
      tx,
    );
    const plans = planIds.length === 0 ? [] : await this.catalog.getPlanSummaries(planIds);
    const beneficiary = await this.organizationReads.getEmployees([employeeId], tx);
    const left = beneficiary[0]?.status === 'TERMINATED';

    return {
      items: items.flatMap((item) => {
        const requester = people.find((person) => person.id === item.requesterEmployeeId);
        if (!requester) return [];
        const plan = plans.find((candidate) => candidate.planId === item.planId) ?? null;
        const group = item.type === 'GROUP_GRANT';

        return [
          {
            requestId: item.id,
            type: item.type,
            state: item.state,
            plan: plan && {
              planId: plan.planId,
              planName: plan.planName,
              applicationId: plan.applicationId,
              applicationName: plan.applicationName,
            },
            requester: { employeeId: requester.id, employeeCode: requester.employeeCode, fullName: requester.fullName },
            submittedAt: item.submittedAt,
            group,
            // A request for a group is listed only while this person's line is open, and the line is what the IT Admin closes.
            cancellable: left,
          },
        ];
      }),
      total,
    };
  }
}
