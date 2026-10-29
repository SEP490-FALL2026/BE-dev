import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { OrganizationApi } from '../../../organization/public/organization.api';
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
    private readonly organization: OrganizationApi,
    private readonly catalog: CatalogApi,
  ) {}

  async pageOf(
    employeeId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: OpenRequestOfBeneficiary[]; total: number }> {
    const { items, total } = await this.repo.pageOf(employeeId, page, tx);
    const planIds = [...new Set(items.flatMap((item) => (item.planId === null ? [] : [item.planId])))];
    const [people, plans, beneficiary] = await Promise.all([
      this.organization.getEmployees([...new Set(items.map((item) => item.requesterEmployeeId))], tx),
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.organization.getEmployees([employeeId], tx),
    ]);
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
