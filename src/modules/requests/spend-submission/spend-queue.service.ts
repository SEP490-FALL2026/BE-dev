import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { formatAmount as formatMinor } from '../../../core/money/money';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { BudgetCheckRepo } from '../spend/budget-check.repo';
import { SpendQueueOutcomeService } from './spend-queue-outcome.service';
import { SlaQueueAgeService } from '../sla/sla-queue-age.service';
import { SpendHeadService } from './spend-head.service';
import { SpendWireViewService } from '../spend/spend-wire-view.service';
import { SpendRequestRepo } from '../spend/spend-request.repo';
import { queuedStatus } from '../spend/spend-status.service';
import type { QueueItemWire } from '../spend/spend-submission.dto';

/**
 * The queue of the head (`US-05-04` AC-11, `US-06-14` AC-1, AC-13): the requests of their department that cost money and whose
 * need is approved, waiting to be sent on in a batch. A request that stopped, or that waits for the head to confirm the reserve, is here
 * with the reason, never a figure of the budget or what is left. Each says what a check made now would give (`budgetOutcome`, RV-11), so
 * the head knows which of them needs a line of reason to be sent on; and since when it waits, how many working days that is, whether
 * the days the head may take have passed and how many reminders there were (`FR-3.21`). Only the head of the department
 * reads it, and the spending approver has no step of any of these until the head sends it on (`US-06-14` AC-2).
 */
@Injectable()
export class SpendQueueService {
  constructor(
    private readonly head: SpendHeadService,
    private readonly found: SpendRequestRepo,
    private readonly checks: BudgetCheckRepo,
    private readonly outcomes: SpendQueueOutcomeService,
    private readonly catalog: CatalogApi,
    private readonly wireView: SpendWireViewService,
    private readonly age: SlaQueueAgeService,
  ) {}

  /** Throws SpendNotHeadError. */
  async page(actor: AuthenticatedPrincipal, query: { page: number; pageSize: number }): Promise<Page<QueueItemWire>> {
    const departmentId = await this.head.departmentOf(actor);
    const { rows, total } = await this.found.queuePage(departmentId, (query.page - 1) * query.pageSize, query.pageSize);
    const ids = rows.map((row) => row.id);
    const planIds = [...new Set(rows.map((row) => row.planId).filter((id): id is string => id !== null))];
    const [checks, plans, people, units, ages, expected] = await Promise.all([
      this.checks.latestOf(ids),
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.wireView.people(
        rows.flatMap((row) => [
          row.requesterEmployeeId,
          row.type === 'GROUP_GRANT' ? null : (row.beneficiaries[0]?.employeeId ?? null),
        ]),
      ),
      this.wireView.units(rows.map((row) => row.amountCurrency)),
      this.age.ageOf(rows.map((row) => ({ requestId: row.id, queuedAt: row.spendQueuedAt }))),
      this.outcomes.expectedFor(rows.filter((row) => row.pricingStatus === 'PRICED').map((row) => row.id)),
    ]);
    const items = rows.map((row): QueueItemWire => {
      const status = queuedStatus(checks.get(row.id) ?? null);
      const now = expected.get(row.id) ?? null;
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
        budgetYear: row.budgetYear,
        stage: status.stage as QueueItemWire['stage'],
        budgetOutcome: now?.outcome ?? null,
        blockedReasons: now?.blockedReasons ?? [],
        overBy:
          now?.overByMinor == null
            ? null
            : { amount: formatMinor(now.overByMinor, units.get(now.currency) ?? 2), currency: now.currency },
        readyToSubmit: priced,
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
