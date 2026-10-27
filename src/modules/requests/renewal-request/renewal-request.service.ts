import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { AssignmentNotFoundError } from '../../licensing/licensing.errors';
import { LicensingService } from '../../licensing/licensing.service';
import type { AssignmentFacts } from '../../licensing/licensing-renewal.types';
import { OrganizationService } from '../../organization/organization.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import { TERM_MONTHS_MAX } from '../access-request/access-request.dto';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { AccessRequestService } from '../access-request/access-request.service';
import { LONG_TERM_MONTHS, nextRequestState } from '../access-request/need-decision.policy';
import {
  RequestAssessmentService,
  type Assessment,
  type RequestSettings,
} from '../access-request/request-assessment.service';
import { RenewalApplyService } from './renewal-apply.service';
import { DELEGATED_ROW, RenewalRequestTrail } from './renewal-request-trail';
import type { RenewalBodyDto } from './renewal-request.dto';
import { RenewalRequestRefusedError } from './renewal-request.errors';
import { checkNewEnd, checkRenewable, checkRenewalSender, monthsBetween, routeRenewal } from './renewal-request.policy';
import { RenewalRequestRepo } from './renewal-request.repo';

export interface RenewalSubmitted {
  /** The renewal was requested, or the right had ended and what was made is a request like any other. */
  outcome: 'RENEWAL_REQUESTED' | 'NEW_REQUEST';
  record: AccessRequestRecord;
}

/**
 * Asking to renew a right that ends on a day (`US-05-14`). The old record is not edited: a request of its own is made, of the
 * kind RENEWAL, for the same tool and the person who holds it, and it is decided like any request (the need step, and for paid
 * software the spend step and its commitment). Sent up to the end of the right (today counts), the right is left as it is until a
 * decision comes (`AC-4`); sent after it, what is made is a request for the tool like any other, not a renewal (`AC-5`). The seat
 * is locked first, so two requests for one seat leave one. The head who sends it for somebody of the department confirms the need
 * by sending, as for any request a head sends for the people of the department. Approval is `RenewalApplyService`'s. Neither the
 * reason nor the identifier of the account enters an audit event.
 */
