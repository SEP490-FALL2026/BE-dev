import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { BudgetCheckRepo } from '../spend/budget-check.repo';
import { SpendBatchRepo } from '../spend/spend-batch.repo';
import { SpendReadSupport } from '../spend/spend-read.service';
import { SpendStepRepo } from '../spend/spend-step.repo';
import type { ApprovalSummaryWire } from './spend-approval.dto';
import { approvalSummaryOf, type QueueLookups } from './spend-approval.mapper';

type OpenSpendRows = Awaited<ReturnType<SpendStepRepo['pageOpenSpendOf']>>['rows'];

/**
 * What waits for the spending approver (`US-06-01` AC-1): the spend steps given to them that are open, the oldest first, with what
 * each request is and what it costs. Only the person the step is given to reads it; the others are answered as if there were none.
 */
@Injectable()
export class SpendApprovalQueueService {
  constructor(
    private readonly steps: SpendStepRepo,
    private readonly checks: BudgetCheckRepo,
    private readonly batches: SpendBatchRepo,
    private readonly catalog: CatalogApi,
    private readonly organization: OrganizationApi,
    private readonly support: SpendReadSupport,
  ) {}

  /** The spend steps waiting for the caller, the oldest first. */
  async queue(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number },
  ): Promise<Page<ApprovalSummaryWire>> {
    const { rows, total } = await this.steps.pageOpenSpendOf(
      actor.employeeId,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const lookups = await this.lookupsFor(rows);

    return pageOf(
      rows.map((row) => approvalSummaryOf(row, lookups)),
      total,
      query.page,
      query.pageSize,
    );
  }

  private async lookupsFor(rows: OpenSpendRows): Promise<QueueLookups> {
    const requestIds = rows.map((row) => row.requestId);
    const planIds = [...new Set(rows.map((row) => row.request.planId).filter((id): id is string => id !== null))];
    const [checks, batches, plans, people, units, centers] = await Promise.all([
      this.checks.latestOf(requestIds),
      this.batches.latestBatchOf(requestIds),
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.support.people(
        rows.flatMap((row) => [
          row.request.requesterEmployeeId,
          row.request.type === 'GROUP_GRANT' ? null : (row.request.beneficiaries[0]?.employeeId ?? null),
        ]),
      ),
      this.support.units(rows.map((row) => row.request.amountCurrency)),
      // A step is only ever opened for a request that was sent, so it has its Cost Center; a draft has none and has no step.
      this.organization.costCentersByIds([
        ...new Set(rows.flatMap((row) => (row.request.costCenterId === null ? [] : [row.request.costCenterId]))),
      ]),
    ]);

    return { checks, batches, plans, people, units, centers };
  }
}
