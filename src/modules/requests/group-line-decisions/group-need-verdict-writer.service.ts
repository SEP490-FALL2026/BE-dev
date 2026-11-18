import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import type { AccessRequestRecord, NeedStepWithDecision } from '../access-request/access-request.types';
import type { DeciderRole } from '../access-request/need-decision.policy';
import { needLineState, type LineVerdict } from '../group-request/group-line-decision.policy';
import { LineDecisionRepo } from '../group-request/line-decision.repo';
import { RequestLineRepo } from '../group-request/request-line.repo';
import { RequestOutcomeService } from '../outcome/request-outcome.service';

/**
 * Writes what the person decided of each of their people (`US-05-17` AC-3, AC-4): the decisions, the move of each line (a person
 * who was refused ends for them, with the reason), the audit entry of every line, and the end of the request for the people refused.
 */
@Injectable()
export class GroupNeedVerdictWriter {
  constructor(
    private readonly lines: RequestLineRepo,
    private readonly decisions: LineDecisionRepo,
    private readonly audit: AuditApi,
    private readonly outcomes: RequestOutcomeService,
  ) {}

  async write(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    decided: {
      request: AccessRequestRecord;
      step: NeedStepWithDecision;
      verdicts: readonly LineVerdict[];
      deciderRole: DeciderRole;
      now: Date;
    },
  ): Promise<void> {
    const { request, step, verdicts, deciderRole, now } = decided;
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
      // The line of a person who was refused ended for them without a grant.
      if (rejected) await this.outcomes.ended(tx, request, [verdict.employeeId], now);
    }
  }
}
