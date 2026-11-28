import { Injectable } from '@nestjs/common';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import { BudgetCheckRepo } from '../spend/budget-check.repo';
import { SpendBatchRepo } from '../spend/spend-batch.repo';
import type { SpendStepRepo } from '../spend/spend-step.repo';
import { SpendWireViewService } from '../spend/spend-wire-view.service';
import { NextYearBudgetService } from './next-year-budget.service';
import type { QueueLookups } from './spend-approval.mapper';
import { StepDueOnService } from './step-due-on.service';

type OpenSpendRows = Awaited<ReturnType<SpendStepRepo['pageOpenSpendOf']>>['rows'];

/** Reads page-level facts (checks, batches, plans, people, units, Cost Centers, due dates, next-year budgets, ticket refs) for the spend-approval queue. */
@Injectable()
export class SpendApprovalQueueFactsService {
  constructor(
    private readonly checks: BudgetCheckRepo,
    private readonly batches: SpendBatchRepo,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly wireView: SpendWireViewService,
    private readonly deadlines: StepDueOnService,
    private readonly nextYear: NextYearBudgetService,
    private readonly tickets: RequestTicketRepo,
  ) {}

  async load(rows: OpenSpendRows): Promise<QueueLookups> {
    const requestIds = rows.map((row) => row.requestId);
    const planIds = [...new Set(rows.map((row) => row.request.planId).filter((id): id is string => id !== null))];
    const [checks, batches, plans, people, units, centers, due, nextYear, ticketRefs] = await Promise.all([
      this.checks.latestOf(requestIds),
      this.batches.latestBatchOf(requestIds),
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.wireView.people(
        rows.flatMap((row) => [
          row.request.requesterEmployeeId,
          row.request.type === 'GROUP_GRANT' ? null : (row.request.beneficiaries[0]?.employeeId ?? null),
        ]),
      ),
      this.wireView.units(rows.map((row) => row.request.amountCurrency)),
      // A step is only ever opened for a request that was sent, so it has its Cost Center; a draft has none and has no step.
      this.organizationReads.costCentersByIds([
        ...new Set(rows.flatMap((row) => (row.request.costCenterId === null ? [] : [row.request.costCenterId]))),
      ]),
      this.deadlines.dueOn(
        rows.map((row) => ({ id: row.id, createdAt: row.createdAt, slaWorkingDays: row.slaWorkingDays })),
      ),
      this.nextYear.of(
        rows.map((row) => ({
          requestId: row.requestId,
          costCenterId: row.request.costCenterId,
          budgetYear: row.request.budgetYear,
          nextYearAmountMinor: row.request.nextYearAmountMinor,
          currency: row.request.amountCurrency,
        })),
      ),
      this.tickets.refsOf(requestIds),
    ]);

    return { checks, batches, plans, people, units, centers, due, nextYear, ticketRefs };
  }
}
