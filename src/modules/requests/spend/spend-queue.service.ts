import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { fromDateColumn } from '../../../core/business-date';
import { formatAmount as formatMinor } from '../../../core/money/money';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogService } from '../../catalog/catalog.service';
import { BudgetCheckRepo } from './budget-check.repo';
import { FinanceReviewRepo } from './finance-review.repo';
import { SlaQueueAgeService } from '../sla/sla-queue-age.service';
import { SpendHeadService } from './spend-head.service';
import { SpendReadSupport } from './spend-read.support';
import { SpendRequestRepo } from './spend-request.repo';
import { queuedStatus } from './spend-status.service';
import type { QueueItemWire } from './spend-submission.dto';

/**
 * The queue of the head (`US-05-04` AC-11, `US-06-14` AC-1, AC-13): the requests of their department that cost money and whose
 * need is approved, waiting to be sent on in a batch. A request that stopped or that Finance gave back is here with the
 * reason, never a figure of the budget, what is left or a code of the check (`INF-06`). Each also says since when it waits, how many
 * working days that is, whether the days the head may take have passed and how many reminders there were (`FR-3.21`). Only the head of the department
 * reads it, and the spending approver has no step of any of these until the head sends it on (`US-06-14` AC-2).
 */
@Injectable()
export class SpendQueueService {
  constructor(
    private readonly head: SpendHeadService,
    private readonly found: SpendRequestRepo,
    private readonly checks: BudgetCheckRepo,
    private readonly reviews: FinanceReviewRepo,
    private readonly catalog: CatalogService,
    private readonly support: SpendReadSupport,
    private readonly age: SlaQueueAgeService,
  ) {}

  /** Throws SpendNotHeadError. */
  async page(actor: AuthenticatedPrincipal, query: { page: number; pageSize: number }): Promise<Page<QueueItemWire>> {
    const departmentId = await this.head.departmentOf(actor);
    const { rows, total } = await this.found.queuePage(departmentId, (query.page - 1) * query.pageSize, query.pageSize);
    const ids = rows.map((row) => row.id);
    const planIds = [...new Set(rows.map((row) => row.planId).filter((id): id is string => id !== null))];
    const [checks, reviews, plans, people, units, ages] = await Promise.all([
      this.checks.latestOf(ids),
      this.reviews.latestOf(ids),
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.support.people(
        rows.flatMap((row) => [
          row.requesterEmployeeId,
          row.type === 'GROUP_GRANT' ? null : (row.beneficiaries[0]?.employeeId ?? null),
        ]),
      ),
      this.support.units(rows.map((row) => row.amountCurrency)),
      this.age.ageOf(rows.map((row) => ({ requestId: row.id, queuedAt: row.spendQueuedAt }))),
    ]);
    const items = rows.map((row): QueueItemWire => {
      const status = queuedStatus(checks.get(row.id) ?? null, reviews.get(row.id) ?? null);
      const plan = plans.find((candidate) => candidate.planId === row.planId);
      const requester = people.get(row.requesterEmployeeId);
      // A request for a group has no one person it is for: its people are read as lines.
      const beneficiary =
        row.type === 'GROUP_GRANT' ? null : (people.get(row.beneficiaries[0]?.employeeId ?? '') ?? undefined);
      if (!requester || beneficiary === undefined) throw new Error(`The request ${row.id} points at a missing person.`);
      const priced = row.pricingStatus === 'PRICED' && row.amountMinor !== null && row.amountCurrency !== null;

      return {
        requestId: row.id,
        plan: plan ? { planId: plan.planId, planName: plan.planName, applicationName: plan.applicationName } : null,
        softwareName: row.proposal?.softwareName ?? null,
        requester,
        beneficiary,
        lineCount: row._count.beneficiaries,
        amount:
          row.amountMinor !== null && row.amountCurrency !== null
            ? { amount: formatMinor(row.amountMinor, units.get(row.amountCurrency) ?? 2), currency: row.amountCurrency }
            : null,
        expectedSpendOn: row.expectedSpendOn ? fromDateColumn(row.expectedSpendOn) : null,
        budgetYear: row.budgetYear,
        stage: status.stage as QueueItemWire['stage'],
        blockedReason: status.blockedReason,
        financeReturnReason: status.financeReturnReason,
        offPlan: row.offPlan,
        planLineAttached: row.planLineVersionId !== null,
        readyToSubmit: priced && (row.planLineVersionId !== null || row.offPlan),
        updatedAt: row.updatedAt.toISOString(),
        queuedAt: row.spendQueuedAt?.toISOString() ?? null,
        waitedWorkingDays: ages.get(row.id)?.waitedWorkingDays ?? 0,
        overdue: ages.get(row.id)?.overdue ?? false,
        reminders: ages.get(row.id)?.reminders ?? 0,
      };
    });

    return pageOf(items, total, query.page, query.pageSize);
  }
}
