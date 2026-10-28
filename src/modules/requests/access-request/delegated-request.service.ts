import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { accessRequestAuditEvent } from './access-request-audit-event';
import {
  AccessRequestAlreadyHoldsAccessError,
  AccessRequestNoDepartmentError,
  AccessRequestSuperAdminCannotRequestError,
  DelegatedRequestRefusedError,
} from './access-request.errors';
import { hasSpendStep, mayRequest } from './access-request.policy';
import { AccessRequestRepo } from './access-request.repo';
import type { AccessRequestRecord } from './access-request.types';
import type { DelegatedBodyDto } from './delegated-request.dto';
import { checkDelegation, isHeadOwnShare } from './delegated-request.policy';
import { LONG_TERM_MONTHS, nextRequestState } from './need-decision.policy';
import { RequestAssessmentService, type Assessment } from './request-assessment.service';

/** The row of the routing table of `US-05-03` for a head who sends for somebody else of the department (`AC-6`). */
const DELEGATED_ROW = 5;

/**
 * A head sends requests for the people of the department (`US-03-02`, `US-05-03` rows 5 to 7): one request for every person
 * and every tool, each judged by its own plan, branch and amount, all of them or none. The head is the one who would have
 * confirmed the need, so the sending confirms it: the need step is written approved, by the head, for the person, at the
 * moment, and nobody confirms it again. The head's own share, when they are among the people, is a request like any other
 * of the head, which the approver confirms (`AC-8`). The request is locked to nobody and decides nothing about the spend:
 * one that costs money waits in the queue of the head until they choose a line of the plan and send it on (`AC-13`).
 */
