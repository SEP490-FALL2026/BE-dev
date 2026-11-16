import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PolicyChecklistApi } from '../../policies/public/policy-checklist.api';
import type { ChecklistBody } from '../../policies/public/policy-checklist.types';
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
  decision: 'APPROVE' | 'REJECT' | 'RETURN';
  /** The reason of a refusal or a return; left out, the answers No of the checklist give it. */
  reason?: string;
  /** The checklist of the policy in force at the step (`QĐ-111ap`). */
  checklist: ChecklistBody;
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
    private readonly checklists: PolicyChecklistApi,
  ) {}

  /** Throws AccessRequestNotFoundError and SpendDecisionRefusedError. */
  async decide(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: SpendDecisionInput,
  ): Promise<SpendDecisionResult> {
    return this.runner.run(async (tx) => {
      const { request, step } = await this.lockDecidable(tx, actor, requestId);
      // What the checklist refuses is told before the budget is checked: a No locks an approval, a refusal or a return takes its reason from it.
      const { verdict, reason } = await this.checklists.judge(tx, {
        organizationId: request.organizationId,
        stepCode: '1.7',
        checklist: input.checklist,
        decision: input.decision,
        reason: input.reason,
      });
      const now = new Date();
      const result = await this.decideOn(tx, actor, { request, step, now }, { decision: input.decision, reason });
      // The answers are kept with a decision that was made; a request that went back because the check made again blocked it was not decided.
      if (result.status === 'DECIDED') {
        await this.checklists.record(tx, {
          organizationId: request.organizationId,
          verdict,
          decision: input.decision,
          decidedByEmployeeId: actor.employeeId,
          decidedAt: now,
          subjects: [{ kind: 'ACCESS_REQUEST', id: request.id }],
        });
      }

      return result;
    });
  }

  private async decideOn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    of: { request: AccessRequestRecord; step: SpendStepRecord; now: Date },
    asked: { decision: 'APPROVE' | 'REJECT' | 'RETURN'; reason: string | null },
  ): Promise<SpendDecisionResult> {
    if (asked.decision === 'RETURN') {
      const { requestState } = await this.effects.returnByApprover(tx, actor, of.request, of.step, {
        now: of.now,
        reason: asked.reason ?? '',
      });

      return { status: 'DECIDED', decision: 'RETURNED', requestState };
    }
    const outcome = await this.checks.run(tx, of.request, 'SPEND_DECISION', actor, of.now);
    if (asked.decision === 'REJECT') {
      return this.recorder.record(tx, actor, of, {
        decision: 'REJECTED',
        checkId: outcome.status === 'CHECKED' ? outcome.check.id : null,
        reason: asked.reason,
        usesReserve: false,
        reserveReason: null,
      });
    }

    return this.approve(tx, actor, of, outcome);
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

  private async returnMissing(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    of: { request: AccessRequestRecord; step: SpendStepRecord; now: Date },
    reason: 'PRICE_MISSING',
  ): Promise<SpendDecisionResult> {
    if (of.request.routing?.mode !== 'ONE_STEP') throw new SpendDecisionRefusedError('NOT_CHECKABLE');
    await this.effects.sendBack(tx, actor, of.request, of.step, { now: of.now, reasons: [reason], check: null });
    return { status: 'BOUNCED', to: 'REQUESTER', reasons: [reason], overBy: null };
  }

  /** An approval is made on what the check says: it is recorded, or the request goes back to its head. */
  private async approve(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    of: { request: AccessRequestRecord; step: SpendStepRecord; now: Date },
    outcome: CheckOutcome,
  ): Promise<SpendDecisionResult> {
    const { request, step, now } = of;
    if (outcome.status === 'NOT_CHECKABLE') return this.returnMissing(tx, actor, of, outcome.reason);

    const confirmation = await this.confirmations.ofStep(step.id, tx);
    const verdict = judgeApproval(outcome.check, request.routing?.mode === 'ONE_STEP' || confirmation !== null);
    if (verdict.kind === 'RETURNED') {
      await this.effects.sendBack(tx, actor, request, step, { now, reasons: verdict.reasons, check: outcome.check });

      return {
        status: 'BOUNCED',
        to: request.routing?.mode === 'ONE_STEP' ? 'REQUESTER' : 'HEAD',
        reasons: verdict.reasons,
        overBy: outcome.check.overByMinor?.toString() ?? null,
      };
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
