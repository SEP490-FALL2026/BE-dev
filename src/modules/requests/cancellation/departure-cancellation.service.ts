import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { GroupLineClosureService } from '../line-closure/group-line-closure.service';
import { soleLiveLine } from '../line-closure/group-line-closure.policy';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import {
  AccessRequestCancellationRefusedError,
  AccessRequestNotFoundError,
  AccessRequestRoleRequiredError,
} from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord, CancellationRefusal } from '../access-request/access-request.types';
import { checkCancellation, checkTransferCancellation, wasTransferredFrom } from './cancellation.policy';
import { RequestEndService } from '../request-end/request-end.service';
import { RequestOutcomeService } from '../outcome/request-outcome.service';

/** Why the IT Admin closes the request: the person it is for left, or was transferred while it was still open. */
export type CancellationCause = 'BENEFICIARY_LEFT' | 'BENEFICIARY_TRANSFERRED';

/**
 * What the IT Admin says when they close a request: why, a note to keep (the reason of a closing for a transfer), and what they did to
 * undo a grant that is open: for a person who left, the work they undid when it is being worked; for a person who was transferred,
 * that they checked with the vendor and collected the invitation, which any open task of the grant needs.
 */
export interface CancellationInput {
  cause: CancellationCause;
  note?: string;
  evidence?: string;
}

/**
 * The IT Admin closes a request because the person it was for left (`US-03-04` AC-25, `QĐ-77f`), or was transferred while it was still
 * open (`QĐ-90b`): the request ends as cancelled, neither refused nor failed nor withdrawn. The role is judged here, not only by
 * the guard of the route. Nothing closes by itself and nothing closes more than one request: the list of what is open is for
 * the IT Admin to act on. One transaction, locked as the withdrawal is, the task of the grant first and then the request: a task nobody
 * has worked or that failed is cancelled with its assignment so the seat is free, a task being worked only with the evidence that the
 * IT Admin took the invitation back or stopped the work, and a task that is done is not closed here at all (the request is completed;
 * the right is taken away by the revocation of the departure, or goes to the held rights of the transfer). Then the steps still open and
 * the questions to Finance are closed, the request leaves its batch, what was held for it and is not spent goes back to the budget and
 * the audit event `ACCESS_REQUEST.CANCELLED` is written, which is where the people concerned and Finance are told from. A refused
 * closing changes nothing.
 *
 * A closing for a transfer needs the transfer to be real: the person still works and sits in a department other than the one the
 * request was sent from, which a paid request keeps. It needs its reason, and the confirmation of the vendor check for any open task.
 *
 * A request for a group has one line for each person, and one person leaving is not the end of the request: when theirs is the only line
 * still live, closing the request is the removal of that line (`GroupLineClosureService`, which ends the request with it); with more than
 * one person live the IT Admin removes each person by name, and this refuses (`GROUP_REQUEST_UNSUPPORTED`).
 */
