import { SpendRoutingService } from '../spend/spend-routing.service';
import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AssignmentFacts } from '../../licensing/public/licensing-renewal.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestTermRefusedError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestFactsService, type RequestSettings } from '../access-request/request-facts.service';
import { RenewalRequestRepo } from '../renewal-apply/renewal-request.repo';
import type { RenewalBodyDto } from './renewal-request.dto';
import { monthsBetween, renewalTermMonthsOf } from './renewal-request.policy';
import { renewalRequestOf, type RenewalSubmission, type RenewedSeat } from './renewal-request-submission.mapper';
import { RenewalRequestTrail } from './renewal-request-trail.service';

export interface RenewalSubmitted {
  /** The renewal was requested, or the right had ended and what was made is a request like any other. */
  outcome: 'RENEWAL_REQUESTED' | 'NEW_REQUEST';
  record: AccessRequestRecord;
}

/**
 * Writes the request for a renewal that was judged sendable (`US-05-14`): the request, its detail and its audit events. Neither the reason nor the
 * identifier of the account enters an audit event.
 */
@Injectable()
export class RenewalRequestWriter {
  constructor(
    private readonly spendRouting: SpendRoutingService,
    private readonly requests: AccessRequestRepo,
    private readonly renewals: RenewalRequestRepo,
    private readonly assessment: RequestFactsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly trail: RenewalRequestTrail,
  ) {}

  /**
   * Writes the request for the renewal, its detail and its audit events. The months of use are judged and run from the day the new period begins as
   * for any request (`QĐ-111l`): the end is the day before the same day that many months later, cut at the end of the contract of a person who has
   * one (R-38), and none for a right that goes on with no end; the amount counts the months that begin in this year and the part of the year after
   * (`QĐ-111j`, `QĐ-111k`, R-39, R-46). Throws AccessRequestTermRefusedError.
   */
  async renew(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      body: RenewalBodyDto;
      facts: AssignmentFacts;
      settings: RequestSettings;
      previousEnd: BusinessDate;
      /** The day the new period begins: the day after the right ends. The money is priced and charged to the budget year from this day, not from today (R-M3). */
      termStart: BusinessDate;
      now: Date;
    },
  ): Promise<RenewalSubmitted> {
    const { body, facts, now } = input;
    const termMonths = renewalTermMonthsOf(body);

    const assessed = await this.assessment.assess(tx, {
      employeeId: facts.employeeId,
      requesterEmployeeId: actor.employeeId,
      planId: facts.planId,
      termMonths,
      termStart: input.termStart,
      now,
      settings: input.settings,
      lockDepartment: true,
    });
    if (assessed.termRefusal !== null) throw new AccessRequestTermRefusedError(assessed.termRefusal);
    const newEnd = assessed.term.end;
    // Counted to the end of the new period, or to the end the right has when it goes on with no end: a stay is never less than a month.
    const consecutiveMonths = Math.max(1, monthsBetween(facts.chainStartsOn, newEnd ?? input.previousEnd));
    const organizationId = (await this.requireOrganization(tx)).id;
    const sent: RenewalSubmission = {
      actor,
      organizationId,
      holder: { employeeId: facts.employeeId, planId: facts.planId },
      body,
      termMonths,
      newEnd,
      now,
      assessed,
    };
    const created = await this.insertRenewal(tx, actor, sent, {
      assignmentId: facts.assignmentId,
      previousEnd: input.previousEnd,
      consecutiveMonths,
    });
    await this.spendRouting.start(tx, actor, created.id, new Date());
    const record = await this.requests.findById(created.id, tx);
    if (!record) throw new Error(`The request ${created.id} was not found after it was written.`);
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
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('A renewal was asked for before installation');

    return organization;
  }
}
