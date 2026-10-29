import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { LicensingApi } from '../../../licensing/public/licensing.api';
import { accessRequestAuditEvent } from '../../access-request/access-request-audit-event.mapper';
import {
  AccessRequestDecisionRefusedError,
  AccessRequestNotFoundError,
} from '../../access-request/access-request.errors';
import { canViewRequest, viewFactsOf } from '../../access-request/access-request.policy';
import { AccessRequestRepo } from '../../access-request/access-request.repo';
import type { AccessRequestRecord, NeedStepWithDecision } from '../../access-request/access-request.types';
import { deciderRoleOf, type SpendInput } from '../../access-request/need-decision.policy';
import { NeedSpendService } from '../../need-decision/need-spend.service';
import { RequestAssessmentService } from '../../access-request/request-assessment.service';
import {
  checkLineNeedDecider,
  compareLines,
  needLineState,
  stepOutcomeOf,
  stepRefusalReason,
  type LineVerdict,
} from '../group-line-decision.policy';
import { GroupRequestLineHoldsAccessError, GroupRequestLinesMismatchError } from '../group-request.errors';
import { GroupResolutionService } from '../group-resolution.service';
import { LineDecisionRepo } from '../line-decision.repo';
import { RequestLineRepo } from '../request-line.repo';
import { RequestOutcomeService } from '../../outcome/request-outcome.service';

export interface LineNeedDecisionInput {
  lines: readonly LineVerdict[];
  termConfirmationReason?: string;
  spend?: SpendInput;
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
    private readonly requests: AccessRequestRepo,
    private readonly lines: RequestLineRepo,
    private readonly decisions: LineDecisionRepo,
    private readonly spendChoice: NeedSpendService,
    private readonly resolution: GroupResolutionService,
    private readonly assessment: RequestAssessmentService,
    private readonly licensing: LicensingApi,
    private readonly audit: AuditApi,
    private readonly outcomes: RequestOutcomeService,
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
    const { fiscalYearStartMonth } = await this.assessment.settings();

