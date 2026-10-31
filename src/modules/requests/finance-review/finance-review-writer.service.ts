import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { BudgetCheckRepo, type CheckRecord } from '../spend/budget-check.repo';
import { FinanceReviewRepo } from '../spend/finance-review.repo';
import { SpendBatchRepo } from '../spend/spend-batch.repo';
import { SpendRoutingService } from '../spend/spend-routing.service';
import { SpendStepRepo, type SpendStepRecord } from '../spend/spend-step.repo';
import type { ReviewBody } from './finance-review.dto';
import { reviewCompletedDetail, reviewOutcomeCode } from './finance-review.policy';

/**
 * Writes how a Finance review ended (`US-06-13`): the record of it, the end of its step, the move of the request where the outcome says,
 * and the audit event, in the transaction of the ending; and the ending of a review because the plan line it waited on was moved.
 */
@Injectable()
export class FinanceReviewWriter {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly steps: SpendStepRepo,
    private readonly checks: BudgetCheckRepo,
    private readonly reviews: FinanceReviewRepo,
    private readonly batches: SpendBatchRepo,
    private readonly routing: SpendRoutingService,
    private readonly audit: AuditApi,
  ) {}

  /** Writes how the review ended, ends its step, and moves the request where the outcome says. */
  async finish(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    step: SpendStepRecord,
    ended: { check: CheckRecord; body: ReviewBody; waiting: boolean; now: Date },
  ): Promise<void> {
    const { check, body, now } = ended;
    await this.reviews.insert(tx, {
      stepId: step.id,
      requestId: request.id,
      checkId: check.id,
      outcome: reviewOutcomeCode(body.outcome),
      opinion: body.opinion ?? null,
      direction: body.direction ?? null,
      reason: body.reason ?? null,
      decidedByEmployeeId: actor.employeeId,
      decidedAt: now,
    });
    await this.steps.end(tx, step, 'COMPLETED', actor.employeeId, now);

    if (body.outcome === 'ASSESSED') {
      if (ended.waiting) {
        // The request waited for a version: it is checked again as a check of its own, and is not sent to Finance a second time (J.3).
        await this.routing.routeAfterOpinionWhileWaiting(tx, actor, request, now);
      } else {
        // Only now does the spending approver have a step to decide (`US-06-13` AC-1, AC-2, AC-12).
        await this.routing.openSpendAfterReview(tx, actor, request, now);
      }
    } else {
      await this.requests.setState(
        tx,
        request.id,
        body.outcome === 'NEEDS_BUDGET' ? 'AWAITING_BUDGET' : 'AWAITING_SPEND_SUBMISSION',
      );
      // A request given back to its head is out of the batch it was sent in (`US-06-14` AC-13).
      if (body.outcome === 'RETURN_TO_HEAD') await this.batches.markLeft(tx, request.id, 'RETURNED_BY_FINANCE', now);
    }
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.FINANCE_REVIEW_COMPLETED',
        'ACCESS_REQUEST_STEP',
        step.id,
        reviewCompletedDetail(request, check, body, ended.waiting),
      ),
    );
  }

  /**
   * Ends the review because the plan line it waited on was moved by Finance, and checks the request again as a check of its
   * own (`US-06-13` AC-4). The caller is the transaction of the move.
   */
  async endBecauseLineMoved(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    reason: string,
  ): Promise<void> {
    const step = await this.steps.findOpen(request.id, 'FINANCE_REVIEW', tx);
    const check = await this.checks.latest(request.id, tx);
    if (!step || !check?.planLineOverdue) return;

    const now = new Date();
    await this.reviews.insert(tx, {
      stepId: step.id,
      requestId: request.id,
      checkId: check.id,
      outcome: 'LINE_UPDATED',
      opinion: null,
      direction: null,
      reason,
      decidedByEmployeeId: actor.employeeId,
      decidedAt: now,
    });
    await this.steps.end(tx, step, 'COMPLETED', actor.employeeId, now);
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.FINANCE_REVIEW_COMPLETED',
        'ACCESS_REQUEST_STEP',
        step.id,
        { requestId: request.id, checkId: check.id, outcome: 'LINE_UPDATED' },
      ),
    );
    // A request that cannot be checked now goes back to its head, where the check runs when they send it again.
    const routed = await this.routing.route(tx, actor, request, 'PLAN_LINE_MOVED', now);
    if (routed.status === 'NOT_CHECKABLE') await this.routing.backToSubmission(tx, request);
  }
}
