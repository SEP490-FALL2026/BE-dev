import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { BudgetChangeListener, BudgetVersionEvent, PlanLineMovedEvent } from '../../budgets/budgets.types';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { BudgetCheckRepo } from './budget-check.repo';
import { FinanceReviewService } from './finance-review.service';
import { SpendRequestRepo } from './spend-request.repo';
import { SpendRoutingService } from './spend-routing.service';

/**
 * What the requests that wait on a budget do when it changes (`US-06-13`, `US-06-09` AC-17), in the transaction of the
 * change. Finance moving a plan line ends the review that waited on it and checks the request again; a version of a budget
 * that is approved checks again the requests that waited for one; a version that is refused or sent back opens a review for
 * Finance on each of them, since the year still has no budget. Each request is locked and judged on what it is now.
 */
@Injectable()
export class SpendBudgetListener implements BudgetChangeListener {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly found: SpendRequestRepo,
    private readonly checks: BudgetCheckRepo,
    private readonly reviews: FinanceReviewService,
    private readonly routing: SpendRoutingService,
  ) {}

  async planLineMoved(tx: DbTx, actor: AuthenticatedPrincipal, event: PlanLineMovedEvent): Promise<void> {
    for (const id of await this.found.awaitingReviewOnLine(tx, event.versionIds, event.position)) {
      const request = await this.requests.lockById(tx, id);
      if (request) await this.reviews.endBecauseLineMoved(tx, actor, request, event.reason);
    }
  }

  async versionApproved(tx: DbTx, actor: AuthenticatedPrincipal, event: BudgetVersionEvent): Promise<void> {
    for (const request of await this.waitingForYear(tx, event)) {
      const outcome = await this.routing.route(tx, actor, request, 'BUDGET_VERSION_APPROVED', new Date());
      if (outcome.status === 'NOT_CHECKABLE') await this.routing.backToSubmission(tx, request);
    }
  }

  async versionRefused(tx: DbTx, actor: AuthenticatedPrincipal, event: BudgetVersionEvent): Promise<void> {
    for (const request of await this.waitingForYear(tx, event)) {
      await this.routing.reopenReview(tx, actor, request, new Date());
    }
  }

  /** The requests of the Cost Center that wait for a budget and whose check found this year without one. */
  private async waitingForYear(tx: DbTx, event: BudgetVersionEvent) {
    const ids = await this.found.awaitingBudget(tx, event.costCenterId);
    const latest = await this.checks.latestOf(ids, tx);
    const waiting = [];
    for (const id of ids) {
      const without = latest
        .get(id)
        ?.years.some((year) => year.year === event.year && year.code === 'NO_ACTIVE_BUDGET');
      const request = without ? await this.requests.lockById(tx, id) : null;
      if (request?.state === 'AWAITING_BUDGET') waiting.push(request);
    }

    return waiting;
  }
}
