import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { chargedCostCenterId } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { BudgetCheckRepo, type CheckRecord } from '../spend/budget-check.repo';
import type { ReturnReason } from '../spend/spend-decision.policy';
import { SpendStepRepo, type SpendStepRecord } from '../spend/spend-step.repo';

/**
 * What a spend decision does to the budget and to the step, for the decision on one person's request and for the decision on the lines of
 * a group: the request holds the cost of its one year, as the snapshot it was approved on says (`US-06-04`, `BR-MF1-07d`); a request that is
 * not for the approver now closes the step with no decision and goes back to its head (`US-06-01` AC-18, `BR-MF1-07c`). One place, so the two
 * decisions cannot drift apart.
 */
@Injectable()
export class SpendEffectsService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly steps: SpendStepRepo,
    private readonly checkRepo: BudgetCheckRepo,
    private readonly budgets: BudgetsApi,
    private readonly audit: AuditApi,
  ) {}

  /**
   * The request holds the cost of the one year it was checked for: one commitment, attached to the approved budget of that year in the Cost
   * Center the check read (`FR-5.8`(1), `INV-16`). A cost of nothing (a request to go on using whose new period begins next year, `QĐ-109b`)
   * holds nothing, and the audit says so; the part of next year is the commitment made on 01/01. Returns the check.
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
    const [year] = check.years.filter((candidate) => candidate.code !== null);
    if (check.years.length !== 1 || !year) {
      throw new Error(`The snapshot ${check.id} of the request ${request.id} does not have exactly one year.`);
    }
    if (year.costMinor === 0n) {
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.NO_CURRENT_YEAR_COMMITMENT',
          'ACCESS_REQUEST',
          request.id,
          { requestId: request.id, checkId: check.id, year: year.year },
        ),
      );

      return check;
    }

    await this.budgets.holdForRequest(tx, actor, {
      organizationId: request.organizationId,
      requestId: request.id,
      costCenterId: check.costCenterId ?? chargedCostCenterId(request),
      snapshotCheckId: check.id,
      currency: check.currency,
      now,
      items: [{ year: year.year, amountMinor: year.costMinor }],
    });

    return check;
  }

  /**
   * Closes the step with no decision, because the request is not for the approver now, puts the request back in the queue of its head and says
   * why in the Audit Trail: `ACCESS_REQUEST.SPEND_RETURNED_AT_DECISION` is what tells the requester and the head (`BR-MF1-07c`).
   */
  async sendBack(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    step: SpendStepRecord,
    by: { now: Date; reasons: readonly ReturnReason[]; check: CheckRecord | null },
  ): Promise<void> {
    await this.steps.end(tx, step, 'CLOSED', null, by.now);
    await this.requests.setState(tx, request.id, request.routing?.mode === 'ONE_STEP' ? 'AWAITING_REQUESTER_REVISION' : 'AWAITING_SPEND_SUBMISSION');
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.SPEND_STEP_CLOSED',
        'ACCESS_REQUEST_STEP',
        step.id,
        { requestId: request.id, reason: by.reasons.join(',') },
      ),
    );
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.SPEND_RETURNED_AT_DECISION',
        'ACCESS_REQUEST',
        request.id,
        {
          requestId: request.id,
          stepId: step.id,
          checkId: by.check?.id ?? null,
          blockReasons: by.reasons.join(','),
          overBy: by.check?.overByMinor?.toString() ?? null,
        },
      ),
    );
  }
}
