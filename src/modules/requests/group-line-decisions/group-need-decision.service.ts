import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { PolicyChecklistApi } from '../../policies/public/policy-checklist.api';
import { PolicyDecisionReasonRequiredError } from '../../policies/public/policy-checklist.errors';
import type { ChecklistBody } from '../../policies/public/policy-checklist.types';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';

import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord, NeedStepWithDecision } from '../access-request/access-request.types';
import { deciderRoleOf, type DeciderRole } from '../access-request/need-decision.policy';
import { RequestFactsService } from '../access-request/request-facts.service';
import {
  needChecklistDecisionOf,
  peopleWithoutReason,
  needRecordOf,
  returnReasonOf,
  typedReasonOf,
  verdictsOf,
  withReasons,
  type LineVerdict,
  type NeedLineVerdict,
} from '../group-request/group-line-decision.policy';
import { GroupResolutionService } from '../group-request/group-resolution.service';
import { GroupNeedPreconditions } from './group-need-preconditions.service';
import { GroupNeedVerdictWriter } from './group-need-verdict-writer.service';

export interface LineNeedDecisionInput {
  lines: readonly NeedLineVerdict[];
  checklist: ChecklistBody;
}

/**
 * Deciding the need of the people of a request for a group (`US-05-17` AC-3, AC-4, AC-15, AC-16, `US-05-04` AC-14): whoever holds a
 * need step sees its people, approves some and refuses others, and decides all of them in one go, each with a decision of their own.
 * The request is locked while it is decided; the lines, the decisions, the step with its electronic approval record and the audit
 * events are written together, and a person who has been given the right since the request was sent is not approved. The request
 * itself then follows its lines (`GroupResolutionService`): it waits while any line waits, goes on to be sent as spend when none does,
 * and ends when every person was refused.
 */
@Injectable()
export class GroupNeedDecisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly preconditions: GroupNeedPreconditions,
    private readonly requests: AccessRequestRepo,
    private readonly resolution: GroupResolutionService,
    private readonly assessment: RequestFactsService,
    private readonly audit: AuditApi,
    private readonly writer: GroupNeedVerdictWriter,
    private readonly checklists: PolicyChecklistApi,
  ) {}

  /**
   * Throws AccessRequestNotFoundError, AccessRequestDecisionRefusedError, GroupRequestLinesMismatchError,
   * GroupRequestLineHoldsAccessError and the errors of choosing the line of the plan.
   */
  async decide(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: LineNeedDecisionInput,
  ): Promise<AccessRequestRecord> {
    return this.runner.run(async (tx) => {
      const { request, step, open } = await this.preconditions.require(tx, actor, requestId, input);
      const now = new Date();
      const deciderRole = deciderRoleOf(step.routingRow);
      const { decision, settled } = await this.answer(tx, actor, { request, open, input, now });
      if (decision === 'RETURN') return this.sendBack(tx, actor, { request, step, settled, deciderRole, now });

      const verdicts = settled;
      const record = needRecordOf(verdicts);
      await this.requests.recordNeedDecision(tx, {
        organizationId: request.organizationId,
        requestId: request.id,
        stepId: step.id,
        requestState: request.state,
        departmentId: request.departmentId,
        record: { ...record, decidedByEmployeeId: actor.employeeId, deciderRole, decidedAt: now },
      });
      await this.writer.write(tx, actor, { request, step, verdicts, deciderRole, now });

      const { request: after } = await this.resolution.resolve(tx, actor, request.id, now);
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          record.decision === 'APPROVED' ? 'ACCESS_REQUEST.NEED_APPROVED' : 'ACCESS_REQUEST.NEED_REJECTED',
          'ACCESS_REQUEST_STEP',
          step.id,
          {
            requestId: request.id,
            decision: record.decision,
            assigneeEmployeeId: step.assigneeEmployeeId,
            decidedByEmployeeId: actor.employeeId,
            deciderRole,
            departmentId: request.departmentId,
            requestState: after.state,
            lineCount: verdicts.length,
            approvedEmployeeIds: verdicts.filter((v) => v.decision === 'APPROVE').map((v) => v.employeeId),
            rejectedEmployeeIds: verdicts.filter((v) => v.decision === 'REJECT').map((v) => v.employeeId),
          },
        ),
      );

      return after;
    });
  }

  /**
   * One checklist for the whole group, kept once for each of its people (`US-05-04` AC-22, R-6): what the answers allow of the group, and each
   * person with the reason they typed or the one the answers No give.
   */
  private async answer(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    asked: {
      request: AccessRequestRecord;
      open: readonly { employeeId: string }[];
      input: LineNeedDecisionInput;
      now: Date;
    },
  ): Promise<{ decision: 'APPROVE' | 'REJECT' | 'RETURN'; settled: LineVerdict[] }> {
    const { request, open, input, now } = asked;
    const decision = needChecklistDecisionOf(input.lines);
    const judged = await this.checklists.judge(tx, {
      organizationId: request.organizationId,
      stepCode: '1.2',
      checklist: input.checklist,
      decision,
      reason: typedReasonOf(input.lines),
    });
    const reasoned = withReasons(input.lines, judged.autoReason);
    if (peopleWithoutReason(reasoned).length > 0) throw new PolicyDecisionReasonRequiredError();
    const settled = verdictsOf(open, reasoned as LineVerdict[]);
    await this.checklists.record(tx, {
      organizationId: request.organizationId,
      verdict: judged.verdict,
      decision,
      decidedByEmployeeId: actor.employeeId,
      decidedAt: now,
      subjects: settled.map((verdict) => ({
        kind: 'ACCESS_REQUEST' as const,
        id: request.id,
        lineEmployeeId: verdict.employeeId,
        decision: verdict.decision,
      })),
    });

    return { decision, settled };
  }

  /**
   * The whole group goes back to its sender (`US-05-04` AC-22, R-24): the step is closed with a record that says it was sent back and why, the request
   * waits for its sender, and no person is decided: each line keeps waiting for its need, which the sender asks again by sending the request on.
   */
  private async sendBack(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    sent: {
      request: AccessRequestRecord;
      step: NeedStepWithDecision;
      settled: readonly { employeeId: string; reason?: string }[];
      deciderRole: DeciderRole;
      now: Date;
    },
  ): Promise<AccessRequestRecord> {
    const { request, step, settled, deciderRole, now } = sent;
    const reason = returnReasonOf(settled);
    await this.requests.recordNeedDecision(tx, {
      organizationId: request.organizationId,
      requestId: request.id,
      stepId: step.id,
      requestState: 'AWAITING_REQUESTER_REVISION',
      departmentId: request.departmentId,
      record: { decision: 'RETURNED', reason, decidedByEmployeeId: actor.employeeId, deciderRole, decidedAt: now },
    });
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.NEED_RETURNED',
        'ACCESS_REQUEST_STEP',
        step.id,
        {
          requestId: request.id,
          decision: 'RETURNED',
          assigneeEmployeeId: step.assigneeEmployeeId,
          decidedByEmployeeId: actor.employeeId,
          deciderRole,
          departmentId: request.departmentId,
          requestState: 'AWAITING_REQUESTER_REVISION',
          lineCount: settled.length,
          reason,
        },
      ),
    );
    const after = await this.requests.findById(request.id, tx);
    if (!after) throw new Error(`The request ${request.id} was not found after it was sent back.`);

    return after;
  }
}
