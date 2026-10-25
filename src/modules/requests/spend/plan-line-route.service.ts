import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetsService } from '../../budgets/budgets.service';
import { CatalogService } from '../../catalog/catalog.service';
import { OrganizationService } from '../../organization/organization.service';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { hasSpendStep } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { PlanLineService } from './plan-line.service';
import { SpendHeadService } from './spend-head.service';
import { SpendReadSupport } from './spend-read.support';
import type { PlanLineBody, PlanLineStateWire, SuggestionWire } from './spend-submission.dto';
import { SpendNotInQueueError } from './spend.errors';

/**
 * The head attaches a request that waits in their queue to a line of the plan, or says it is outside it, and reads the lines
 * they may choose from (`US-05-04` AC-12, AC-15; `US-06-14` AC-5). A head reads the plan lines of their own department only:
 * the software or plan, the amount, the window and whether it has gone by, and nothing of what is left, the checks of the
 * requests, other departments or the company. Only the head of the department of the request does either, and a request
 * that is not theirs is answered as if it did not exist.
 */
@Injectable()
export class PlanLineRouteService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly head: SpendHeadService,
    private readonly planLines: PlanLineService,
    private readonly budgets: BudgetsService,
    private readonly catalog: CatalogService,
    private readonly organization: OrganizationService,
    private readonly support: SpendReadSupport,
  ) {}

  /** Throws SpendNotHeadError, AccessRequestNotFoundError, SpendNotInQueueError and AccessRequestPlanLineRefusedError. */
  async attach(actor: AuthenticatedPrincipal, requestId: string, body: PlanLineBody): Promise<PlanLineStateWire> {
    const departmentId = await this.head.departmentOf(actor);

    return this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request || request.departmentId !== departmentId) throw new AccessRequestNotFoundError();
      if (request.state !== 'AWAITING_SPEND_SUBMISSION' || !hasSpendStep(request.policy)) {
        throw new SpendNotInQueueError(requestId);
      }

      const today = await this.organization.businessToday(new Date(), tx);
      await this.planLines.choose(
        tx,
        actor,
        request,
        body.planLine
          ? { kind: 'LINE', position: body.planLine.position, stillNeeded: body.planLine.stillNeeded ?? false }
          : { kind: 'OFF_PLAN' },
        today,
      );
      const chosen = await this.requests.findById(requestId, tx);
      if (!chosen) throw new Error(`The request ${requestId} was not found after its line was chosen.`);

      return {
        requestId,
        offPlan: chosen.offPlan,
        planLineAttached: chosen.planLine !== null,
        stillNeeded: chosen.planLine?.confirmed ?? false,
      };
    });
  }

  /**
   * The lines of the current plan of the Cost Center of the request, for the year the money goes out in; the ones for the plan
   * the request asks for are marked as suggested. Throws SpendNotHeadError and AccessRequestNotFoundError.
   */
  async suggestions(
    actor: AuthenticatedPrincipal,
    requestId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<SuggestionWire>> {
    const departmentId = await this.head.departmentOf(actor);
    const request = await this.requests.findById(requestId);
    if (!request || request.departmentId !== departmentId || !hasSpendStep(request.policy)) {
      throw new AccessRequestNotFoundError();
    }
    const year = request.pricing.budgetYear;
    const lines =
      year === null
        ? null
        : await this.budgets.currentLines(
            request.costCenterId,
            year,
            (query.page - 1) * query.pageSize,
            query.pageSize,
          );
    if (!lines) return pageOf([], 0, query.page, query.pageSize);

    const today = await this.organization.businessToday(new Date());
    const planIds = [...new Set(lines.items.map((line) => line.planId).filter((id): id is string => id !== null))];
    const [plans, money] = await Promise.all([
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
      this.support.formatter(lines.currency),
    ]);

    return pageOf(
      lines.items.map((line): SuggestionWire => {
        const plan = plans.find((candidate) => candidate.planId === line.planId);

        return {
          position: line.position,
          description: line.description,
          plan: plan ? { planId: plan.planId, planName: plan.planName } : null,
          amount: money(line.amountMinor),
          windowFrom: line.windowFrom,
          windowTo: line.windowTo,
          overdue: line.windowTo < today,
          suggested: this.isSuggested(request, line.planId),
        };
      }),
      lines.total,
      query.page,
      query.pageSize,
    );
  }

  private isSuggested(request: AccessRequestRecord, planId: string | null): boolean {
    return planId !== null && planId === request.planId;
  }
}
