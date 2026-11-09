import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { BudgetCheckService } from '../spend/budget-check.service';
import { checkSpendDecider, judgeApproval, type ReturnReason } from '../spend/spend-decision.policy';
import { SpendDecisionRefusedError } from '../spend/spend.errors';
import { ReserveConfirmationRepo } from '../reserve-confirmation/reserve-confirmation.repo';
import { SpendEffectsService } from '../spend-effects/spend-effects.service';
import { SpendStepRepo } from '../spend/spend-step.repo';
import { compareLines, type LineVerdict } from '../group-request/group-line-decision.policy';
import { GroupRequestLinesMismatchError } from '../group-request/group-request.errors';
import { pricedPeople } from '../access-request/group-request.types';
import { GroupSpendRecordService } from './group-spend-record.service';
import { RequestLineRepo } from '../group-request/request-line.repo';

export interface LineSpendDecisionInput {
  lines: readonly LineVerdict[];
}

export type LineSpendDecisionResult =
  | { status: 'DECIDED'; requestState: string }
  /** The request was checked again as the approver decided and it is not for them now: it went back to its head, nothing was decided (`US-06-01` AC-18). */
  | { status: 'BOUNCED'; to: 'HEAD'; reasons: ReturnReason[] };

/**
 * The spending approver decides the people of a request for a group (`US-05-17` AC-9, `US-06-01` AC-15, `US-06-08` AC-10). The step
 * is one, the check is one and the snapshot is one, but the decision is for each person: the approver sees the people with what each
 * costs, approves some and refuses others, and decides all of them at once. The check is made again on the people approved, so the
 * snapshot and the commitment are always those of what was approved. A request that is blocked now, or uses a reserve nobody confirmed,
 * goes back to its head as a request of one person does and nobody is decided.
 */
@Injectable()
export class GroupSpendDecisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly steps: SpendStepRepo,
    private readonly lines: RequestLineRepo,
    private readonly checks: BudgetCheckService,
    private readonly confirmations: ReserveConfirmationRepo,
    private readonly effects: SpendEffectsService,
    private readonly records: GroupSpendRecordService,
  ) {}

  /** Throws AccessRequestNotFoundError, SpendDecisionRefusedError and GroupRequestLinesMismatchError. */
  async decide(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: LineSpendDecisionInput,
  ): Promise<LineSpendDecisionResult> {
    return this.runner.run(async (tx): Promise<LineSpendDecisionResult> => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request || request.type !== 'GROUP_GRANT') throw new AccessRequestNotFoundError();
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
      const lines = await this.lines.lock(tx, request.id);
      const confirmed = lines.filter((line) => line.state === 'NEED_CONFIRMED');
      const mismatch = compareLines(
        confirmed.map((line) => line.employeeId),
        input.lines.map((verdict) => verdict.employeeId),
      );
      if (mismatch) throw new GroupRequestLinesMismatchError(mismatch);
      const verdicts = confirmed.map(
        (line) => input.lines.find((verdict) => verdict.employeeId === line.employeeId) as LineVerdict,
      );
      const approved = verdicts.filter((verdict) => verdict.decision === 'APPROVE').length;

      // The check is made on the people approved; when nobody is, on all of them, which is what a refusal keeps as its snapshot.
      const now = new Date();
      const outcome = await this.checks.run(tx, request, 'SPEND_DECISION', actor, now, {
        priced: pricedPeople(request.lines.map((line) => line.state)),
        scoped: approved > 0 ? approved : confirmed.length,
      });
      const checkId = outcome.status === 'CHECKED' ? outcome.check.id : null;
      if (approved === 0) {
        return {
          status: 'DECIDED',
          ...(await this.records.record(tx, actor, request, {
            step,
            verdicts,
            checkId,
            usesReserve: false,
            reserveReason: null,
            now,
          })),
        };
      }
      if (outcome.status === 'NOT_CHECKABLE') throw new SpendDecisionRefusedError('NOT_CHECKABLE');

      const confirmation = await this.confirmations.ofStep(step.id, tx);
      const verdict = judgeApproval(outcome.check, confirmation !== null);
      if (verdict.kind === 'RETURNED') {
        await this.effects.sendBack(tx, actor, request, step, { now, reasons: verdict.reasons, check: outcome.check });

        return { status: 'BOUNCED', to: 'HEAD', reasons: verdict.reasons };
      }

      return {
        status: 'DECIDED',
        ...(await this.records.record(tx, actor, request, {
          step,
          verdicts,
          checkId,
          usesReserve: verdict.usesReserve,
          reserveReason: verdict.usesReserve ? (confirmation?.reason ?? null) : null,
          now,
        })),
      };
    });
  }
}
