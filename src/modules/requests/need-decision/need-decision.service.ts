import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import {
  AccessRequestDecisionRefusedError,
  AccessRequestGroupUsesLinesError,
  AccessRequestNotFoundError,
} from '../access-request/access-request.errors';
import { canViewRequest, viewFactsOf, hasSpendStep } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import {
  checkNeedDecision,
  needDecisionOutcome,
  type DecisionInput,
  type NeedDecisionOutcome,
} from '../access-request/need-decision.policy';
import { RequestFactsService } from '../access-request/request-facts.service';
import { NeedSpendService } from '../assessment/need-spend.service';
import { NeedDecisionEffects } from './need-decision-effects.service';

/**
 * Deciding the need step (`US-05-04`, `US-01-12` AC-6): the person the routing table gave the step approves or refuses
 * it. The request is locked while it is decided, so two decisions queue and the second finds the step decided. The step,
 * the request, the electronic approval record and the audit event are written together; a refused decision changes nothing.
 * Nobody decides a request they asked or are given, whatever role they hold (`SoD-4`).
 *
 * A head who approves a request that costs money also chooses the line of the plan of the budget it is for, or says it is
 * outside the plan, and may correct the day the money goes out (`US-05-04` AC-12, AC-16); with no choice nothing is saved. A
 * request that nobody can send on in a batch, because the fallback approver or the spending approver decided its need, is
 * checked at once (`US-06-14` AC-8).
 */
@Injectable()
export class NeedDecisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: AccessRequestRepo,
    private readonly audit: AuditApi,
    private readonly settings: RequestFactsService,
    private readonly spendChoice: NeedSpendService,
    private readonly effects: NeedDecisionEffects,
  ) {}

  async decide(actor: AuthenticatedPrincipal, requestId: string, input: DecisionInput): Promise<AccessRequestRecord> {
    const { fiscalYearStartMonth } = await this.settings.settings();

    return this.runner.run(async (tx) => {
      const request = await this.lockDecidable(tx, actor, requestId, input);
      const outcome = needDecisionOutcome(
        { branch: request.branch, routingRow: request.needStep.routingRow, hasSpendStep: hasSpendStep(request.policy) },
        input,
      );
      // The head approving a request that costs money chooses its line first; a refusal here undoes the whole decision.
      if (input.spend !== undefined && !outcome.headChoosesLine) {
        throw new AccessRequestDecisionRefusedError('SPEND_NOT_APPLICABLE');
      }
      const decidedAt = new Date();
      if (outcome.headChoosesLine) {
        await this.spendChoice.apply(tx, actor, request, input.spend, { decidedAt, fiscalYearStartMonth });
      }
      await this.writeDecision(tx, actor, request, { input, outcome, decidedAt });

      return this.effects.follow(tx, actor, request, outcome, decidedAt);
    });
  }

  /** The request, locked, when the person may see it, it is not a group and the policy lets them decide its need step. */
  private async lockDecidable(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: DecisionInput,
  ): Promise<AccessRequestRecord> {
    const request = await this.repo.lockById(tx, requestId);
    if (!request || !canViewRequest(actor, viewFactsOf(request))) throw new AccessRequestNotFoundError();
    // The people of a request for a group are decided one by one, in the routes of its lines (`US-05-17`).
    if (request.type === 'GROUP_GRANT') throw new AccessRequestGroupUsesLinesError();
    const { needStep } = request;
    const refusal = checkNeedDecision(
      {
        actorEmployeeId: actor.employeeId,
        requesterEmployeeId: request.requesterEmployeeId,
        beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
        assigneeEmployeeId: needStep.assigneeEmployeeId,
        stepState: needStep.state,
        // A renewal is long when the right would run on over twelve months in all, not when its own term is.
        termMonths: request.renewal?.consecutiveMonths ?? request.termMonths,
      },
      input,
    );
    if (refusal) throw new AccessRequestDecisionRefusedError(refusal);

    return request;
  }

  /** The decision of the step and the request state, and the audit event of it, written together. */
  private async writeDecision(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    decided: { input: DecisionInput; outcome: NeedDecisionOutcome; decidedAt: Date },
  ): Promise<void> {
    const { input, outcome, decidedAt } = decided;
    const { needStep } = request;
    const decision = outcome.approved ? 'APPROVED' : 'REJECTED';

    await this.repo.recordNeedDecision(tx, {
      organizationId: request.organizationId,
      requestId: request.id,
      stepId: needStep.id,
      requestState: outcome.requestState,
      departmentId: request.departmentId,
      record: {
        decision,
        decidedByEmployeeId: actor.employeeId,
        deciderRole: outcome.deciderRole,
        reason: input.reason?.trim() || null,
        termConfirmationReason: outcome.termConfirmationReason,
        decidedAt,
      },
    });
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        outcome.approved ? 'ACCESS_REQUEST.NEED_APPROVED' : 'ACCESS_REQUEST.NEED_REJECTED',
        'ACCESS_REQUEST_STEP',
        needStep.id,
        {
          requestId: request.id,
          decision,
          assigneeEmployeeId: needStep.assigneeEmployeeId,
          decidedByEmployeeId: actor.employeeId,
          deciderRole: outcome.deciderRole,
          departmentId: request.departmentId,
          requestState: outcome.requestState,
          termConfirmed: Boolean(outcome.termConfirmationReason),
        },
      ),
    );
  }
}
