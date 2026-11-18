import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { ChecklistBody } from '../../policies/public/policy-checklist.types';
import { BudgetCheckService } from '../spend/budget-check.service';
import { judgeApproval, type ReturnReason } from '../spend/spend-decision.policy';
import { SpendDecisionRefusedError } from '../spend/spend.errors';
import { ReserveConfirmationRepo } from '../reserve-confirmation/reserve-confirmation.repo';
import { SpendEffectsService } from '../spend-effects/spend-effects.service';
import { returnReasonOf, type NeedLineVerdict } from '../group-request/group-line-decision.policy';
import { pricedPeople } from '../access-request/group-request.types';
import { GroupSpendChecklist, type GroupSpendAnswered } from './group-spend-checklist.service';
import { GroupSpendPreconditions, type GroupSpendDecidable } from './group-spend-preconditions.service';
import { GroupSpendRecordService } from './group-spend-record.service';

export interface LineSpendDecisionInput {
  lines: readonly NeedLineVerdict[];
  /** One checklist for the whole group (`QĐ-111ap`, R-6). */
  checklist: ChecklistBody;
}

export type LineSpendDecisionResult =
  | { status: 'DECIDED'; requestState: string }
  /** The request was checked again as the approver decided and it is not for them now: it went back to its head, nothing was decided (`US-06-01` AC-18). */
  | { status: 'BOUNCED'; to: 'HEAD' | 'REQUESTER'; reasons: ReturnReason[]; overBy?: string | null };

/**
 * The spending approver decides the people of a request for a group (`US-05-17` AC-9, `US-06-01` AC-15, `US-06-08` AC-10). The step
 * is one, the check is one and the snapshot is one, but the decision is for each person: the approver sees the people with what each
 * costs, approves some and refuses others, and decides all of them at once. The check is made again on the people approved, so the
 * snapshot and the commitment are always those of what was approved. A request that is blocked now, or uses a reserve nobody confirmed,
 * goes back to its head as a request of one person does and nobody is decided. One checklist answers for the group (`QĐ-111ap`): a No locks the
 * approval of everybody, and the group is sent back to the head whole (`RETURN`) with a record of approval that says so.
 */
@Injectable()
export class GroupSpendDecisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly preconditions: GroupSpendPreconditions,
    private readonly checklist: GroupSpendChecklist,
    private readonly checks: BudgetCheckService,
    private readonly confirmations: ReserveConfirmationRepo,
    private readonly effects: SpendEffectsService,
    private readonly records: GroupSpendRecordService,
  ) {}

  /** Throws AccessRequestNotFoundError, SpendDecisionRefusedError, GroupRequestLinesMismatchError and what the checklist refuses. */
  async decide(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: LineSpendDecisionInput,
  ): Promise<LineSpendDecisionResult> {
    return this.runner.run(async (tx): Promise<LineSpendDecisionResult> => {
      const decidable = await this.preconditions.require(tx, actor, requestId, input);
      const { request, step, confirmed } = decidable;
      const answered = await this.checklist.judge(tx, request, confirmed, input);
      const now = new Date();
      if (answered.decision === 'RETURN') {
        const reason = returnReasonOf(answered.verdicts);
        const { requestState } = await this.effects.returnByApprover(tx, actor, request, step, { now, reason });
        await this.checklist.record(tx, actor, request, { answered, decidedAt: now });

        return { status: 'DECIDED', requestState };
      }
      const result = await this.decideOn(tx, actor, decidable, { answered, now });
      if (result.status === 'DECIDED') await this.checklist.record(tx, actor, request, { answered, decidedAt: now });

      return result;
    });
  }

  /** The check made on the people approved, and the decision made on it. */
  private async decideOn(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    decidable: GroupSpendDecidable,
    given: { answered: GroupSpendAnswered; now: Date },
  ): Promise<LineSpendDecisionResult> {
    const { request, step, confirmed } = decidable;
    const { verdicts } = given.answered;
    const { now } = given;
    const approved = verdicts.filter((verdict) => verdict.decision === 'APPROVE');

    // The check is made on the people approved; when nobody is, on all of them, which is what a refusal keeps as its snapshot.
    const outcome = await this.checks.run(tx, request, 'SPEND_DECISION', actor, now, {
      priced: pricedPeople(request.lines.map((line) => line.state)),
      scoped: approved.length > 0 ? approved.length : confirmed.length,
      employeeIds: (approved.length > 0 ? approved : verdicts).map((verdict) => verdict.employeeId),
    });
    const checkId = outcome.status === 'CHECKED' ? outcome.check.id : null;
    if (approved.length === 0) {
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
    if (outcome.status === 'NOT_CHECKABLE') {
      if (request.routing?.mode !== 'ONE_STEP') throw new SpendDecisionRefusedError('NOT_CHECKABLE');
      await this.effects.sendBack(tx, actor, request, step, { now, reasons: [outcome.reason], check: null });
      return { status: 'BOUNCED', to: 'REQUESTER', reasons: [outcome.reason], overBy: null };
    }

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
  }
}