@Injectable()
export class DelegatedRequestService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: AccessRequestRepo,
    private readonly organization: OrganizationService,
    private readonly assessment: RequestAssessmentService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Throws AccessRequestSuperAdminCannotRequestError, DelegatedRequestRefusedError, AccessRequestNoDepartmentError,
   * AccessRequestAlreadyHoldsAccessError and the errors of assessing a plan.
   */
  async send(
    actor: AuthenticatedPrincipal,
    body: DelegatedBodyDto,
  ): Promise<{ batchId: string; records: AccessRequestRecord[] }> {
    if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError();
    const settings = await this.assessment.settings();

    return this.runner.run(async (tx) => {
      await this.organization.lockEmployeeForShare(tx, actor.employeeId);
      const head = await this.organization.getEmployee(actor.employeeId, tx);
      if (!head) throw new AccessRequestNoDepartmentError();
      const now = new Date();
      const today = await this.organization.businessToday(now, tx);
      const headedDepartmentId = await this.headedDepartment(tx, actor.employeeId, today);
      const batchId = randomUUID();

      const records: AccessRequestRecord[] = [];
      for (const beneficiaryId of body.beneficiaryEmployeeIds) {
        // A person who is not in the company is outside the department as far as the head is concerned.
        const exists = await this.organization.getEmployee(beneficiaryId, tx);
        if (!exists) throw new DelegatedRequestRefusedError('OUTSIDE_DEPARTMENT', beneficiaryId);
        await this.organization.lockEmployeeForShare(tx, beneficiaryId);
        const person = await this.organization.getEmployee(beneficiaryId, tx);
        const unit = (await this.organization.getOwningUnits([beneficiaryId], today, tx)).get(beneficiaryId);
        const refusal = person
          ? checkDelegation({
              actorEmployeeId: actor.employeeId,
              actorHeadedDepartmentId: headedDepartmentId,
              beneficiaryEmployeeId: beneficiaryId,
              beneficiaryDepartmentId: unit?.departmentId ?? null,
              beneficiaryActive: person.status === 'ACTIVE',
              beneficiaryWorkEmail: person.workEmail ?? null,
              beneficiaryEmploymentType: person.employmentType,
              beneficiaryHireDate: person.hireDate,
              today,
              expectedEndDate: body.expectedEndDate,
              termMonths: body.termMonths,
              termConfirmed: (body.termConfirmation?.reason ?? '').trim() !== '',
              longTermMonths: LONG_TERM_MONTHS,
            })
          : headedDepartmentId === null
            ? 'NOT_HEAD'
            : 'OUTSIDE_DEPARTMENT';
        if (refusal) throw new DelegatedRequestRefusedError(refusal, beneficiaryId);

        for (const item of body.items) {
          records.push(
            await this.createOne(tx, actor, {
              organizationId: head.organizationId,
              beneficiaryId,
              item,
              body,
              batchId,
              now,
              settings,
            }),
          );
        }
      }

      return { batchId, records };
    });
  }

  /** The department the caller heads today, or null when they head none. */
  private async headedDepartment(tx: DbTx, employeeId: string, today: BusinessDate): Promise<string | null> {
    const own = (await this.organization.getOwningUnits([employeeId], today, tx)).get(employeeId);
    if (!own) return null;
    const heads = await this.organization.getDepartmentHeads([own.departmentId], today);

    return heads.get(own.departmentId)?.employeeId === employeeId ? own.departmentId : null;
  }

  private async createOne(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      beneficiaryId: string;
      item: DelegatedBodyDto['items'][number];
      body: DelegatedBodyDto;
      batchId: string;
      now: Date;
      settings: Awaited<ReturnType<RequestAssessmentService['settings']>>;
    },
  ): Promise<AccessRequestRecord> {
    const { beneficiaryId, item, body, batchId, now } = input;
    const assessed = await this.assessment.assess(tx, {
      employeeId: beneficiaryId,
      requesterEmployeeId: actor.employeeId,
      planId: item.planId,
      termMonths: body.termMonths,
      expectedSpendOn: item.expectedSpendOn,
      now,
      settings: input.settings,
      lockDepartment: true,
    });
    if (assessed.heldAccess) throw new AccessRequestAlreadyHoldsAccessError(assessed.heldAccess);

    const own = isHeadOwnShare({ actorEmployeeId: actor.employeeId, beneficiaryEmployeeId: beneficiaryId });
    const { policy, pricing, unit, routing } = assessed;
    const { decision } = routing;
    const confirmedBySending = !own;
    const assigned = confirmedBySending || decision.outcome === 'ASSIGNED';
    const needStep: Parameters<AccessRequestRepo['insert']>[1]['needStep'] = confirmedBySending
      ? {
          state: 'PENDING' as const,
          assigneeEmployeeId: actor.employeeId,
          routingRow: DELEGATED_ROW,
          waitingReason: null,
          samePersonAsSpend: false,
          slaWorkingDays: policy.slaWorkingDays,
        }
      : this.routedNeedStep(decision, policy.slaWorkingDays);
    const created = await this.repo.insert(tx, {
      organizationId: input.organizationId,
      branch: policy.branch,
      state: assigned ? 'PENDING' : 'WAITING_CONTROLLED',
      planId: item.planId,
      requesterEmployeeId: actor.employeeId,
      beneficiaryEmployeeIds: [beneficiaryId],
      departmentId: unit.departmentId,
      costCenterId: unit.costCenter?.id ?? null,
      businessReason: body.businessReason,
      termMonths: body.termMonths,
      projectLabel: body.projectLabel ?? null,
      pricing,
      policy,
      delegatedBatchId: batchId,
      expectedEndDate: confirmedBySending ? (body.expectedEndDate ?? null) : null,
      createdByAppUserId: actor.appUserId,
      now,
      needStep,
    });

    await this.recordSubmitted(tx, actor, input.organizationId, created, assessed, {
      batchId,
      delegated: confirmedBySending,
      state: assigned ? 'PENDING' : 'WAITING_CONTROLLED',
      beneficiaryId,
      item,
      body,
    });
    if (confirmedBySending) await this.confirmNeed(tx, actor, input.organizationId, created, assessed, body, now);

    const record = await this.repo.findById(created.id, tx);
    if (!record) throw new Error(`The request ${created.id} was not found after it was written.`);

    return record;
  }

  private routedNeedStep(
    decision: Assessment['routing']['decision'],
    slaWorkingDays: number,
  ): Parameters<AccessRequestRepo['insert']>[1]['needStep'] {
    const assigned = decision.outcome === 'ASSIGNED';

    return {
      state: assigned ? 'PENDING' : 'WAITING',
      assigneeEmployeeId: assigned ? decision.assigneeEmployeeId : null,
      routingRow: decision.row,
      waitingReason: assigned ? null : decision.reason,
      samePersonAsSpend: assigned && decision.samePersonAsSpend,
      slaWorkingDays,
    };
  }

  /** The need step is approved by the head in the moment of sending: the record is the head's, for the person (`AC-1`, `US-05-03` AC-6). */
  private async confirmNeed(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    created: { id: string; needStepId: string },
    assessed: Assessment,
    body: DelegatedBodyDto,
    now: Date,
  ): Promise<void> {
    const requestState = nextRequestState(assessed.policy.branch);
    await this.repo.recordNeedDecision(tx, {
      organizationId,
      requestId: created.id,
      stepId: created.needStepId,
      requestState,
      departmentId: assessed.unit.departmentId,
      record: {
        decision: 'APPROVED',
        decidedByEmployeeId: actor.employeeId,
        deciderRole: 'MANAGER',
        reason: null,
        termConfirmationReason: body.termConfirmation?.reason.trim() ?? null,
        decidedAt: now,
      },
    });
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        organizationId,
        'ACCESS_REQUEST.NEED_APPROVED',
        'ACCESS_REQUEST_STEP',
        created.needStepId,
        {
          requestId: created.id,
          decision: 'APPROVED',
          assigneeEmployeeId: actor.employeeId,
          decidedByEmployeeId: actor.employeeId,
          deciderRole: 'MANAGER',
          departmentId: assessed.unit.departmentId,
          requestState,
          termConfirmed: body.termConfirmation !== undefined,
          delegated: true,
        },
      ),
    );
  }

  private async recordSubmitted(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    created: { id: string; needStepId: string },
    assessed: Assessment,
    extra: {
      batchId: string;
      delegated: boolean;
      state: string;
      beneficiaryId: string;
      item: DelegatedBodyDto['items'][number];
      body: DelegatedBodyDto;
    },
  ): Promise<void> {
    const { policy, pricing, unit, routing } = assessed;
    const { decision } = routing;
    await this.audit.record(
      tx,
      accessRequestAuditEvent(actor, organizationId, 'ACCESS_REQUEST.SUBMITTED', 'ACCESS_REQUEST', created.id, {
        branch: policy.branch,
        state: extra.state,
        planId: extra.item.planId,
        termMonths: extra.body.termMonths,
        requesterEmployeeId: actor.employeeId,
        beneficiaryEmployeeIds: [extra.beneficiaryId],
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
        delegated: extra.delegated,
        delegatedBatchId: extra.batchId,
        expectedEndDate: extra.body.expectedEndDate ?? null,
      }),
    );
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        organizationId,
        'ACCESS_REQUEST.NEED_STEP_ROUTED',
        'ACCESS_REQUEST_STEP',
        created.needStepId,
        {
          requestId: created.id,
          routingRow: extra.delegated ? DELEGATED_ROW : decision.row,
          outcome: extra.delegated ? 'CONFIRMED_BY_SENDING' : decision.outcome,
          assigneeEmployeeId: extra.delegated
            ? actor.employeeId
            : decision.outcome === 'ASSIGNED'
              ? decision.assigneeEmployeeId
              : null,
          role: extra.delegated ? 'MANAGER' : decision.outcome === 'ASSIGNED' ? decision.role : null,
          waitingReason: !extra.delegated && decision.outcome === 'WAITING' ? decision.reason : null,
          samePersonAsSpend: !extra.delegated && decision.outcome === 'ASSIGNED' && decision.samePersonAsSpend,
          requesterEmployeeId: actor.employeeId,
          beneficiaryEmployeeId: extra.beneficiaryId,
          departmentId: unit.departmentId,
          departmentHeadEmployeeId: routing.departmentHeadEmployeeId,
        },
      ),
    );
  }
}
