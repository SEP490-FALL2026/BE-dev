import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import type { AssessmentRejectionBodyDto } from './assessment.dto';
import { AssessmentReferenceNotFoundError } from './assessment.errors';
import { AssessmentRepo } from './assessment.repo';
import { AssessmentGate } from './assessment-gate.service';

/**
 * The IT Admin refuses at the gate of the assessment (`US-05-18`): a tool that cannot be controlled, or software that is not
 * eligible for the catalog. The reason is required, the alternative is optional (it may be a plan of the catalog, a note, or
 * nothing). The request ends there: no spend step, no snapshot, no commitment, and the spending approver is never asked.
 */
@Injectable()
export class AssessmentRejectionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly gate: AssessmentGate,
    private readonly catalog: CatalogApi,
    private readonly assessments: AssessmentRepo,
    private readonly requests: AccessRequestRepo,
    private readonly audit: AuditApi,
    private readonly outcomes: RequestOutcomeService,
  ) {}

  /** Throws AssessmentRefusedError, AssessmentReferenceNotFoundError and AccessRequestNotFoundError. */
  async reject(
    actor: AuthenticatedPrincipal,
    requestId: string,
    body: AssessmentRejectionBodyDto,
  ): Promise<AccessRequestRecord> {
    return this.runner.run(async (tx) => {
      const request = await this.gate.lockProposal(tx, requestId);
      this.gate.requireAssessor(actor, request);
      if (
        body.alternativePlanId !== undefined &&
        (await this.catalog.getPlanSummaries([body.alternativePlanId])).length === 0
      ) {
        throw new AssessmentReferenceNotFoundError('alternativePlanId');
      }

      const now = new Date();
      await this.assessments.reject(tx, requestId, {
        kind: body.kind,
        reason: body.reason,
        alternativePlanId: body.alternativePlanId ?? null,
        alternativeNote: body.alternativeNote ?? null,
        employeeId: actor.employeeId,
        now,
      });
      await this.requests.setState(tx, requestId, 'IT_REJECTED');
      const standsIn = await this.gate.finishStep(tx, requestId, actor, { now, outcome: 'REJECTED' });
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.ASSESSMENT_REJECTED',
          'ACCESS_REQUEST',
          requestId,
          {
            requestId,
            kind: body.kind,
            alternativePlanId: body.alternativePlanId ?? null,
            withAlternative: body.alternativePlanId !== undefined || body.alternativeNote !== undefined,
            actingForAssignee: standsIn,
          },
        ),
      );
      await this.outcomes.ended(tx, request, request.beneficiaryEmployeeIds, now);

      const record = await this.requests.findById(requestId, tx);
      if (!record) throw new Error(`The request ${requestId} was not found after its assessment was refused.`);

      return record;
    });
  }
}
