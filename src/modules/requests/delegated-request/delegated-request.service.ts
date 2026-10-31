import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import {
  AccessRequestAlreadyHoldsAccessError,
  AccessRequestNoDepartmentError,
  AccessRequestSuperAdminCannotRequestError,
  DelegatedRequestRefusedError,
} from '../access-request/access-request.errors';
import { mayRequest } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { LONG_TERM_MONTHS, nextRequestState } from '../access-request/need-decision.policy';
import { RequestFactsService } from '../access-request/request-facts.service';
import type { DelegatedBodyDto } from './delegated-request.dto';
import { checkDelegation, isHeadOwnShare } from './delegated-request.policy';
import {
  delegatedRequestOf,
  delegatedRoutedDetail,
  delegatedSubmittedDetail,
  type DelegatedSubmission,
} from './delegated-request-submission.mapper';

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
    private readonly organizationReads: OrganizationReadApi,
    private readonly assessment: RequestFactsService,
    private readonly audit: AuditApi,
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
      await this.organizationReads.lockEmployeeForShare(tx, actor.employeeId);
      const head = await this.organizationReads.getEmployee(actor.employeeId, tx);
      if (!head) throw new AccessRequestNoDepartmentError();
      const now = new Date();
      const today = await this.organizationReads.businessToday(now, tx);
      const headedDepartmentId = await this.headedDepartment(tx, actor.employeeId, today);
      const batchId = randomUUID();

      const records: AccessRequestRecord[] = [];
      for (const beneficiaryId of body.beneficiaryEmployeeIds) {
        await this.requireDelegable(tx, actor, { beneficiaryId, headedDepartmentId, today }, body);
        for (const item of body.items) {
          const input = { organizationId: head.organizationId, beneficiaryId, item, body, batchId, now, settings };
          records.push(await this.createOne(tx, actor, input));
        }
      }

      return { batchId, records };
    });
  }

  /** The department the caller heads today, or null when they head none. */
  private async headedDepartment(tx: DbTx, employeeId: string, today: BusinessDate): Promise<string | null> {
    const own = (await this.organizationReads.getOwningUnits([employeeId], today, tx)).get(employeeId);
    if (!own) return null;
    const heads = await this.organizationReads.getDepartmentHeads([own.departmentId], today);

    return heads.get(own.departmentId)?.employeeId === employeeId ? own.departmentId : null;
  }

  /** The person is locked while the head sends for them; a person who is not in the company is outside the department as far as the head is concerned. */
  private async requireDelegable(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    who: { beneficiaryId: string; headedDepartmentId: string | null; today: BusinessDate },
    body: DelegatedBodyDto,
  ): Promise<void> {
    const { beneficiaryId, headedDepartmentId, today } = who;
    const exists = await this.organizationReads.getEmployee(beneficiaryId, tx);
    if (!exists) throw new DelegatedRequestRefusedError('OUTSIDE_DEPARTMENT', beneficiaryId);
    await this.organizationReads.lockEmployeeForShare(tx, beneficiaryId);
    const person = await this.organizationReads.getEmployee(beneficiaryId, tx);
    const unit = (await this.organizationReads.getOwningUnits([beneficiaryId], today, tx)).get(beneficiaryId);
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
      settings: Awaited<ReturnType<RequestFactsService['settings']>>;
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

    const sent: DelegatedSubmission = {
      actor,
      organizationId: input.organizationId,
      beneficiaryId,
      delegated: !isHeadOwnShare({ actorEmployeeId: actor.employeeId, beneficiaryEmployeeId: beneficiaryId }),
      item,
      body,
      batchId,
      now,
      assessed,
    };
    const created = await this.repo.insert(tx, delegatedRequestOf(sent));
    await this.auditSubmitted(tx, actor, sent, created);
    if (sent.delegated) await this.confirmNeed(tx, actor, { sent, created, confirmation: body.termConfirmation });

    const record = await this.repo.findById(created.id, tx);
    if (!record) throw new Error(`The request ${created.id} was not found after it was written.`);

    return record;
  }

  /** The need step is approved by the head in the moment of sending: the record is the head's, for the person (`AC-1`, `US-05-03` AC-6). */
  private async confirmNeed(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    done: {
      sent: DelegatedSubmission;
      created: { id: string; needStepId: string };
      confirmation: DelegatedBodyDto['termConfirmation'];
    },
  ): Promise<void> {
    const { sent, created, confirmation } = done;
    const { organizationId, now } = sent;
    const requestState = nextRequestState(sent.assessed.policy.branch);
    await this.repo.recordNeedDecision(tx, {
      organizationId,
      requestId: created.id,
      stepId: created.needStepId,
      requestState,
      departmentId: sent.assessed.unit.departmentId,
      record: {
        decision: 'APPROVED',
        decidedByEmployeeId: actor.employeeId,
        deciderRole: 'MANAGER',
        reason: null,
        termConfirmationReason: confirmation?.reason.trim() ?? null,
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
          departmentId: sent.assessed.unit.departmentId,
          requestState,
          termConfirmed: confirmation !== undefined,
          delegated: true,
        },
      ),
    );
  }

  /** The request is sent, and the need step is routed (or confirmed by the sending): two entries in the transaction of the request. */
  private async auditSubmitted(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    sent: DelegatedSubmission,
    created: { id: string; needStepId: string },
  ): Promise<void> {
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        sent.organizationId,
        'ACCESS_REQUEST.SUBMITTED',
        'ACCESS_REQUEST',
        created.id,
        delegatedSubmittedDetail(sent),
      ),
    );
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        sent.organizationId,
        'ACCESS_REQUEST.NEED_STEP_ROUTED',
        'ACCESS_REQUEST_STEP',
        created.needStepId,
        delegatedRoutedDetail(sent, created.id),
      ),
    );
  }
}
