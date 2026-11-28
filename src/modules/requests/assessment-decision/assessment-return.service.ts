import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { AssessmentReturnBody } from '../assessment/assessment.dto';
import { AssessmentGate } from '../assessment/assessment-gate.service';

/**
 * The IT Admin sends a proposal back to the person who asked (`QĐ-111ap`, R-24): something is missing from what the person wrote or from the
 * software, and they add it and send it again. Unlike a refusal the request does not end: it waits for its sender (`AWAITING_REQUESTER_REVISION`), the
 * step of the IT Admin is closed and the assessment keeps what was filled in. The reason is typed or filled in from the questions answered No. The
 * sender sending it again opens a new step for the IT Admin (`RequestResubmissionService`).
 */
@Injectable()
export class AssessmentReturnService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly gate: AssessmentGate,
    private readonly requests: AccessRequestRepo,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Throws AssessmentRefusedError and AccessRequestNotFoundError, and what the checklist of the step refuses (`PolicyVersionChangedError`,
   * `PolicyChecklistIncompleteError`, `PolicyDecisionReasonRequiredError`).
   */
  async send(
    actor: AuthenticatedPrincipal,
    requestId: string,
    body: AssessmentReturnBody,
  ): Promise<AccessRequestRecord> {
    return this.runner.run(async (tx) => {
      const request = await this.gate.lockProposal(tx, requestId);
      const { bySubstitute } = await this.gate.requireAssessor(tx, actor, request);
      const { verdict, reason } = await this.gate.judgeRefusal(tx, request, {
        decision: 'RETURN',
        checklist: body.checklist,
        reason: body.reason,
      });

      const now = new Date();
      await this.requests.setState(tx, requestId, 'AWAITING_REQUESTER_REVISION');
      const standsIn = await this.gate.finishStep(tx, requestId, actor, { now, outcome: 'CLOSED' });
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.ASSESSMENT_RETURNED',
          'ACCESS_REQUEST',
          requestId,
          {
            requestId,
            reason,
            actingForAssignee: standsIn,
            ...(bySubstitute ? { bySubstitute: true } : {}),
            requestState: 'AWAITING_REQUESTER_REVISION',
          },
        ),
      );
      await this.gate.keepChecklist(tx, actor, request, { verdict, decision: 'RETURN', decidedAt: now });

      const record = await this.requests.findById(requestId, tx);
      if (!record) throw new Error(`The request ${requestId} was not found after its assessment was sent back.`);

      return record;
    });
  }
}
