import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestGroupUsesLinesError, AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { ReserveConfirmationRepo } from '../reserve-confirmation/reserve-confirmation.repo';
import { SpendEffectsService } from '../spend-effects/spend-effects.service';
import { BudgetCheckService, type CheckOutcome } from '../spend/budget-check.service';
import { checkSpendDecider, judgeApproval } from '../spend/spend-decision.policy';
import { SpendDecisionRefusedError } from '../spend/spend.errors';
import { SpendStepRepo, type SpendStepRecord } from '../spend/spend-step.repo';
import { SpendDecisionRecorder, type SpendDecisionResult } from './spend-decision-recorder.service';

export interface SpendDecisionInput {
  decision: 'APPROVE' | 'REJECT';
  /** The reason of a refusal. */
  reason?: string;
}

/**
 * The spending approver decides the spend step (`US-06-01`). The request is locked, the check is made again for the day of the decision
 * (`BR-MF1-07c`), and the decision is made on what that check says, which is the snapshot the decision keeps (`AC-2`): a request that is now
 * blocked, or that uses the reserve with no confirmation of the head on this step, is not decided but goes back to its head, the step closes
 * without a decision, and the requester and the head are told (`AC-18`). There is no override. Refusing needs its reason (`AC-4`). The
 * system never decides (`SoD-6`). The step, the request, the electronic approval record, the snapshot and the audit event are written
 * together; a refused decision changes nothing, and a request that goes back keeps only that it went back.
 */
@Injectable()
export class SpendDecisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly steps: SpendStepRepo,
    private readonly checks: BudgetCheckService,
    private readonly confirmations: ReserveConfirmationRepo,
    private readonly effects: SpendEffectsService,
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
          usesReserve: false,
          reserveReason: null,
        });
      }

      return this.approve(tx, actor, of, outcome);
    });
  }

  /**
   * The request locked, with the spend step the person holds. Who may decide, and in which state, is judged on a plain read first, so a
   * person who may not decide never takes the row lock of the request (`R-D2`); the judgement is made again under the lock, since the step
   * may have moved meanwhile.
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

  /** An approval is made on what the check says: it is recorded, or the request goes back to its head. */
  private async approve(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    of: { request: AccessRequestRecord; step: SpendStepRecord; now: Date },
    outcome: CheckOutcome,
  ): Promise<SpendDecisionResult> {
    const { request, step, now } = of;
    if (outcome.status === 'NOT_CHECKABLE') {
      if (request.routing?.mode !== 'ONE_STEP') throw new SpendDecisionRefusedError('NOT_CHECKABLE');
      await this.effects.sendBack(tx, actor, request, step, { now, reasons: [outcome.reason], check: null });
      return { status: 'BOUNCED', to: 'REQUESTER', reasons: [outcome.reason], overBy: null };
    }

    const confirmation = await this.confirmations.ofStep(step.id, tx);
    const verdict = judgeApproval(outcome.check, request.routing?.mode === 'ONE_STEP' || confirmation !== null);
    if (verdict.kind === 'RETURNED') {
      await this.effects.sendBack(tx, actor, request, step, { now, reasons: verdict.reasons, check: outcome.check });

      return { status: 'BOUNCED', to: request.routing?.mode === 'ONE_STEP' ? 'REQUESTER' : 'HEAD', reasons: verdict.reasons, overBy: outcome.check.overByMinor?.toString() ?? null };
    }

    return this.recorder.record(tx, actor, of, {
      decision: 'APPROVED',
      checkId: outcome.check.id,
      reason: null,
      usesReserve: verdict.usesReserve,
      reserveReason: verdict.usesReserve ? (confirmation?.reason ?? null) : null,
    });
  }
}
