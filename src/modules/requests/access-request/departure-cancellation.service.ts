import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { LicensingService } from '../../licensing/licensing.service';
import { OrganizationService } from '../../organization/organization.service';
import { GroupLineClosureService } from '../group-request/group-line-closure.service';
import { soleLiveLine } from '../group-request/group-line-closure.policy';
import { accessRequestAuditEvent } from './access-request-audit-event';
import { AccessRequestCancellationRefusedError, AccessRequestNotFoundError } from './access-request.errors';
import { AccessRequestRepo } from './access-request.repo';
import type { AccessRequestRecord } from './access-request.types';
import { checkCancellation } from './cancellation.policy';
import { RequestEndService } from './request-end.service';

/**
 * The IT Admin closes a request because the person it was for left (`US-03-04` AC-25, `QĐ-77f`): the request ends as cancelled, neither
 * refused nor failed nor withdrawn. Nothing closes by itself and nothing closes more than one request: the list of what is open is for
 * the IT Admin to act on. One transaction, locked as the withdrawal is, the task of the grant first and then the request: a task nobody
 * has worked or that failed is cancelled with its assignment so the seat is free, a task being worked only with the evidence that the
 * IT Admin took the invitation back or stopped the work, and a task that is done is not closed here at all (the request is completed;
 * the right is taken away by the revocation of the departure). Then the steps still open and the questions to Finance are closed, the
 * request leaves its batch, what was held for it goes back to the budget and the audit event `ACCESS_REQUEST.CANCELLED` is written, which
 * is where the people concerned and Finance are told from. A refused closing changes nothing.
 *
 * A request for a group has one line for each person, and one person leaving is not the end of the request: when theirs is the only line
 * still live, closing the request is the removal of that line (`GroupLineClosureService`, which ends the request with it); with more than
 * one person live the IT Admin removes each person who left by name, and this refuses (`GROUP_REQUEST_UNSUPPORTED`).
 */
@Injectable()
export class DepartureCancellationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: AccessRequestRepo,
    private readonly end: RequestEndService,
    private readonly licensing: LicensingService,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly groups: GroupLineClosureService,
  ) {}

  /** Throws AccessRequestNotFoundError and AccessRequestCancellationRefusedError. */
  async cancel(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: { cause: 'BENEFICIARY_LEFT'; note?: string; evidence?: string },
  ): Promise<AccessRequestRecord> {
    const first = await this.repo.findById(requestId);
    const leaver = first?.type === 'GROUP_GRANT' ? soleLiveLine(first.lines) : null;
    if (leaver !== null) return this.groups.close(actor, requestId, leaver, input);

    return this.runner.run(async (tx) => {
      // The task of the grant is locked before the request, as the IT Admin who works the task locks them.
      await this.licensing.lockGrantOfRequest(tx, requestId);
      const request = await this.repo.lockById(tx, requestId);
      if (!request) throw new AccessRequestNotFoundError();

      const people = await this.organization.getEmployees(request.beneficiaryEmployeeIds, tx);
      const refusal = checkCancellation({
        type: request.type,
        state: request.state,
        beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
        beneficiaryLeft: new Map(people.map((person) => [person.id, person.status === 'TERMINATED'])),
      });
      if (refusal) throw new AccessRequestCancellationRefusedError(refusal);

      const now = new Date();
      const before = request.state;
      const grant = await this.licensing.cancelGrantOfRequest(tx, actor, {
        organizationId: request.organizationId,
        requestId: request.id,
        now,
        cause: 'BENEFICIARY_LEFT',
        ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
      });
      if (grant.status === 'EVIDENCE_REQUIRED') throw new AccessRequestCancellationRefusedError('EVIDENCE_REQUIRED');
      // The task and the request are both locked, so a task that is done or ended under an open request cannot be seen; refuse it as ended.
      if (grant.status !== 'NO_TASK' && grant.status !== 'CANCELLED') {
        throw new AccessRequestCancellationRefusedError('ALREADY_ENDED');
      }

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

      const record = await this.repo.findById(request.id, tx);
      if (!record) throw new Error(`The request ${request.id} was not found after it was cancelled.`);

      return record;
    });
  }
}