    return this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request || request.type !== 'GROUP_GRANT' || !canViewRequest(actor, viewFactsOf(request))) {
        throw new AccessRequestNotFoundError();
      }
      const lines = await this.lines.lock(tx, request.id);
      const step = this.stepOf(request, actor.employeeId, lines);
      const own = lines.filter((line) => line.needStepId === step.id);
      const approves = input.lines.some((verdict) => verdict.decision === 'APPROVE');

      const refusal = checkLineNeedDecider({
        actorEmployeeId: actor.employeeId,
        requesterEmployeeId: request.requesterEmployeeId,
        stepEmployeeIds: own.map((line) => line.employeeId),
        assigneeEmployeeId: step.assigneeEmployeeId,
        stepState: step.state,
        termMonths: request.termMonths,
        approves,
        confirmed: (input.termConfirmationReason ?? '').trim() !== '',
      });
      if (refusal) throw new AccessRequestDecisionRefusedError(refusal);

      const open = own.filter((line) => line.state === 'AWAITING_NEED');
      const mismatch = compareLines(
        open.map((line) => line.employeeId),
        input.lines.map((verdict) => verdict.employeeId),
      );
      if (mismatch) throw new GroupRequestLinesMismatchError(mismatch);
      await this.assertNobodyHoldsAccess(request, input.lines);

      const now = new Date();
      const deciderRole = deciderRoleOf(step.routingRow);
      const headChoosesLine = approves && deciderRole === 'MANAGER';
      if (input.spend !== undefined && !headChoosesLine)
        throw new AccessRequestDecisionRefusedError('SPEND_NOT_APPLICABLE');
      if (headChoosesLine) {
        await this.spendChoice.apply(tx, actor, request, input.spend, { decidedAt: now, fiscalYearStartMonth });
      }

      const verdicts = open.map(
        (line) => input.lines.find((verdict) => verdict.employeeId === line.employeeId) as LineVerdict,
      );
      const outcome = stepOutcomeOf(verdicts);
      const confirmation = (input.termConfirmationReason ?? '').trim();
      await this.requests.recordNeedDecision(tx, {
        organizationId: request.organizationId,
        requestId: request.id,
        stepId: step.id,
        requestState: request.state,
        departmentId: request.departmentId,
        record: {
          decision: outcome,
          decidedByEmployeeId: actor.employeeId,
          deciderRole,
          reason: outcome === 'REJECTED' ? stepRefusalReason(verdicts) : null,
          termConfirmationReason: outcome === 'APPROVED' && confirmation !== '' ? confirmation : null,
          decidedAt: now,
        },
      });
      await this.decisions.insertMany(
        tx,
        verdicts.map((verdict) => ({
          requestId: request.id,
          employeeId: verdict.employeeId,
          stage: 'NEED' as const,
          stepId: step.id,
          decision: verdict.decision === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const),
          reason: verdict.decision === 'REJECT' ? (verdict.reason ?? '').trim() : null,
          decidedByEmployeeId: actor.employeeId,
          deciderRole,
          decidedAt: now,
        })),
      );
      for (const verdict of verdicts) {
        const rejected = verdict.decision === 'REJECT';
        await this.lines.move(tx, request.id, verdict.employeeId, {
          state: needLineState(verdict.decision),
          ...(rejected
            ? { endedAt: now, endedByEmployeeId: actor.employeeId, endReason: (verdict.reason ?? '').trim() }
            : {}),
        });
        await this.audit.record(
          tx,
          accessRequestAuditEvent(
            actor,
            request.organizationId,
            'ACCESS_REQUEST.LINE_NEED_DECIDED',
            'ACCESS_REQUEST_STEP',
            step.id,
            {
              requestId: request.id,
              stepId: step.id,
              beneficiaryEmployeeId: verdict.employeeId,
              decision: rejected ? 'REJECTED' : 'APPROVED',
              decidedByEmployeeId: actor.employeeId,
              deciderRole,
              reason: rejected ? (verdict.reason ?? '').trim() : null,
              requesterEmployeeId: request.requesterEmployeeId,
            },
          ),
        );
        // The line of a person who was refused ended for them without a grant (F43).
        if (rejected) await this.outcomes.ended(tx, request, [verdict.employeeId], now);
      }

      const { request: after } = await this.resolution.resolve(tx, actor, request.id, now);
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          outcome === 'APPROVED' ? 'ACCESS_REQUEST.NEED_APPROVED' : 'ACCESS_REQUEST.NEED_REJECTED',
          'ACCESS_REQUEST_STEP',
          step.id,
          {
            requestId: request.id,
            decision: outcome,
            assigneeEmployeeId: step.assigneeEmployeeId,
            decidedByEmployeeId: actor.employeeId,
            deciderRole,
            departmentId: request.departmentId,
            requestState: after.state,
            termConfirmed: confirmation !== '',
            lineCount: verdicts.length,
            approvedEmployeeIds: verdicts
              .filter((verdict) => verdict.decision === 'APPROVE')
              .map((verdict) => verdict.employeeId),
            rejectedEmployeeIds: verdicts
              .filter((verdict) => verdict.decision === 'REJECT')
              .map((verdict) => verdict.employeeId),
          },
        ),
      );

      return after;
    });
  }

  /**
   * The step the person decides: the one they hold, a pending one before a decided one; otherwise the one of their own line or the
   * first, so that the refusal says why they may not (they are one of the people, or do not hold it).
   */
  private stepOf(
    request: AccessRequestRecord,
    employeeId: string,
    lines: readonly { employeeId: string; needStepId: string }[],
  ): NeedStepWithDecision {
    const held = request.needSteps.filter((step) => step.assigneeEmployeeId === employeeId);
    const named = lines.find((line) => line.employeeId === employeeId);

    return (
      held.find((step) => step.state === 'PENDING') ??
      held[0] ??
      request.needSteps.find((step) => step.id === named?.needStepId) ??
      request.needSteps[0]
    );
  }

  /** A person who holds a seat of the plan since the request was sent is not approved: the line is checked again (`AC-15`). */
  private async assertNobodyHoldsAccess(request: AccessRequestRecord, verdicts: readonly LineVerdict[]): Promise<void> {
    if (request.planId === null) return;
    const holding: string[] = [];
    for (const verdict of verdicts.filter((candidate) => candidate.decision === 'APPROVE')) {
      const { total } = await this.licensing.getSeatsHeldInPlans(verdict.employeeId, [request.planId], {
        skip: 0,
        take: 1,
      });
      if (total > 0) holding.push(verdict.employeeId);
    }
    if (holding.length > 0) throw new GroupRequestLineHoldsAccessError(holding);
  }
}
