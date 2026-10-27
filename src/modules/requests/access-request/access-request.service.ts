import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { accessRequestAuditEvent } from './access-request-audit-event';
import { AccessRequestAlreadyHoldsAccessError, AccessRequestNoDepartmentError } from './access-request.errors';
import { hasSpendStep } from './access-request.policy';
import { AccessRequestRepo } from './access-request.repo';
import type { AccessRequestRecord } from './access-request.types';
import { RequestAssessmentService, type RequestSettings } from './request-assessment.service';
import type { SubmitBodyDto } from './access-request.dto';

/**
 * Sending a request (`US-05-02`, `US-05-03`, `US-01-12` AC-1): the caller asks for access to one plan for themselves. The
 * branch and the chain of steps come from the kind of the application, the department and its Unit Cost Center from the
 * day the request is sent, and the need step is given to the one person the routing table names, or left waiting under
 * control when nobody valid exists. Everything is written in one transaction with its audit events, so a request never
 * exists without them and a refused request leaves nothing behind. What the request is judged by is read by
 * `RequestAssessmentService`, the same read the preview before sending shows.
 */
/** What a sending that is not the plain one says: the seat that is not held against the sender, and the day the access ends. */
export interface SubmitOptions {
  /**
   * The seat a request for the renewal of a right that has ended leaves out of the check of the seat the person holds: it is the
   * seat the new request is for, still held because its revocation has not been done (`US-05-14` AC-5).
   */
  toleratedSeatId?: string;
  /** The day the access ends: the end the person asked for when a renewal was sent after the end of the right. */
  expectedEndDate?: BusinessDate;
}

@Injectable()
export class AccessRequestService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: AccessRequestRepo,
    private readonly organization: OrganizationService,
    private readonly assessment: RequestAssessmentService,
    private readonly audit: AuditService,
  ) {}

  async submit(
    actor: AuthenticatedPrincipal,
    body: SubmitBodyDto,
    options: SubmitOptions = {},
  ): Promise<AccessRequestRecord> {
    const settings = await this.assessment.settings();

    return this.runner.run((tx) => this.submitWithin(tx, actor, body, settings, options));
  }

  /**
   * Sends the request in the transaction of the caller, which has read the settings before it opened (the renewal of a right
   * that has ended becomes a request like this one, in the transaction in which it was judged).
   */
  async submitWithin(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    body: SubmitBodyDto,
    settings: RequestSettings,
    options: SubmitOptions = {},
  ): Promise<AccessRequestRecord> {
    // The person sending is relied on until commit: they cannot be removed from the company between the check and the write.
    await this.organization.lockEmployeeForShare(tx, actor.employeeId);
    const employee = await this.organization.getEmployee(actor.employeeId, tx);
    if (!employee) throw new AccessRequestNoDepartmentError();

    const now = new Date();
    const assessed = await this.assessment.assess(tx, {
      employeeId: actor.employeeId,
      planId: body.planId,
      termMonths: body.termMonths,
      expectedSpendOn: body.expectedSpendOn,
      now,
      settings,
      lockDepartment: true,
    });
    const { unit, policy, pricing, routing } = assessed;
    const { decision, departmentHeadEmployeeId } = routing;
    if (assessed.heldAccess && assessed.heldAccess.assignmentId !== options.toleratedSeatId) {
      throw new AccessRequestAlreadyHoldsAccessError(assessed.heldAccess);
    }

    const assigned = decision.outcome === 'ASSIGNED';
    const created = await this.repo.insert(tx, {
      organizationId: employee.organizationId,
      branch: policy.branch,
      state: assigned ? 'PENDING' : 'WAITING_CONTROLLED',
      planId: body.planId,
      requesterEmployeeId: actor.employeeId,
      beneficiaryEmployeeIds: [actor.employeeId],
      departmentId: unit.departmentId,
      costCenterId: unit.costCenter.id,
      businessReason: body.businessReason,
      termMonths: body.termMonths,
      projectLabel: body.projectLabel ?? null,
      expectedEndDate: options.expectedEndDate ?? null,
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
          state: assigned ? 'PENDING' : 'WAITING_CONTROLLED',
          planId: body.planId,
          termMonths: body.termMonths,
          requesterEmployeeId: actor.employeeId,
          beneficiaryEmployeeIds: [actor.employeeId],
          departmentId: unit.departmentId,
          costCenterId: unit.costCenter.id,
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
  }
}
