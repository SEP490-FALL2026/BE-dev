import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestGroupUsesLinesError, AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import { RenewalApplyService } from '../renewal-request/renewal-apply.service';
import { BudgetCheckService } from '../spend/budget-check.service';
import { SpendDecisionRepo } from '../spend/spend-decision.repo';
import { checkSpendDecider, judgeApproval, type BlockedReason } from '../spend/spend-decision.policy';
import { SpendDecisionRefusedError } from '../spend/spend.errors';
import { SpendRoutingService } from '../spend/spend-routing.service';
import { SpendEffectsService } from '../spend/spend-effects.service';
import { SpendStepRepo, type SpendStepRecord } from '../spend/spend-step.repo';

export interface SpendDecisionInput {
  decision: 'APPROVE' | 'REJECT';
  /** The reason of a refusal. */
  reason?: string;
  /** The exception an approval accepts: why, and the years it names. */
  override?: { reason: string; years: readonly number[] };
}

export type SpendDecisionResult =
  | { status: 'DECIDED'; decision: 'APPROVED' | 'REJECTED'; requestState: string }
  /** The request was checked again as the approver decided and it is not for them yet: nothing was decided (`US-06-01` AC-18). */
  | { status: 'BOUNCED'; to: 'FINANCE_REVIEW' }
  | { status: 'BOUNCED'; to: 'HEAD'; reason: BlockedReason };

/**
 * The spending approver decides the spend step (`US-06-01`). The request is locked, the check is made again, and the decision
 * is made on what that check says, which is the snapshot the decision keeps (`AC-2`): approving a request that has less money
 * than it costs, or none, needs an override with its reason that names the years (`AC-5`, `AC-16`, `AC-21`); a request that
 * turned out to be an exception since it was sent, or whose data is now at fault, is not decided but goes back, and the step
 * closes without a decision (`AC-18`). Refusing needs its reason (`AC-4`). The system never decides (`SoD-6`). The step, the
 * request, the electronic approval record, the snapshot and the audit event are written together; a refused decision changes
 * nothing, and a request that goes back keeps only that it went back.
 */
