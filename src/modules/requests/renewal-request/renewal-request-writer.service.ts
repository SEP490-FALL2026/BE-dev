import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { AssignmentFacts } from '../../licensing/public/licensing-renewal.types';
import { OrganizationApi } from '../../organization/public/organization.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { LONG_TERM_MONTHS, nextRequestState } from '../access-request/need-decision.policy';
import { RequestFactsService, type Assessment, type RequestSettings } from '../access-request/request-facts.service';
import { RenewalApplyService } from '../renewal-apply/renewal-apply.service';
import { RenewalRequestRepo } from '../renewal-apply/renewal-request.repo';
import type { RenewalBodyDto } from './renewal-request.dto';
import { RenewalRequestRefusedError } from './renewal-request.errors';
import { monthsBetween } from './renewal-request.policy';
import { renewalRequestOf, type RenewalSubmission, type RenewedSeat } from './renewal-request-submission.mapper';
import { RenewalRequestTrail } from './renewal-request-trail.service';

export interface RenewalSubmitted {
  /** The renewal was requested, or the right had ended and what was made is a request like any other. */
  outcome: 'RENEWAL_REQUESTED' | 'NEW_REQUEST';
  record: AccessRequestRecord;
}

/**
 * Writes the request for a renewal that was judged sendable (`US-05-14`): the request, its detail and its audit events, the approval of
 * the need by the head who sent it, and the renewal applied at once when nobody is left to decide. Neither the reason nor the
 * identifier of the account enters an audit event.
 */
@Injectable()
export class RenewalRequestWriter {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly renewals: RenewalRequestRepo,
    private readonly assessment: RequestFactsService,
    private readonly organization: OrganizationApi,
    private readonly apply: RenewalApplyService,
    private readonly trail: RenewalRequestTrail,
    private readonly audit: AuditApi,
  ) {}

  /** Writes the request for the renewal, its detail and its audit events, and applies it at once when nobody is left to decide. */
  async renew(
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
    const organizationId = (await this.requireOrganization(tx)).id;
    const sent: RenewalSubmission = {
      actor,
      organizationId,
      holder: { employeeId: facts.employeeId, planId: facts.planId },
      body,
      termMonths,
      newEnd,
      byHead,
      now,
      assessed,
    };
    const created = await this.insertRenewal(tx, actor, sent, {
      assignmentId: facts.assignmentId,
      previousEnd: input.previousEnd,
      consecutiveMonths,
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

  /** The request, its detail (the seat and the ends) and its audit events. */
  private async insertRenewal(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    sent: RenewalSubmission,
    seat: RenewedSeat,
  ): Promise<{ id: string; needStepId: string }> {
    const created = await this.requests.insert(tx, renewalRequestOf(sent));
    await this.renewals.insert(tx, {
      requestId: created.id,
      assignmentId: seat.assignmentId,
      previousExpectedEndDate: seat.previousEnd,
      newExpectedEndDate: sent.newEnd,
      consecutiveMonths: seat.consecutiveMonths,
    });
    await this.trail.submitted(tx, actor, sent, { created, seat });

    return created;
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
