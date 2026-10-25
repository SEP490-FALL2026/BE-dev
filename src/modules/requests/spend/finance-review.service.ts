import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { BudgetCheckRepo } from './budget-check.repo';
import { checkReviewOutcome } from './finance-review.policy';
import { FinanceReviewRepo } from './finance-review.repo';
import { SpendBatchRepo } from './spend-batch.repo';
import { SpendNotFinanceError, SpendReviewNotOpenError, SpendReviewRefusedError } from './spend.errors';
import { SpendRoutingService } from './spend-routing.service';
import { SpendStepRepo } from './spend-step.repo';
import { SpendViewService } from './spend-view.service';
import type { ReviewBody, ReviewDetailWire } from './spend.dto';

const OUTCOME = {
  ASSESSED: 'ASSESSED',
  RETURN_TO_HEAD: 'RETURNED_TO_HEAD',
  NEEDS_BUDGET: 'BUDGET_REVISION_NEEDED',
} as const;

/**
 * Finance ends the review of a request (`US-06-13`). The review is advice: it ends in an opinion for the spending approver, in
 * the request given back to the head, or in a budget asked for, and in none of them is the request approved or refused
 * (`SoD-3`). The spend step is made only once the review has an opinion, and with the opinion in front of the approver
 * (`QĐ-82m` `INF-12`). The request is locked while the review ends, so two endings queue and the second finds none open; the
 * step, the record of how it ended, the request and the audit event are written together.
 */
@Injectable()
export class FinanceReviewService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly steps: SpendStepRepo,
    private readonly checks: BudgetCheckRepo,
    private readonly reviews: FinanceReviewRepo,
    private readonly batches: SpendBatchRepo,
    private readonly routing: SpendRoutingService,
    private readonly organization: OrganizationService,
    private readonly views: SpendViewService,
    private readonly audit: AuditService,
  ) {}

  /** Throws SpendNotFinanceError, AccessRequestNotFoundError, SpendReviewNotOpenError and SpendReviewRefusedError. */
  async complete(actor: AuthenticatedPrincipal, requestId: string, body: ReviewBody): Promise<ReviewDetailWire> {
    if (!actor.roles.includes('FINANCE')) throw new SpendNotFinanceError();

    await this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request) throw new AccessRequestNotFoundError();
      const step = await this.steps.findOpen(requestId, 'FINANCE_REVIEW', tx);
      if (!step) throw new SpendReviewNotOpenError();
      // A review nobody held is taken by Finance now; one held is Finance's own (there is one Finance account).
      if (step.assigneeEmployeeId !== null && step.assigneeEmployeeId !== actor.employeeId) {
        throw new SpendNotFinanceError();
      }
      const check = await this.checks.latest(requestId, tx);
      if (!check) throw new Error(`The review ${step.id} of the request ${requestId} has no check.`);

      const today = await this.organization.businessToday(new Date(), tx);
      const heads = await this.organization.getDepartmentHeads([request.departmentId], today);
      const refusal = checkReviewOutcome(body.outcome, { check, departmentHasHead: heads.has(request.departmentId) });
      if (refusal) throw new SpendReviewRefusedError(refusal);

      const now = new Date();
      await this.reviews.insert(tx, {
        stepId: step.id,
        requestId,
        checkId: check.id,
        outcome: OUTCOME[body.outcome],
        opinion: body.opinion ?? null,
        direction: body.direction ?? null,
        reason: body.reason ?? null,
        decidedByEmployeeId: actor.employeeId,
        decidedAt: now,
      });
      await this.steps.end(tx, step, 'COMPLETED', actor.employeeId, now);

      if (body.outcome === 'ASSESSED') {
        // Only now does the spending approver have a step to decide (`US-06-13` AC-1, AC-2, AC-12).
        await this.routing.openSpendAfterReview(tx, actor, request, now);
      } else {
        await this.requests.setState(
          tx,
          requestId,
          body.outcome === 'NEEDS_BUDGET' ? 'AWAITING_BUDGET' : 'AWAITING_SPEND_SUBMISSION',
        );
        // A request given back to its head is out of the batch it was sent in (`US-06-14` AC-13).
        if (body.outcome === 'RETURN_TO_HEAD') await this.batches.markLeft(tx, requestId, 'RETURNED_BY_FINANCE', now);
      }
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.FINANCE_REVIEW_COMPLETED',
          'ACCESS_REQUEST_STEP',
          step.id,
          {
            requestId,
            checkId: check.id,
            outcome: OUTCOME[body.outcome],
            ...(body.direction ? { direction: body.direction } : {}),
          },
        ),
      );
    });

    return this.views.review(actor, requestId);
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
        {
          requestId: request.id,
          checkId: check.id,
          outcome: 'LINE_UPDATED',
        },
      ),
    );
    // A request that cannot be checked now goes back to its head, where the check runs when they send it again.
    const routed = await this.routing.route(tx, actor, request, 'PLAN_LINE_MOVED', now);
    if (routed.status === 'NOT_CHECKABLE') await this.routing.backToSubmission(tx, request);
  }
}
