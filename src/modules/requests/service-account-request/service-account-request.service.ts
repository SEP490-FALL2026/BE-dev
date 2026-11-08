import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { LicensingSeatBaselineApi } from '../../licensing/public/licensing-seat-baseline.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import {
  AccessRequestNotDraftError,
  AccessRequestNotFoundError,
  AccessRequestSuperAdminCannotRequestError,
  AccessRequestTermBeyondLimitError,
} from '../access-request/access-request.errors';
import { hasSpendStep, mayRequest } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { RequestSenderService } from '../request-intake/request-sender.service';
import { RequestDraftRepo } from '../request-draft/request-draft.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestFactsService } from '../access-request/request-facts.service';
import type { ServiceAccountSubmitBodyDto } from './service-account-request.dto';
import { ServiceAccountSubmitRefusedError } from './service-account-request.errors';
import { submitRefusal } from './service-account-request.policy';
import { ServiceAccountRequestRepo } from './service-account-request.repo';

/**
 * Sending a request for a service account (`US-05-21` AC-1, AC-2): the person asks for the account of a non-human subject
 * for themselves, and answers for it. It is the same request as any other, so the facts it is judged by are read by the same
 * `RequestFactsService`, and every step after it (the need, the spend, the commitment) is the one of the plan: the
 * department and Unit Cost Center are those of the sender on the day, the branch and the chain come from the kind of the
 * application, and a paid plan always has its spend step whatever seats the subscription has left (`QĐ-82m` C). What is
 * particular is the detail (purpose, expected identifier, who answers) and the two rules of `submitRefusal`. The request,
 * its detail and its audit events are written in one transaction, so a refused request leaves nothing behind. Neither the
 * purpose nor the identifier enters an audit event.
 */
@Injectable()
export class ServiceAccountRequestService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly details: ServiceAccountRequestRepo,
    private readonly sender: RequestSenderService,
    private readonly assessment: RequestFactsService,
    private readonly licensingBaseline: LicensingSeatBaselineApi,
    private readonly audit: AuditApi,
    private readonly drafts: RequestDraftRepo,
  ) {}

  /**
   * Throws AccessRequestSuperAdminCannotRequestError, AccessRequestNoDepartmentError, AccessRequestPlanNotFoundError,
   * AccessRequestApplicationRetiredError, AccessRequestSpendDateNotAllowedError and ServiceAccountSubmitRefusedError. A draft (draftId)
   * is the request being sent: it is locked first, judged again under the lock, and its row becomes the request;
   * AccessRequestNotFoundError and AccessRequestNotDraftError.
   */
  async submit(
    actor: AuthenticatedPrincipal,
    body: ServiceAccountSubmitBodyDto,
    options: { draftId?: string } = {},
  ): Promise<AccessRequestRecord> {
    if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError();
    const settings = await this.assessment.settings();
    const baseline = await this.licensingBaseline.getBaselineProgress();

    return this.runner.run(async (tx) => {
      if (options.draftId) {
        const verdict = await this.drafts.lockOwned(tx, options.draftId, actor.employeeId);
        if (verdict === 'NOT_FOUND') throw new AccessRequestNotFoundError();
        if (verdict === 'NOT_DRAFT') throw new AccessRequestNotDraftError();
      }
      // The sender is relied on until commit (they cannot leave the company between the check and the write), and is judged as a party
      // of a Request before any department is read (`D-S21`).
      const employee = await this.sender.lockEligible(tx, actor);

      const now = new Date();
      const assessed = await this.assessment.assess(tx, {
        employeeId: actor.employeeId,
        planId: body.planId,
        termMonths: body.termMonths,
        now,
        settings,
        lockDepartment: true,
        // The seat it ends in is charged to the Unit of the department, free or not (`QĐ-86a`).
        chargedToUnit: true,
      });
      if (assessed.termBeyondLimit) {
        throw new AccessRequestTermBeyondLimitError(assessed.termLimit.maxMonths);
      }
      const refusal = submitRefusal({
        baselineClosed: baseline.closed,
        provisioningType: assessed.target.provisioningType,
      });
      if (refusal) throw new ServiceAccountSubmitRefusedError(refusal);

      // INV-02 compares personal seats only, and the toolset of a person says nothing of a non-human subject: neither stops it.
      const { unit, policy, pricing, routing } = assessed;
      const { decision, departmentHeadEmployeeId } = routing;
      const assigned = decision.outcome === 'ASSIGNED';
      const state = assigned ? 'PENDING' : 'WAITING_CONTROLLED';
      const created = await this.requests.insert(tx, {
        type: 'SERVICE_ACCOUNT',
        organizationId: employee.organizationId,
        branch: policy.branch,
        state,
        planId: body.planId,
        requesterEmployeeId: actor.employeeId,
        beneficiaryEmployeeIds: [actor.employeeId],
        departmentId: unit.departmentId,
        costCenterId: unit.costCenter?.id ?? null,
        businessReason: body.businessReason,
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
        draftId: options.draftId ?? null,
      });
      await this.details.insert(tx, {
        requestId: created.id,
        purpose: body.purpose,
        expectedIdentifier: body.expectedIdentifier,
        responsibleEmployeeId: actor.employeeId,
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
            type: 'SERVICE_ACCOUNT',
            branch: policy.branch,
            state,
            planId: body.planId,
            termMonths: body.termMonths,
            requesterEmployeeId: actor.employeeId,
            beneficiaryEmployeeIds: [actor.employeeId],
            departmentId: unit.departmentId,
            costCenterId: unit.costCenter?.id ?? null,
            policyVersion: policy.version,
            hasSpendStep: hasSpendStep(policy),
            slaWorkingDays: policy.slaWorkingDays,
            pricingStatus: pricing.status,
            amountMinor: pricing.amount?.amountMinor.toString() ?? null,
            amountCurrency: pricing.amount?.currency ?? null,
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
            type: 'SERVICE_ACCOUNT',
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

      const record = await this.requests.findById(created.id, tx);
      if (!record) throw new Error(`The request ${created.id} was not found after it was written.`);

      return record;
    });
  }
}
