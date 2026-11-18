import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import type { AssessmentPatchDto, AssessmentWire } from './assessment.dto';
import { AssessmentRepo } from './assessment.repo';
import { AssessmentGate } from './assessment-gate.service';
import { AssessmentPatchService } from './assessment-patch.service';
import { AssessmentViewService } from './assessment-view.service';

/**
 * Saving the assessment of software that is not in the catalog (`US-05-06`, `US-01-12` AC-2): the IT Admin fills the part of
 * `BM-02` the Employee cannot, in saves that can be made one at a time, and completes it once it says all the minimum
 * asks, the control level and a quote in force. Completing it prices the request and sends it on to be submitted for a
 * spend decision. Nothing here puts the software into the catalog or decides the spend (`SoD-5`): a request that lacks
 * anything stays where it is and nothing is written.
 */
@Injectable()
export class AssessmentService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly gate: AssessmentGate,
    private readonly patches: AssessmentPatchService,
    private readonly assessments: AssessmentRepo,
    private readonly audit: AuditApi,
    private readonly views: AssessmentViewService,
  ) {}

  /** Throws AssessmentRefusedError, AssessmentReferenceNotFoundError, the money errors and AccessRequestNotFoundError. */
  async save(actor: AuthenticatedPrincipal, requestId: string, body: AssessmentPatchDto): Promise<AssessmentWire> {
    return this.runner.run(async (tx) => {
      const request = await this.gate.lockProposal(tx, requestId);
      this.gate.requireAssessor(actor, request);
      const current = await this.gate.requireAssessment(requestId, tx);
      const patch = await this.patches.toPatch(body, current);

      await this.assessments.patch(tx, requestId, patch, actor.employeeId);
      const standsIn = await this.gate.standsIn(tx, requestId, actor);
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.ASSESSMENT_SAVED',
          'ACCESS_REQUEST',
          requestId,
          { requestId, fields: Object.keys(body).join(','), actingForAssignee: standsIn },
        ),
      );

      return this.views.of(request, await this.gate.requireAssessment(requestId, tx), tx);
    });
  }
}
