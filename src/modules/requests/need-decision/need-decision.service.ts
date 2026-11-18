import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { PolicyChecklistApi } from '../../policies/public/policy-checklist.api';
import type { ChecklistBody } from '../../policies/public/policy-checklist.types';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import {
  AccessRequestDecisionRefusedError,
  AccessRequestGroupUsesLinesError,
  AccessRequestNotFoundError,
} from '../access-request/access-request.errors';
import { canViewRequest, viewFactsOf } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import {
  checkNeedDecision,
  needDecisionOutcome,
  type DecisionInput,
  type NeedDecisionOutcome,
} from '../access-request/need-decision.policy';
import { RequestFactsService } from '../access-request/request-facts.service';
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
    private readonly effects: NeedDecisionEffects,
    private readonly checklists: PolicyChecklistApi,
  ) {}

  /**
   * Throws what the checklist refuses (`PolicyVersionChangedError`, `PolicyChecklistIncompleteError`, `PolicyChecklistHasNoError`,
   * `PolicyDecisionReasonRequiredError`) after the errors of who may decide, and writes the answers with the decision (`QĐ-111ap`).
   */
  async decide(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: DecisionInput & { checklist: ChecklistBody },
  ): Promise<AccessRequestRecord> {
    return this.runner.run(async (tx) => {
      const request = await this.lockDecidable(tx, actor, requestId);
      const outcome = needDecisionOutcome({ branch: request.branch, routingRow: request.needStep.routingRow }, input);
      const { verdict, reason } = await this.checklists.judge(tx, {
        organizationId: request.organizationId,
        stepCode: '1.2',
        checklist: input.checklist,
        decision: input.decision,
        reason: input.reason,
      });
      const decidedAt = new Date();
      await this.writeDecision(tx, actor, request, { reason, outcome, decidedAt });
      await this.checklists.record(tx, {
        organizationId: request.organizationId,
        verdict,
        decision: input.decision,
        decidedByEmployeeId: actor.employeeId,
        decidedAt,
        subjects: [{ kind: 'ACCESS_REQUEST', id: request.id }],
      });

      return this.effects.follow(tx, actor, request, outcome, decidedAt);
    });
  }

  /** The request, locked, when the person may see it, it is not a group and the policy lets them decide its need step. */
  private async lockDecidable(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    requestId: string,
  ): Promise<AccessRequestRecord> {
    const request = await this.repo.lockById(tx, requestId);
    if (!request || !canViewRequest(actor, viewFactsOf(request))) throw new AccessRequestNotFoundError();
    // The people of a request for a group are decided one by one, in the routes of its lines (`US-05-17`).
    if (request.type === 'GROUP_GRANT') throw new AccessRequestGroupUsesLinesError();
    const { needStep } = request;
    const refusal = checkNeedDecision({
      actorEmployeeId: actor.employeeId,
      requesterEmployeeId: request.requesterEmployeeId,
      beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
      assigneeEmployeeId: needStep.assigneeEmployeeId,
      stepState: needStep.state,
    });
    if (refusal) throw new AccessRequestDecisionRefusedError(refusal);

    return request;
  }

  /** The decision of the step and the request state, and the audit event of it, written together. */
  private async writeDecision(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    decided: { reason: string | null; outcome: NeedDecisionOutcome; decidedAt: Date },
  ): Promise<void> {
    const { reason, outcome, decidedAt } = decided;
    const { needStep } = request;
    const decision = outcome.approved ? 'APPROVED' : outcome.returned ? 'RETURNED' : 'REJECTED';

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
        reason,
        decidedAt,
      },
    });
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        outcome.approved
          ? 'ACCESS_REQUEST.NEED_APPROVED'
          : outcome.returned
            ? 'ACCESS_REQUEST.NEED_RETURNED'
            : 'ACCESS_REQUEST.NEED_REJECTED',
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
          ...(outcome.returned ? { reason } : {}),
        },
      ),
    );
  }
}