@Injectable()
export class RenewalRequestService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly renewals: RenewalRequestRepo,
    private readonly accessRequests: AccessRequestService,
    private readonly assessment: RequestAssessmentService,
    private readonly organization: OrganizationService,
    private readonly licensing: LicensingService,
    private readonly apply: RenewalApplyService,
    private readonly trail: RenewalRequestTrail,
    private readonly audit: AuditService,
  ) {}

  /**
   * Throws RenewalRequestRefusedError and the errors of sending a request (the plan or its application, the department, the seat
   * the person already holds, the reason of a tool outside the standard toolset).
   */
  async submit(actor: AuthenticatedPrincipal, body: RenewalBodyDto): Promise<RenewalSubmitted> {
    const settings = await this.assessment.settings();

    return this.runner.run(async (tx) => {
      const now = new Date();
      const today = await this.organization.businessToday(now, tx);
      const facts = await this.lockedFacts(tx, body.assignmentId);
      const holderUnit = (await this.organization.getOwningUnits([facts.employeeId], today, tx)).get(facts.employeeId);
      const headed = await this.organization.getHeadedDepartment(actor.employeeId, today);
      const sender = checkRenewalSender({
        actorEmployeeId: actor.employeeId,
        holderEmployeeId: facts.employeeId,
        holderDepartmentId: holderUnit?.departmentId ?? null,
        actorHeadedDepartmentId: headed?.departmentId ?? null,
      });
      if (!sender.ok) throw new RenewalRequestRefusedError(sender.refusal);

      const problem = checkRenewable(facts);
      if (problem || facts.expectedEndDate === null) {
        throw new RenewalRequestRefusedError('ASSIGNMENT_NOT_RENEWABLE', problem ?? 'NO_END_DATE');
      }
      const previousEnd = facts.expectedEndDate;
      const endRefusal = checkNewEnd({
        today,
        previousEnd,
        newEnd: body.newExpectedEndDate,
        maxTermMonths: TERM_MONTHS_MAX,
      });
      if (endRefusal) throw new RenewalRequestRefusedError(endRefusal);

      if (routeRenewal({ today, previousEnd }) === 'NEW_REQUEST') {
        if (sender.byHead) throw new RenewalRequestRefusedError('END_PASSED');

        return this.redirect(tx, actor, { body, facts, today, settings, previousEnd });
      }
      if (await this.renewals.hasOpenFor(facts.assignmentId, tx))
        throw new RenewalRequestRefusedError('ALREADY_REQUESTED');

      return this.renew(tx, actor, { body, facts, settings, previousEnd, byHead: sender.byHead, now });
    });
  }

  /** The seat, read under the lock of its subscription and then of itself. Throws RenewalRequestRefusedError. */
  private async lockedFacts(tx: DbTx, assignmentId: string): Promise<AssignmentFacts> {
    try {
      return await this.licensing.getAssignmentFacts(tx, assignmentId, { lock: true });
    } catch (error) {
      if (error instanceof AssignmentNotFoundError) throw new RenewalRequestRefusedError('ASSIGNMENT_NOT_FOUND');
      throw error;
    }
  }

  /** The right has ended: the person asks for the tool again, as for any tool, for the term from today to the end they gave. */
  private async redirect(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      body: RenewalBodyDto;
      facts: AssignmentFacts;
      today: BusinessDate;
      settings: RequestSettings;
      previousEnd: BusinessDate;
    },
  ): Promise<RenewalSubmitted> {
    const { body, facts } = input;
    const termMonths = monthsBetween(input.today, body.newExpectedEndDate);
    const record = await this.accessRequests.submitWithin(
      tx,
      actor,
      {
        planId: facts.planId,
        businessReason: body.businessReason,
        termMonths,
        ...(body.projectLabel === undefined ? {} : { projectLabel: body.projectLabel }),
        ...(body.expectedSpendOn === undefined ? {} : { expectedSpendOn: body.expectedSpendOn }),
      },
      input.settings,
      { toleratedSeatId: facts.assignmentId, expectedEndDate: body.newExpectedEndDate },
    );
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        record.organizationId,
        'ACCESS_REQUEST.RENEWAL_REDIRECTED',
        'ACCESS_REQUEST',
        record.id,
        {
          requestId: record.id,
          assignmentId: facts.assignmentId,
          previousExpectedEndDate: input.previousEnd,
          newExpectedEndDate: body.newExpectedEndDate,
          termMonths,
        },
      ),
    );

    return { outcome: 'NEW_REQUEST', record };
  }

  /** Writes the request for the renewal, its detail and its audit events, and applies it at once when nobody is left to decide. */
  private async renew(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      body: RenewalBodyDto;
      facts: AssignmentFacts;
      settings: RequestSettings;
      previousEnd: BusinessDate;
      byHead: boolean;
      now: Date;
    },
  ): Promise<RenewalSubmitted> {
    const { body, facts, byHead, now } = input;
    const newEnd = body.newExpectedEndDate;
    const termMonths = monthsBetween(input.previousEnd, newEnd);
    const consecutiveMonths = monthsBetween(facts.chainStartsOn, newEnd);
    const confirmation = body.termConfirmation?.reason.trim() ?? '';
    if (byHead && consecutiveMonths > LONG_TERM_MONTHS && confirmation === '') {
      throw new RenewalRequestRefusedError('TERM_CONFIRMATION_REQUIRED');
    }

    const assessed = await this.assessment.assess(tx, {
      employeeId: facts.employeeId,
      requesterEmployeeId: actor.employeeId,
      planId: facts.planId,
      termMonths,
      expectedSpendOn: body.expectedSpendOn,
      now,
      settings: input.settings,
      lockDepartment: true,
    });
    const { unit, policy, pricing, routing } = assessed;
    const { decision } = routing;
    const assigned = byHead || decision.outcome === 'ASSIGNED';
    const state = assigned ? 'PENDING' : 'WAITING_CONTROLLED';
    const created = await this.requests.insert(tx, {
      type: 'RENEWAL',
      organizationId: (await this.requireOrganization(tx)).id,
      branch: policy.branch,
      state,
      planId: facts.planId,
      requesterEmployeeId: actor.employeeId,
      beneficiaryEmployeeIds: [facts.employeeId],
      departmentId: unit.departmentId,
      costCenterId: unit.costCenter.id,
      businessReason: body.businessReason,
      termMonths,
      projectLabel: body.projectLabel ?? null,
      pricing,
      policy,
      expectedEndDate: newEnd,
      createdByAppUserId: actor.appUserId,
      now,
      needStep: byHead
        ? {
            state: 'PENDING',
            assigneeEmployeeId: actor.employeeId,
            routingRow: DELEGATED_ROW,
            waitingReason: null,
            samePersonAsSpend: false,
            slaWorkingDays: policy.slaWorkingDays,
          }
        : {
            state: assigned ? 'PENDING' : 'WAITING',
            assigneeEmployeeId: decision.outcome === 'ASSIGNED' ? decision.assigneeEmployeeId : null,
            routingRow: decision.row,
            waitingReason: decision.outcome === 'ASSIGNED' ? null : decision.reason,
            samePersonAsSpend: decision.outcome === 'ASSIGNED' && decision.samePersonAsSpend,
            slaWorkingDays: policy.slaWorkingDays,
          },
    });
    await this.renewals.insert(tx, {
      requestId: created.id,
      assignmentId: facts.assignmentId,
      previousExpectedEndDate: input.previousEnd,
      newExpectedEndDate: newEnd,
      consecutiveMonths,
    });
    await this.trail.submitted(tx, actor, (await this.requireOrganization(tx)).id, {
      created,
      assessed,
      state,
      input: { ...input, termMonths, consecutiveMonths },
    });
    if (byHead) await this.confirmNeed(tx, actor, { created, assessed, confirmation, now });

    const record = await this.requests.findById(created.id, tx);
    if (!record) throw new Error(`The request ${created.id} was not found after it was written.`);
    // Nobody is left to decide a renewal that costs nothing and was confirmed by the head who sent it: it is applied now.
    if (byHead && record.state === 'AWAITING_EXECUTION') {
      await this.apply.apply(tx, actor, record, now);
    }
    const final = await this.requests.findById(created.id, tx);
    if (!final) throw new Error(`The request ${created.id} was not found after it was written.`);

    return { outcome: 'RENEWAL_REQUESTED', record: final };
  }

  private async requireOrganization(tx: DbTx) {
    const organization = await this.organization.getOrganization(tx);
    if (!organization) throw new Error('A renewal was asked for before installation');

    return organization;
  }

  /** The need step of the head who sent it is approved in the moment of sending, by the head, for the person. */
  private async confirmNeed(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      created: { id: string; needStepId: string };
      assessed: Assessment;
      confirmation: string;
      now: Date;
    },
  ): Promise<void> {
    const { created, assessed } = input;
    const requestState = nextRequestState(assessed.policy.branch);
    const organization = await this.requireOrganization(tx);
    await this.requests.recordNeedDecision(tx, {
      organizationId: organization.id,
      requestId: created.id,
      stepId: created.needStepId,
      requestState,
      departmentId: assessed.unit.departmentId,
      record: {
        decision: 'APPROVED',
        decidedByEmployeeId: actor.employeeId,
        deciderRole: 'MANAGER',
        reason: null,
        termConfirmationReason: input.confirmation || null,
        decidedAt: input.now,
      },
    });
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        organization.id,
        'ACCESS_REQUEST.NEED_APPROVED',
        'ACCESS_REQUEST_STEP',
        created.needStepId,
        {
          type: 'RENEWAL',
          requestId: created.id,
          decision: 'APPROVED',
          assigneeEmployeeId: actor.employeeId,
          decidedByEmployeeId: actor.employeeId,
          deciderRole: 'MANAGER',
          departmentId: assessed.unit.departmentId,
          requestState,
          termConfirmed: input.confirmation !== '',
          delegated: true,
        },
      ),
    );
  }
}
