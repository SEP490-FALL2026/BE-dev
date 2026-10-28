import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { BudgetsService } from '../../budgets/budgets.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import { chargedCostCenterId } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { BudgetCheckRepo, type CheckRecord } from './budget-check.repo';
import { BudgetInformationService } from './budget-information.service';
import { FinanceReviewRepo } from './finance-review.repo';
import type { BlockedReason } from './spend-decision.policy';
import { SpendDecisionRefusedError } from './spend.errors';
import { SpendStepRepo, type SpendStepRecord } from './spend-step.repo';

/**
 * What a spend decision does to the budget and to the step, for the decision on one person's request and for the decision on the
 * lines of a group: the request holds the cost of each year that binds, as the snapshot it was approved on says (`US-06-04`); a
 * request that is not for the approver yet closes the step with no decision and goes back (`US-06-01` AC-18); and whether Finance
 * has looked at what is out of the ordinary (`AC-17`). One place, so the two decisions cannot drift apart.
 */
@Injectable()
export class SpendEffectsService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly steps: SpendStepRepo,
    private readonly checkRepo: BudgetCheckRepo,
    private readonly reviews: FinanceReviewRepo,
    private readonly budgets: BudgetsService,
    private readonly information: BudgetInformationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The person who completed a review of Finance of this request does not decide its spend step (`SoD-8`, F32). Throws
   * SpendDecisionRefusedError; one place, so the decision on one person's request and the decision on the lines of a group agree.
   */
  async refuseReviewer(tx: DbTx, request: AccessRequestRecord, employeeId: string): Promise<void> {
    if (await this.reviews.completedBy(tx, request.id, employeeId)) {
      throw new SpendDecisionRefusedError('REVIEWER_IS_APPROVER');
    }
  }

  /** Whether Finance has looked at what is out of the ordinary in this request, or there is nobody independent to (`AC-17`). */
  async reviewed(tx: DbTx, request: AccessRequestRecord, step: SpendStepRecord): Promise<boolean> {
    if (step.noIndependentReview) return true;
    const review = await this.reviews.latest(request.id, tx);

    return review?.outcome === 'ASSESSED' && review.decidedAt <= step.createdAt;
  }

  /**
   * The request holds the cost of each year that binds, as the snapshot it was approved on says: one commitment for each year,
   * attached to the budget of the year or waiting for one, none for a year that is only a forecast (`QĐ-84a`). Returns the check.
   */
  async hold(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    checkId: string | null,
    now: Date,
  ): Promise<CheckRecord> {
    const check = checkId ? await this.checkRepo.findById(checkId, tx) : null;
    if (!check) throw new Error(`The approval of the request ${request.id} has no snapshot to hold a commitment on.`);

    await this.budgets.holdForRequest(tx, actor, {
      organizationId: request.organizationId,
      requestId: request.id,
      costCenterId: chargedCostCenterId(request),
      snapshotCheckId: check.id,
      currency: check.currency,
      now,
      items: check.years
        .filter((year) => year.code !== null)
        .map((year) => ({ year: year.year, amountMinor: year.costMinor })),
    });

    return check;
  }

  /** Closes the step with no decision, because the request is not for the approver yet, and says why in the Audit Trail. */
  async sendBack(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    step: SpendStepRecord,
    now: Date,
    reason: BlockedReason | 'NEEDS_FINANCE_REVIEW',
  ): Promise<void> {
    await this.steps.end(tx, step, 'CLOSED', null, now);
    await this.information.closeOpen(tx, actor, request, 'STEP_CLOSED', now);
    if (reason !== 'NEEDS_FINANCE_REVIEW') await this.requests.setState(tx, request.id, 'AWAITING_SPEND_SUBMISSION');
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.SPEND_STEP_CLOSED',
        'ACCESS_REQUEST_STEP',
        step.id,
        { requestId: request.id, reason },
      ),
    );
  }
}
