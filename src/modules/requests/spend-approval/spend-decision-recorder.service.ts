import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { SpendEffectsService } from '../budget-information/spend-effects.service';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import { RenewalApplyService } from '../renewal-apply/renewal-apply.service';
import { SpendDecisionRepo } from '../spend/spend-decision.repo';
import { spendDecisionRecordOf, type BlockedReason } from '../spend/spend-decision.policy';
import type { SpendStepRecord } from '../spend/spend-step.repo';

export type SpendDecisionResult =
  | { status: 'DECIDED'; decision: 'APPROVED' | 'REJECTED'; requestState: string }
  /** The request was checked again as the approver decided and it is not for them yet: nothing was decided (`US-06-01` AC-18). */
  | { status: 'BOUNCED'; to: 'FINANCE_REVIEW' }
  | { status: 'BOUNCED'; to: 'HEAD'; reason: BlockedReason };

/** What a decision of the spend step is written with (`US-06-01` AC-2, AC-5): the record, the hold of an approval, the audit and what follows. */
export interface SpendDecided {
  decision: 'APPROVED' | 'REJECTED';
  checkId: string | null;
  reason: string | null;
  override: { reason: string; years: readonly number[] } | null;
}

/**
 * Writes the decision of the spending approver in the transaction of the decision (`US-06-01`): the electronic approval record with the
 * snapshot, the money held for an approval, the audit event, the end of the request for the person it was for when it is refused, and
 * a renewal approved in full applied at once, as nobody is left to carry it out.
 */
@Injectable()
export class SpendDecisionRecorder {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly decisions: SpendDecisionRepo,
    private readonly effects: SpendEffectsService,
    private readonly identity: IdentityAccessApi,
    private readonly audit: AuditApi,
    private readonly renewals: RenewalApplyService,
    private readonly outcomes: RequestOutcomeService,
  ) {}

  async record(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    of: { request: AccessRequestRecord; step: SpendStepRecord; now: Date },
    decided: SpendDecided,
  ): Promise<SpendDecisionResult> {
    const { request, step, now } = of;
    const holders = await this.identity.getApprovalRoleHolders(tx);
    const recorded = spendDecisionRecordOf(holders, actor.employeeId, { request, step }, decided);
    await this.decisions.record(tx, {
      organizationId: request.organizationId,
      requestId: request.id,
      stepId: step.id,
      departmentId: request.departmentId,
      decision: decided.decision,
      deciderRole: recorded.deciderRole,
      reason: decided.reason,
      checkId: decided.checkId,
      overrideReason: decided.override?.reason ?? null,
      overrideYears: decided.override?.years ?? [],
      decidedByEmployeeId: actor.employeeId,
      decidedAt: now,
      requestState: recorded.requestState,
    });
    if (decided.decision === 'APPROVED') await this.effects.hold(tx, actor, request, decided.checkId, now);
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        recorded.action,
        'ACCESS_REQUEST_STEP',
        step.id,
        recorded.detail,
      ),
    );

    // A refusal ends the request for the person it was for, without a grant.
    if (decided.decision === 'REJECTED') await this.outcomes.ended(tx, request, request.beneficiaryEmployeeIds, now);

    // A renewal needs nobody to carry it out: approved in full, it is applied here, in the transaction of the decision.
    if (decided.decision === 'APPROVED' && request.type === 'RENEWAL') {
      await this.renewals.apply(tx, actor, request, now);

      return { status: 'DECIDED', decision: decided.decision, requestState: await this.stateOf(tx, request.id) };
    }

    return { status: 'DECIDED', decision: decided.decision, requestState: recorded.requestState };
  }

  private async stateOf(tx: DbTx, requestId: string): Promise<string> {
    const found = await this.requests.findById(requestId, tx);
    if (!found) throw new Error(`The request ${requestId} was not found after it was decided.`);

    return found.state;
  }
}
