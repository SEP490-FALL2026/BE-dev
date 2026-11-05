import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestSuperAdminCannotRequestError } from '../access-request/access-request.errors';
import { hasSpendStep, mayRequest } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestSenderService } from '../request-intake/request-sender.service';
import { AssessmentRepo } from './assessment.repo';
import { RequestFactsService } from '../access-request/request-facts.service';
import type { ProposalBodyDto } from './assessment.dto';

/**
 * Sending a proposal of software that is not in the catalog (`US-05-06` AC-1, `US-05-02` AC-8): the Employee names it,
 * says what it is for and what company data will go through it, and the request takes the third branch — the need, the
 * assessment of the IT Admin, the spend decision, the grant. The assessment (`BM-02`) is opened empty for the IT Admin,
 * who completes it once the need is approved; the Employee never fills its part. The purpose is the reason of the request.
 * It has no plan, no price and no seat yet, and the need step is given by the same routing table as any other request.
 */
@Injectable()
export class ProposalService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: AccessRequestRepo,
    private readonly assessments: AssessmentRepo,
    private readonly sender: RequestSenderService,
    private readonly assessment: RequestFactsService,
    private readonly audit: AuditApi,
  ) {}

  /** Throws AccessRequestSuperAdminCannotRequestError, AccessRequestNoDepartmentError and FinanceSetupIncompleteError. */
  async submit(actor: AuthenticatedPrincipal, body: ProposalBodyDto): Promise<AccessRequestRecord> {
    if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError();
    const settings = await this.assessment.settings();

    return this.runner.run(async (tx) => {
      const employee = await this.sender.lockEligible(tx, actor);

      const now = new Date();
      const assessed = await this.assessment.assessProposal(tx, {
        employeeId: actor.employeeId,
        now,
        settings,
        lockDepartment: true,
      });
      const { unit, policy, pricing, routing } = assessed;
      const { decision, departmentHeadEmployeeId } = routing;
      const assigned = decision.outcome === 'ASSIGNED';
      const state = assigned ? 'PENDING' : 'WAITING_CONTROLLED';

      const created = await this.repo.insert(tx, {
        organizationId: employee.organizationId,
        branch: policy.branch,
        state,
        planId: null,
        requesterEmployeeId: actor.employeeId,
        beneficiaryEmployeeIds: [actor.employeeId],
        departmentId: unit.departmentId,
        costCenterId: unit.costCenter.id,
        businessReason: body.purpose,
        termMonths: body.termMonths,
        pricing,
        policy,
        createdByAppUserId: actor.appUserId,
        now,
        needStep: {
          state: assigned ? 'PENDING' : 'WAITING',
          assigneeEmployeeId: assigned ? decision.assigneeEmployeeId : null,
          routingRow: decision.row,
          waitingReason: assigned ? null : decision.reason,
          samePersonAsSpend: assigned && decision.samePersonAsSpend,
          slaWorkingDays: policy.slaWorkingDays,
        },
      });
      await this.assessments.open(tx, created.id, {
        softwareName: body.softwareName,
        homepageUrl: body.homepageUrl,
        purpose: body.purpose,
        dataDescription: body.dataDescription,
        expectedUsers: body.expectedUsers,
      });

      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          employee.organizationId,
          'ACCESS_REQUEST.SUBMITTED',
          'ACCESS_REQUEST',
          created.id,
          {
            branch: policy.branch,
            state,
            planId: null,
            softwareName: body.softwareName,
            expectedUsers: body.expectedUsers,
            termMonths: body.termMonths,
            requesterEmployeeId: actor.employeeId,
            beneficiaryEmployeeIds: [actor.employeeId],
            departmentId: unit.departmentId,
            costCenterId: unit.costCenter.id,
            policyVersion: policy.version,
            hasSpendStep: hasSpendStep(policy),
            slaWorkingDays: policy.slaWorkingDays,
            pricingStatus: pricing.status,
            budgetYear: pricing.budgetYear,
            expectedSpendOn: pricing.expectedSpendOn,
          },
        ),
      );
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          employee.organizationId,
          'ACCESS_REQUEST.NEED_STEP_ROUTED',
          'ACCESS_REQUEST_STEP',
          created.needStepId,
          {
            requestId: created.id,
            routingRow: decision.row,
            outcome: decision.outcome,
            assigneeEmployeeId: assigned ? decision.assigneeEmployeeId : null,
            role: assigned ? decision.role : null,
            waitingReason: assigned ? null : decision.reason,
            samePersonAsSpend: assigned && decision.samePersonAsSpend,
            requesterEmployeeId: actor.employeeId,
            departmentId: unit.departmentId,
            departmentHeadEmployeeId,
          },
        ),
      );

      const record = await this.repo.findById(created.id, tx);
      if (!record) throw new Error(`The request ${created.id} was not found after it was written.`);

      return record;
    });
  }
}
