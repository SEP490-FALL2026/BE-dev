import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestGroupUsesLinesError, AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { SpendEffectsService } from '../budget-information/spend-effects.service';
import { BudgetCheckService, type CheckOutcome } from '../spend/budget-check.service';
import { checkSpendDecider, judgeApproval } from '../spend/spend-decision.policy';
import { SpendDecisionRefusedError } from '../spend/spend.errors';
import { SpendRoutingService } from '../spend/spend-routing.service';
import { SpendStepRepo, type SpendStepRecord } from '../spend/spend-step.repo';
import { SpendDecisionRecorder, type SpendDecisionResult } from './spend-decision-recorder.service';

export interface SpendDecisionInput {
  decision: 'APPROVE' | 'REJECT';
  /** The reason of a refusal. */
  reason?: string;
  /** The exception an approval accepts: why, and the years it names. */
  override?: { reason: string; years: readonly number[] };
}

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
    private readonly routing: SpendRoutingService,
    private readonly recorder: SpendDecisionRecorder,
  ) {}

  /** Throws AccessRequestNotFoundError and SpendDecisionRefusedError. */
  async decide(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: SpendDecisionInput,
  ): Promise<SpendDecisionResult> {
    return this.runner.run(async (tx) => {
      const { request, step } = await this.lockDecidable(tx, actor, requestId);
      const now = new Date();
      const outcome = await this.checks.run(tx, request, 'SPEND_DECISION', actor, now);
      const of = { request, step, now };
      if (input.decision === 'REJECT') {
        return this.recorder.record(tx, actor, of, {
          decision: 'REJECTED',
          checkId: outcome.status === 'CHECKED' ? outcome.check.id : null,
          reason: input.reason ?? null,
          override: null,
        });
      }

      return this.approve(tx, actor, of, { input, outcome });
    });
  }

  /**
   * The request locked, with the spend step the person holds; the person who reviewed it for Finance does not decide it (`SoD-8`).
   * Who may decide, and in which state, is judged on a plain read first, so a person who may not decide never takes the row lock of
   * the request (`R-D2`); the judgement is made again under the lock, since the step may have moved meanwhile.
   */
  private async lockDecidable(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    requestId: string,
  ): Promise<{ request: AccessRequestRecord; step: SpendStepRecord }> {
    await this.judge(tx, actor, await this.requests.findById(requestId, tx));
    const request = await this.requests.lockById(tx, requestId);
    const step = await this.judge(tx, actor, request);
    if (!request) throw new AccessRequestNotFoundError();
    await this.effects.refuseReviewer(tx, request, actor.employeeId);

    return { request, step };
  }

  /** Throws AccessRequestNotFoundError, AccessRequestGroupUsesLinesError and SpendDecisionRefusedError; returns the open spend step. */
  private async judge(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord | null,
  ): Promise<SpendStepRecord> {
    if (!request) throw new AccessRequestNotFoundError();
    // The people of a request for a group are decided one by one, in the route of its lines (`US-05-17`).
    if (request.type === 'GROUP_GRANT') throw new AccessRequestGroupUsesLinesError();
    const step = await this.steps.findOpen(request.id, 'SPEND_APPROVAL', tx);
    if (!step) throw new SpendDecisionRefusedError('NO_SPEND_STEP');
    const refusal = checkSpendDecider({
      actorEmployeeId: actor.employeeId,
      requesterEmployeeId: request.requesterEmployeeId,
      beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
      assigneeEmployeeId: step.assigneeEmployeeId,
      stepState: step.state,
    });
    if (refusal) throw new SpendDecisionRefusedError(refusal);

    return step;
  }

  /** An approval is made on what the check says: it is recorded, goes back to the head or to Finance, or is refused for its override. */
  private async approve(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    of: { request: AccessRequestRecord; step: SpendStepRecord; now: Date },
    decided: { input: SpendDecisionInput; outcome: CheckOutcome },
  ): Promise<SpendDecisionResult> {
    const { request, step, now } = of;
    const { input, outcome } = decided;
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
        return this.recorder.record(tx, actor, of, {
          decision: 'APPROVED',
          checkId: outcome.check.id,
          reason: null,
          override: input.override ? { reason: input.override.reason, years: verdict.overriddenYears } : null,
        });
    }
  }
}
