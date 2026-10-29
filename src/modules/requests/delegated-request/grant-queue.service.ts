import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import type { GrantQueueItemWire } from './delegated-request.dto';
import { GrantQueueRepo } from './grant-queue.repo';

/**
 * What waits for the IT Admin to carry out (`US-03-02` AC-6): the requests approved in full and not yet granted, kept
 * together by the person they are for, so that what a head sent for one new colleague is read as one piece of work. It only
 * reads; the grant itself is the grant of a seat (`US-07-01`).
 */
@Injectable()
export class GrantQueueService {
  constructor(
    private readonly queue: GrantQueueRepo,
    private readonly catalog: CatalogApi,
    private readonly organization: OrganizationApi,
  ) {}

  async page(query: {
    beneficiaryEmployeeId?: string;
    page: number;
    pageSize: number;
  }): Promise<Page<GrantQueueItemWire>> {
    const { rows, total } = await this.queue.page(
      { beneficiaryEmployeeId: query.beneficiaryEmployeeId },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const [plans, people] = await Promise.all([
      rows.length === 0
        ? Promise.resolve([])
        : this.catalog.getPlanSummaries([...new Set(rows.map((row) => row.planId))]),
      rows.length === 0
        ? Promise.resolve([])
        : this.organization.getEmployees([
            ...new Set(rows.flatMap((row) => [row.requesterEmployeeId, row.beneficiaryEmployeeId])),
          ]),
    ]);
    const ref = (id: string) => {
      const found = people.find((employee) => employee.id === id);
      if (!found) throw new Error(`The employee ${id} of a waiting request does not exist.`);

      return { employeeId: found.id, employeeCode: found.employeeCode, fullName: found.fullName };
    };
    const items = rows.flatMap((row) => {
      const plan = plans.find((candidate) => candidate.planId === row.planId);
      if (!plan) return [];

      return [
        {
          requestId: row.id,
          type: row.type,
          boundaryState: row.boundaryState,
          lineCount: row.lineCount,
          plan: { planId: plan.planId, planName: plan.planName, applicationName: plan.applicationName },
          beneficiary: ref(row.beneficiaryEmployeeId),
          requester: ref(row.requesterEmployeeId),
          delegatedBatchId: row.delegatedBatchId,
          expectedEndDate: row.expectedEndDate,
          submittedAt: row.submittedAt.toISOString(),
        },
      ];
    });

    return pageOf(items, total, query.page, query.pageSize);
  }
}