@Injectable()
export class DepartureCancellationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: AccessRequestRepo,
    private readonly end: RequestEndService,
    private readonly licensing: LicensingApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly groups: GroupLineClosureService,
    private readonly outcomes: RequestOutcomeService,
  ) {}

  /** Throws AccessRequestRoleRequiredError, AccessRequestNotFoundError and AccessRequestCancellationRefusedError. */
  async cancel(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: CancellationInput,
  ): Promise<AccessRequestRecord> {
    if (!actor.roles.includes('IT_ADMIN')) throw new AccessRequestRoleRequiredError('IT_ADMIN');
    const first = await this.repo.findById(requestId);
    const leaver = first?.type === 'GROUP_GRANT' ? soleLiveLine(first.lines) : null;
    if (leaver !== null) return this.groups.close(actor, requestId, leaver, input);

    return this.runner.run(async (tx) => {
      // The task of the grant is locked before the request, as the IT Admin who works the task locks them.
      await this.licensing.lockGrantOfRequest(tx, requestId);
      const request = await this.repo.lockById(tx, requestId);
      if (!request) throw new AccessRequestNotFoundError();

      const refusal = await this.refusal(tx, request, input.cause);
      if (refusal) throw new AccessRequestCancellationRefusedError(refusal);
      // A task of the grant that is open, in any state, is cancelled for a transfer only on the confirmation of the check with the
      // vendor: an early answer that is the rule licensing applies to the task (`grantCancelAction`), never a weaker one.
      if (input.cause === 'BENEFICIARY_TRANSFERRED' && request.state === 'EXECUTING' && input.evidence === undefined) {
        throw new AccessRequestCancellationRefusedError('EVIDENCE_REQUIRED');
      }

      const now = new Date();
      const before = request.state;
      const grant = await this.licensing.cancelGrantOfRequest(tx, actor, {
        organizationId: request.organizationId,
        requestId: request.id,
        now,
        cause: input.cause,
        ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
      });
      if (grant.status === 'EVIDENCE_REQUIRED') throw new AccessRequestCancellationRefusedError('EVIDENCE_REQUIRED');
      // The task and the request are both locked, so a task that is done or ended under an open request cannot be seen; refuse it as ended.
      if (grant.status !== 'NO_TASK' && grant.status !== 'CANCELLED') {
        throw new AccessRequestCancellationRefusedError('ALREADY_ENDED');
      }

      // Only what is not spent goes back to the budget: the part that already became an expense stays (`QĐ-83a`).
      const released = await this.end.close(tx, actor, request, 'REQUEST_CANCELLED', now);
      const note = input.note?.trim() || null;
      await this.repo.setCancellation(tx, request.id, {
        cancelledAt: now,
        cancelledByEmployeeId: actor.employeeId,
        cause: input.cause,
        note,
      });
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.CANCELLED',
          'ACCESS_REQUEST',
          request.id,
          {
            requestId: request.id,
            from: before,
            to: 'CANCELLED',
            reasonKind: input.cause,
            cancelledByEmployeeId: actor.employeeId,
            beneficiaryEmployeeId: request.beneficiaryEmployeeIds[0],
            taskId: grant.status === 'CANCELLED' ? grant.taskId : null,
            taskStatusBefore: grant.status === 'CANCELLED' ? grant.taskStatus : null,
            commitmentsReleased: released.length,
            releasedMinor: released.reduce((sum, item) => sum + item.releasedMinor, 0n).toString(),
          },
        ),
      );
      await this.outcomes.ended(tx, request, request.beneficiaryEmployeeIds, now);

      const record = await this.repo.findById(request.id, tx);
      if (!record) throw new Error(`The request ${request.id} was not found after it was cancelled.`);

      return record;
    });
  }

  /** The first reason the request is not closed for this cause, read under the lock of the request. */
  private async refusal(
    tx: DbTx,
    request: AccessRequestRecord,
    cause: CancellationCause,
  ): Promise<CancellationRefusal | null> {
    const people = await this.organizationReads.getEmployees(request.beneficiaryEmployeeIds, tx);
    if (cause === 'BENEFICIARY_LEFT') {
      return checkCancellation({
        type: request.type,
        state: request.state,
        beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
        beneficiaryLeft: new Map(people.map((person) => [person.id, person.status === 'TERMINATED'])),
      });
    }
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const transferred = new Map<string, boolean>();
    for (const person of people) {
      const placement = await this.organizationReads.getEmployeePlacement(person.id, today, tx);
      transferred.set(
        person.id,
        wasTransferredFrom({
          status: person.status,
          currentDepartmentId: placement?.departmentId ?? null,
          sentFromDepartmentId: request.departmentId,
        }),
      );
    }

    return checkTransferCancellation({
      type: request.type,
      state: request.state,
      beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
      beneficiaryTransferred: transferred,
    });
  }
}
