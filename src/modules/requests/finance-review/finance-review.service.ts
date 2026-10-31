import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { BudgetCheckRepo } from '../spend/budget-check.repo';
import { SpendNotFinanceError, SpendReviewNotOpenError, SpendReviewRefusedError } from '../spend/spend.errors';
import { SpendRoutingService } from '../spend/spend-routing.service';
import { SpendStepRepo } from '../spend/spend-step.repo';
import type { ReviewBody, ReviewDetailWire } from './finance-review.dto';
import { checkReviewOutcome, checkReviewer, checkWaitingOutcome } from './finance-review.policy';
import { FinanceReviewWriter } from './finance-review-writer.service';
import { SpendViewService } from './spend-view.service';

/**
 * Finance ends the review of a request (`US-06-13`). The review is advice: it ends in an opinion for the spending approver, in
 * the request given back to the head, or in a budget asked for, and in none of them is the request approved or refused
 * (`SoD-3`). The spend step is made only once the review has an opinion, and with the opinion in front of the approver
 * (`QĐ-82m` `INF-12`). The request is locked while the review ends, so two endings queue and the second finds none open; the
 * step, the record of how it ended, the request and the audit event are written together.
 *
 * A request that waits for a version of the budget has no review open, and Finance may still move it (J.3): it gives it back to
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
    private readonly routing: SpendRoutingService,
    private readonly organization: OrganizationApi,
    private readonly views: SpendViewService,
    private readonly writer: FinanceReviewWriter,
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
      await this.writer.finish(tx, actor, request, step, { check, body, waiting: open === null, now });
    });

    return this.views.review(actor, requestId);
  }

  /** Whether the request waits for a version of the budget with nothing open: no step of any kind is held or waiting. */
  private async waitsForVersion(tx: DbTx, request: AccessRequestRecord): Promise<boolean> {
    return request.state === 'AWAITING_BUDGET' && !(await this.steps.hasOpenStep(request.id, tx));
  }
}
