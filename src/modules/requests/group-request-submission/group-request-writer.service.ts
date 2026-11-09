import { SpendRoutingService } from '../spend/spend-routing.service';
import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { LineDecisionRepo } from '../group-request/line-decision.repo';
import { RequestLineRepo } from '../group-request/request-line.repo';
import { groupLineRowsOf, groupStartState, type PlannedNeedStep } from './group-need-routing.policy';
import { submissionEvents } from './group-request-trail.mapper';
import type { GroupJudgement, GroupLineInput } from './group-submission-facts.service';

/** What the sending of a request for a group is written from: what was judged and planned, and what the sender asked. */
export interface GroupWritten {
  organizationId: string;
  judged: GroupJudgement;
  planned: readonly PlannedNeedStep<GroupLineInput>[];
  body: {
    planId: string;
    businessReason: string;
  };
  draftId: string | null;
}

/** Each line carries the GH-3 flag of its person with the reason the sender gave (`BR-MF1-01g`). */
const withFlags = <Line extends { employeeId: string }>(lines: Line[], judged: GroupJudgement) =>
  lines.map((line) => ({ ...line, manyPaidSoftware: judged.manyPaidSoftware.get(line.employeeId) ?? null }));

/**
 * Writes the request for a group once everything about it was judged (`US-05-17`, `US-05-03` AC-8, AC-14): the request with the first need
 * step, the others, a line for each person, the approval of the people the head confirmed by sending, and the audit events. All of it in
 * the transaction of the sending.
 */
@Injectable()
export class GroupRequestWriter {
  constructor(
    private readonly spendRouting: SpendRoutingService,
    private readonly requests: AccessRequestRepo,
    private readonly lines: RequestLineRepo,
    private readonly decisions: LineDecisionRepo,
    private readonly audit: AuditApi,
  ) {}

  async write(tx: DbTx, actor: AuthenticatedPrincipal, written: GroupWritten): Promise<AccessRequestRecord> {
    const { organizationId, judged, planned, body } = written;
    const { policy, unit } = judged.assessed;
    const now = new Date();
    const state = groupStartState(planned, policy.branch);

    const [first, ...rest] = planned;
    const created = await this.requests.insert(tx, {
      type: 'GROUP_GRANT',
      organizationId,
      branch: policy.branch,
      state: 'PENDING',
      planId: body.planId,
      requesterEmployeeId: actor.employeeId,
      beneficiaryEmployeeIds: judged.lines.map((line) => line.employeeId),
      departmentId: unit.departmentId,
      costCenterId: unit.costCenter?.id ?? null,
      businessReason: body.businessReason,
      termMonths: null,
      pricing: judged.pricing,
      policy,
      createdByAppUserId: actor.appUserId,
      now,
      needStep: first.step,
      draftId: written.draftId,
    });
    const stepIds = [created.needStepId];
    for (const entry of rest) {
      stepIds.push(await this.requests.addNeedStep(tx, { requestId: created.id, step: entry.step, now }));
    }
    await this.lines.insertMany(tx, withFlags(groupLineRowsOf(created.id, planned, stepIds), judged));

    const confirmed = planned.findIndex((entry) => entry.confirmedBySending);
    if (confirmed >= 0) {
      await this.confirmByHead(tx, actor, {
        organizationId,
        requestId: created.id,
        stepId: stepIds[confirmed],
        state,
        judged,
        body,
        now,
        lines: planned[confirmed].lines,
      });
    }
    for (const event of submissionEvents(actor, {
      organizationId,
      requestId: created.id,
      planId: body.planId,
      expectedEndDate: judged.pricing.expectedEndDate,
      state,
      judged,
      planned,
      stepIds,
    })) {
      await this.audit.record(tx, event);
    }

    await this.spendRouting.start(tx, actor, created.id, now);
    const request = await this.requests.findById(created.id, tx);
    if (!request) throw new Error(`The request ${created.id} was not found after it was written.`);

    return request;
  }

  /** The need step of the people is approved by the head in the moment of sending, one decision for each person (`US-05-17` AC-1, AC-3). */
  private async confirmByHead(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      requestId: string;
      stepId: string;
      state: AccessRequestRecord['state'];
      judged: GroupJudgement;
      body: GroupWritten['body'];
      now: Date;
      lines: readonly GroupLineInput[];
    },
  ): Promise<void> {
    await this.requests.recordNeedDecision(tx, {
      organizationId: input.organizationId,
      requestId: input.requestId,
      stepId: input.stepId,
      requestState: input.state,
      departmentId: input.judged.assessed.unit.departmentId,
      record: {
        decision: 'APPROVED',
        decidedByEmployeeId: actor.employeeId,
        deciderRole: 'MANAGER',
        reason: null,
        decidedAt: input.now,
      },
    });
    await this.decisions.insertMany(
      tx,
      input.lines.map((line) => ({
        requestId: input.requestId,
        employeeId: line.employeeId,
        stage: 'NEED' as const,
        stepId: input.stepId,
        decision: 'APPROVED' as const,
        reason: null,
        decidedByEmployeeId: actor.employeeId,
        deciderRole: 'MANAGER' as const,
        decidedAt: input.now,
      })),
    );
    await this.auditApproved(tx, actor, input);
  }

  private async auditApproved(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      requestId: string;
      stepId: string;
      state: AccessRequestRecord['state'];
      judged: GroupJudgement;
      lines: readonly GroupLineInput[];
      body: GroupWritten['body'];
    },
  ): Promise<void> {
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        input.organizationId,
        'ACCESS_REQUEST.NEED_APPROVED',
        'ACCESS_REQUEST_STEP',
        input.stepId,
        {
          requestId: input.requestId,
          decision: 'APPROVED',
          assigneeEmployeeId: actor.employeeId,
          decidedByEmployeeId: actor.employeeId,
          deciderRole: 'MANAGER',
          departmentId: input.judged.assessed.unit.departmentId,
          requestState: input.state,
          delegated: true,
          lineCount: input.lines.length,
        },
      ),
    );
  }
}
