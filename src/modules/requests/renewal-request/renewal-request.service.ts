import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { AssignmentFacts } from '../../licensing/public/licensing-renewal.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestSuperAdminCannotRequestError } from '../access-request/access-request.errors';
import { mayRequest } from '../access-request/access-request.policy';
import { AccessRequestService } from '../request-intake/access-request.service';
import { RequestFactsService, type RequestSettings } from '../access-request/request-facts.service';
import { RenewalRequestRepo } from '../renewal-apply/renewal-request.repo';
import { RenewalRequestWriter, type RenewalSubmitted } from './renewal-request-writer.service';
import { RenewalSeatFactsService } from './renewal-seat-facts.service';
import type { RenewalBodyDto } from './renewal-request.dto';
import {
  RenewalEndDateOutOfRangeError,
  RenewalRequestRefusedError,
  RenewalWindowNotOpenError,
} from './renewal-request.errors';
import { effectiveEndOf, renewalEndOf, renewalStartOf } from '../../../core/term-limit';
import {
  checkRenewable,
  checkRenewalSender,
  monthsBetween,
  newEndFits,
  renewalWindowOf,
  routeRenewal,
} from './renewal-request.policy';

/**
 * Asking to renew a right that ends on a day (`US-05-14`). The old record is not edited: a request of its own is made, of the
 * kind RENEWAL, for the same tool and the person who holds it, and it is decided like any request (the need step, and for paid
 * software the spend step and its commitment). Sent up to the end of the right (today counts), the right is left as it is until a
 * decision comes (`AC-4`); sent after it, what is made is a request for the tool like any other, not a renewal (`AC-5`). The seat
 * is locked first, so two requests for one seat leave one. Approval is `RenewalApplyService`'s. Neither the
 * reason nor the identifier of the account enters an audit event.
 */
@Injectable()
export class RenewalRequestService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly renewals: RenewalRequestRepo,
    private readonly accessRequests: AccessRequestService,
    private readonly assessment: RequestFactsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly writer: RenewalRequestWriter,
    private readonly seatFacts: RenewalSeatFactsService,
  ) {}

  /**
   * Throws RenewalRequestRefusedError and the errors of sending a request (the plan or its application, the department, the seat
   * the person already holds).
   */
  async submit(actor: AuthenticatedPrincipal, body: RenewalBodyDto): Promise<RenewalSubmitted> {
    // The Super Admin sends no request, a renewal included.
    if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError();
    const settings = await this.assessment.settings();

    return this.runner.run(async (tx) => {
      const now = new Date();
      const today = await this.organizationReads.businessToday(now, tx);
      const { facts, previousEnd } = await this.requireSendable(tx, actor, body);

      const renewing = routeRenewal({ today, previousEnd }) === 'RENEWAL';
      // A late request is a request like any other: its end is worked out when the IT Admin grants it (`QĐ-98`, R-M4).
      if (!renewing) return this.redirect(tx, actor, { body, facts, settings, previousEnd, today });
      await this.requireWindowOpen(tx, facts.assignmentId, today, previousEnd);
      if (await this.renewals.hasOpenFor(facts.assignmentId, tx))
        throw new RenewalRequestRefusedError('ALREADY_REQUESTED');
      // The new end runs from the day after the right ends, never cut at the end of a year (`QĐ-98`, R-15), at most twelve months on.
      const newEnd = this.newEndOf(body, previousEnd, today);

      return this.writer.renew(tx, actor, {
        body,
        facts,
        settings,
        previousEnd,
        newEnd,
        termMonths: monthsBetween(previousEnd, newEnd),
        spendStartsOn: renewalStartOf({ previousEnd, today }),
        now,
      });
    });
  }

  /**
   * The window of the renewal is open (`BR-MF1-08a`): from `RENEWAL_WINDOW_DAYS` days before the approved end, the days recorded when it
   * opened winning over a later change (`QĐ-108b`). Throws RenewalWindowNotOpenError.
   */
  private async requireWindowOpen(
    tx: DbTx,
    assignmentId: string,
    today: BusinessDate,
    previousEnd: BusinessDate,
  ): Promise<void> {
    const windowDays = await this.seatFacts.windowDaysOf(tx, assignmentId, previousEnd);
    const window = renewalWindowOf({ today, previousEnd, windowDays });
    if (!window.open) throw new RenewalWindowNotOpenError(window.opensOn, windowDays);
  }

  /**
   * The new end the holder asked for (`newEndDate`, or the months of a client of before it), within twelve months of the end the right has
   * (`QĐ-108a`). Throws RenewalEndDateOutOfRangeError.
   */
  private newEndOf(body: RenewalBodyDto, previousEnd: BusinessDate, today: BusinessDate): BusinessDate {
    const maxEnd = renewalEndOf({ previousEnd, today, months: 12 });
    const newEnd = body.newEndDate ?? renewalEndOf({ previousEnd, today, months: body.extensionMonths ?? 12 });
    if (!newEndFits({ previousEnd, newEnd, maxEnd })) throw new RenewalEndDateOutOfRangeError(previousEnd, maxEnd);

    return newEnd;
  }

  /** The seat, locked, and who may ask: the holder, for a seat that has an end, renewed to a day that may be. */
  private async requireSendable(tx: DbTx, actor: AuthenticatedPrincipal, body: RenewalBodyDto) {
    // The sender and the holder cannot be the spending approver (`D-S21`): judged before any department is read.
    const facts = await this.seatFacts.lockedFactsOf(tx, actor.employeeId, body.assignmentId);
    const sender = checkRenewalSender({ actorEmployeeId: actor.employeeId, holderEmployeeId: facts.employeeId });
    if (!sender.ok) throw new RenewalRequestRefusedError(sender.refusal);

    const problem = checkRenewable(facts);
    if (problem || facts.expectedEndDate === null) {
      throw new RenewalRequestRefusedError('ASSIGNMENT_NOT_RENEWABLE', problem ?? 'NO_END_DATE');
    }
    return { facts, previousEnd: facts.expectedEndDate };
  }

  /** The right has ended: the person asks for the tool again, as for any tool, for the term from today to the end they gave. */
  private async redirect(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      body: RenewalBodyDto;
      facts: AssignmentFacts;
      settings: RequestSettings;
      previousEnd: BusinessDate;
      today: BusinessDate;
    },
  ): Promise<RenewalSubmitted> {
    const { body, facts } = input;
    // The end the holder entered becomes the end of the new request; a client of before it gave months, counted from today.
    const expectedEndDate =
      body.newEndDate ?? effectiveEndOf({ start: input.today, months: body.extensionMonths ?? 12 });
    const termMonths = monthsBetween(input.today, expectedEndDate);
    const record = await this.accessRequests.submitWithin(
      tx,
      actor,
      {
        planId: facts.planId,
        businessReason: body.businessReason,
        expectedEndDate,
        // A late ask is a request for new access: GH-1/GH-2/GH-3 judge it as any other (BR-MF1-01).
        manyPaidSoftwareReason: body.manyPaidSoftwareReason,
      },
      input.settings,
      { toleratedSeatId: facts.assignmentId },
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
          termMonths,
        },
      ),
    );

    return { outcome: 'NEW_REQUEST', record };
  }
}
