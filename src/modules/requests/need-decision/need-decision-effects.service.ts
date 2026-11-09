import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { NeedDecisionOutcome } from '../access-request/need-decision.policy';
import { AssessmentStepRepo } from '../assessment/assessment-step.repo';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import { RenewalApplyService } from '../renewal-apply/renewal-apply.service';

/**
 * What follows a decision of the need step in the same transaction (`US-05-04`, `US-05-06` AC-2): a refusal ends the request
 * for the person it was for, a renewal approved in full is applied, software that is not in the catalog goes to the IT Admin in
 * charge, and a request that costs money goes to the spend entry. Returns the request as it stands once all that is written.
 */
@Injectable()
export class NeedDecisionEffects {
  constructor(
    private readonly repo: AccessRequestRepo,
    private readonly steps: AssessmentStepRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly renewals: RenewalApplyService,
    private readonly outcomes: RequestOutcomeService,
  ) {}

  async follow(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    outcome: NeedDecisionOutcome,
    decidedAt: Date,
  ): Promise<AccessRequestRecord> {
    const { approved, requestState } = outcome;
    // A refusal ends the request for the person it was for, without a grant.
    if (!approved) await this.outcomes.ended(tx, request, request.beneficiaryEmployeeIds, decidedAt);

    // A renewal approved in full is extended by the IT Admin (`BR-MF1-08d`): its task is opened here, in the transaction of the decision.
    if (approved && request.type === 'RENEWAL' && requestState === 'AWAITING_EXECUTION') {
      await this.renewals.requestExtension(tx, actor, request, decidedAt);
    }
    if (approved && request.branch === 'NEW_SOFTWARE') await this.requestAssessment(tx, actor, request, decidedAt);

    return this.reread(tx, request.id);
  }

  /**
   * The software is not in the catalog: the IT Admin in charge of the department of the sender assesses it next (`US-05-06` AC-2);
   * with none who still works the step waits and any IT Admin may take it.
   */
  private async requestAssessment(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    decidedAt: Date,
  ): Promise<void> {
    const inCharge = await this.organizationReads.getItAdminInCharge(
      request.requesterEmployeeId,
      await this.organizationReads.businessToday(decidedAt, tx),
    );
    await this.steps.add(tx, {
      requestId: request.id,
      assigneeEmployeeId: inCharge?.itAdminEmployeeId ?? null,
      slaWorkingDays: request.policy.slaWorkingDays,
      now: decidedAt,
    });
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.ASSESSMENT_REQUESTED',
        'ACCESS_REQUEST',
        request.id,
        { requestId: request.id, itAdminEmployeeId: inCharge?.itAdminEmployeeId ?? null },
      ),
    );
  }

  private async reread(tx: DbTx, requestId: string): Promise<AccessRequestRecord> {
    const found = await this.repo.findById(requestId, tx);
    if (!found) throw new Error(`The request ${requestId} was not found after it was decided.`);

    return found;
  }
}
