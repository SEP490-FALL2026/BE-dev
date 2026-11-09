import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';

import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { deciderRoleOf } from '../access-request/need-decision.policy';
import { RequestFactsService } from '../access-request/request-facts.service';
import { needRecordOf, verdictsOf, type LineVerdict } from '../group-request/group-line-decision.policy';
import { GroupResolutionService } from '../group-request/group-resolution.service';
import { GroupNeedPreconditions } from './group-need-preconditions.service';
import { GroupNeedVerdictWriter } from './group-need-verdict-writer.service';

export interface LineNeedDecisionInput {
  lines: readonly LineVerdict[];
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
      const verdicts = verdictsOf(open, input.lines);
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
}