@Injectable()
export class SpendDecisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly steps: SpendStepRepo,
    private readonly checks: BudgetCheckService,
    private readonly effects: SpendEffectsService,
    private readonly decisions: SpendDecisionRepo,
    private readonly routing: SpendRoutingService,
    private readonly identity: IdentityAccessApi,
    private readonly audit: AuditApi,
    private readonly renewals: RenewalApplyService,
    private readonly outcomes: RequestOutcomeService,
  ) {}

  /** Throws AccessRequestNotFoundError and SpendDecisionRefusedError. */
  async decide(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: SpendDecisionInput,
  ): Promise<SpendDecisionResult> {
    return this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request) throw new AccessRequestNotFoundError();
      // The people of a request for a group are decided one by one, in the route of its lines (`US-05-17`).
      if (request.type === 'GROUP_GRANT') throw new AccessRequestGroupUsesLinesError();
      const step = await this.steps.findOpen(requestId, 'SPEND_APPROVAL', tx);
      if (!step) throw new SpendDecisionRefusedError('NO_SPEND_STEP');
      const refusal = checkSpendDecider({
        actorEmployeeId: actor.employeeId,
        requesterEmployeeId: request.requesterEmployeeId,
        beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
        assigneeEmployeeId: step.assigneeEmployeeId,
        stepState: step.state,
      });
      if (refusal) throw new SpendDecisionRefusedError(refusal);
      // The person who completed the review of Finance of this request does not decide its spend step (`SoD-8`).
      await this.effects.refuseReviewer(tx, request, actor.employeeId);

      const now = new Date();
      const outcome = await this.checks.run(tx, request, 'SPEND_DECISION', actor, now);
      if (input.decision === 'REJECT') {
        return this.record(tx, actor, request, step, now, {
          decision: 'REJECTED',
          checkId: outcome.status === 'CHECKED' ? outcome.check.id : null,
          reason: input.reason ?? null,
          override: null,
        });
      }
      if (outcome.status === 'NOT_CHECKABLE') throw new SpendDecisionRefusedError('NOT_CHECKABLE');

      const reviewed = await this.effects.reviewed(tx, request, step);
      const verdict = judgeApproval(outcome.check, reviewed, input.override ? { years: input.override.years } : null);
      switch (verdict.kind) {
        case 'BLOCKED':
          await this.effects.sendBack(tx, actor, request, step, now, verdict.reason);

          return { status: 'BOUNCED', to: 'HEAD', reason: verdict.reason };
        case 'NEEDS_REVIEW':
          await this.effects.sendBack(tx, actor, request, step, now, 'NEEDS_FINANCE_REVIEW');
          await this.routing.reopenReview(tx, actor, request, now);

          return { status: 'BOUNCED', to: 'FINANCE_REVIEW' };
        case 'OVERRIDE_REQUIRED':
        case 'OVERRIDE_MISMATCH':
          throw new SpendDecisionRefusedError(verdict.kind, verdict.years);
        case 'OVERRIDE_NOT_NEEDED':
          throw new SpendDecisionRefusedError('OVERRIDE_NOT_NEEDED');
        case 'OK':
          return this.record(tx, actor, request, step, now, {
            decision: 'APPROVED',
            checkId: outcome.check.id,
            reason: null,
            override: input.override ? { reason: input.override.reason, years: verdict.overriddenYears } : null,
          });
      }
    });
  }

  private async record(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    step: SpendStepRecord,
    now: Date,
    decided: {
      decision: 'APPROVED' | 'REJECTED';
      checkId: string | null;
      reason: string | null;
      override: { reason: string; years: readonly number[] } | null;
    },
  ): Promise<SpendDecisionResult> {
    const holders = await this.identity.getApprovalRoleHolders(tx);
    const deciderRole =
      holders.conflictSubstituteEmployeeId === actor.employeeId ? 'CONFLICT_SUBSTITUTE' : 'SPENDING_APPROVER';
    const requestState = decided.decision === 'APPROVED' ? 'AWAITING_EXECUTION' : 'REJECTED';
    await this.decisions.record(tx, {
      organizationId: request.organizationId,
      requestId: request.id,
      stepId: step.id,
      departmentId: request.departmentId,
      decision: decided.decision,
      deciderRole,
      reason: decided.reason,
      checkId: decided.checkId,
      overrideReason: decided.override?.reason ?? null,
      overrideYears: decided.override?.years ?? [],
      decidedByEmployeeId: actor.employeeId,
      decidedAt: now,
      requestState,
    });
    if (decided.decision === 'APPROVED') await this.effects.hold(tx, actor, request, decided.checkId, now);
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        decided.decision === 'APPROVED' ? 'ACCESS_REQUEST.SPEND_APPROVED' : 'ACCESS_REQUEST.SPEND_REJECTED',
        'ACCESS_REQUEST_STEP',
        step.id,
        {
          requestId: request.id,
          checkId: decided.checkId,
          decision: decided.decision,
          deciderRole,
          override: decided.override !== null,
          overrideYears: (decided.override?.years ?? []).join(','),
          samePersonAsSpend: step.samePersonAsSpend,
          noIndependentReview: step.noIndependentReview,
          requestState,
        },
      ),
    );

    // A refusal ends the request for the person it was for, without a grant (F43).
    if (decided.decision === 'REJECTED') await this.outcomes.ended(tx, request, request.beneficiaryEmployeeIds, now);

    // A renewal needs nobody to carry it out: approved in full, it is applied here, in the transaction of the decision.
    if (decided.decision === 'APPROVED' && request.type === 'RENEWAL') {
      await this.renewals.apply(tx, actor, request, now);

      return { status: 'DECIDED', decision: decided.decision, requestState: await this.stateOf(tx, request.id) };
    }

    return { status: 'DECIDED', decision: decided.decision, requestState };
  }

  private async stateOf(tx: DbTx, requestId: string): Promise<string> {
    const found = await this.requests.findById(requestId, tx);
    if (!found) throw new Error(`The request ${requestId} was not found after it was decided.`);

    return found.state;
  }
}
