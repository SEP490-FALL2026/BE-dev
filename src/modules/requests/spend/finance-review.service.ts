import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { chargedCostCenterId } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { BudgetCheckRepo, type CheckRecord } from './budget-check.repo';
import { BUDGET_LACKING_CODES, checkReviewOutcome, checkReviewer, checkWaitingOutcome } from './finance-review.policy';
import { FinanceReviewRepo } from './finance-review.repo';
import { SpendBatchRepo } from './spend-batch.repo';
import { SpendNotFinanceError, SpendReviewNotOpenError, SpendReviewRefusedError } from './spend.errors';
import { SpendRoutingService } from './spend-routing.service';
import { SpendStepRepo, type SpendStepRecord } from './spend-step.repo';
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
 *
 * A request that waits for a version of the budget has no review open, and Finance may still move it (J.3, F65): it gives it back to
 * its head, or gives its opinion, in one go: a review step is opened and completed in the same transaction, so that the record of how it
 * ended has a step of its own, and an opinion makes the check again as a check of its own. It never asks for a budget twice. Finance
 * does not review a request it asked for or is given, nor one whose spend step it will decide (`SoD-8`); that is judged here, in the
 * service, and not by the guard of the route.
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

  /**
   * Throws SpendNotFinanceError, AccessRequestNotFoundError, SpendReviewNotOpenError and SpendReviewRefusedError (the request is
   * Finance's own, the spend step is Finance's to decide, the request already waits for a budget, or the outcome does not fit the check).
   */
  async complete(actor: AuthenticatedPrincipal, requestId: string, body: ReviewBody): Promise<ReviewDetailWire> {
    if (!actor.roles.includes('FINANCE')) throw new SpendNotFinanceError();

    await this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request) throw new AccessRequestNotFoundError();
      const open = await this.steps.findOpen(requestId, 'FINANCE_REVIEW', tx);
      // Nothing is open and the request waits for a version: the review is opened and ended in this very call (J.3).
      if (!open && !(await this.waitsForVersion(tx, request))) throw new SpendReviewNotOpenError();
      // A review nobody held is taken by Finance now; one held is Finance's own (there is one Finance account).
      if (open && open.assigneeEmployeeId !== null && open.assigneeEmployeeId !== actor.employeeId) {
        throw new SpendNotFinanceError();
      }
      const independence = checkReviewer({
        actorEmployeeId: actor.employeeId,
        requesterEmployeeId: request.requesterEmployeeId,
        beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
        spendDeciderEmployeeId: await this.routing.spendDeciderOf(tx, request),
      });
      if (independence) throw new SpendReviewRefusedError(independence);
      const check = await this.checks.latest(requestId, tx);
      if (!check) throw new Error(`The review of the request ${requestId} has no check.`);

      const today = await this.organization.businessToday(new Date(), tx);
      const heads = await this.organization.getDepartmentHeads([request.departmentId], today);
      const refusal = open
        ? checkReviewOutcome(body.outcome, { check, departmentHasHead: heads.has(request.departmentId) })
        : checkWaitingOutcome(body.outcome, check);
      if (refusal) throw new SpendReviewRefusedError(refusal);

      const now = new Date();
      const step =
        open ??
        (await this.steps.open(tx, {
          requestId,
          kind: 'FINANCE_REVIEW',
          assigneeEmployeeId: actor.employeeId,
          waitingReason: null,
          slaWorkingDays: request.policy.slaWorkingDays,
          now,
        }));
      await this.finish(tx, actor, request, step, check, body, { waiting: open === null, now });
    });

    return this.views.review(actor, requestId);
  }

  /** Whether the request waits for a version of the budget with nothing open: no step of any kind is held or waiting. */
  private async waitsForVersion(tx: DbTx, request: AccessRequestRecord): Promise<boolean> {
    return request.state === 'AWAITING_BUDGET' && !(await this.steps.hasOpenStep(request.id, tx));
  }

  /** Writes how the review ended, ends its step, and moves the request where the outcome says. */
  private async finish(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    step: SpendStepRecord,
    check: CheckRecord,
    body: ReviewBody,
    context: { waiting: boolean; now: Date },
  ): Promise<void> {
    const { now } = context;
    await this.reviews.insert(tx, {
      stepId: step.id,
      requestId: request.id,
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
      if (context.waiting) {
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
        {
          requestId: request.id,
          checkId: check.id,
          outcome: OUTCOME[body.outcome],
          ...(body.direction ? { direction: body.direction } : {}),
          // The head is told why the request came back, in Finance's own words; the notice carries nothing else of the review.
          ...(body.outcome === 'RETURN_TO_HEAD' && body.reason ? { reason: body.reason } : {}),
          // The budget asked for: the Cost Center and the first year that lacks one (what the notice to the head names, never a figure).
          ...(body.outcome === 'NEEDS_BUDGET' ? this.budgetAskedFor(request, check) : {}),
          ...(context.waiting ? { whileWaiting: true } : {}),
        },
      ),
    );
  }

  /** The Cost Center and the first year of the check that has no budget or too little: where the budget is asked for. */
  private budgetAskedFor(
    request: AccessRequestRecord,
    check: CheckRecord,
  ): { costCenterId: string } | { costCenterId: string; year: number } {
    const years = check.years
      .filter((year) => year.code !== null && BUDGET_LACKING_CODES.has(year.code))
      .map((year) => year.year)
      .sort((a, b) => a - b);

    return years.length === 0
      ? { costCenterId: chargedCostCenterId(request) }
      : { costCenterId: chargedCostCenterId(request), year: years[0] };
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
