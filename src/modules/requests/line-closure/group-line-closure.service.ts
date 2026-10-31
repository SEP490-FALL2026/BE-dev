import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import {
  AccessRequestCancellationRefusedError,
  AccessRequestNotFoundError,
  AccessRequestRoleRequiredError,
} from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { LineCancelCause } from '../access-request/group-request.types';
import { GroupGrantService } from '../group-request/group-grant.service';
import { GroupResolutionService } from '../group-request/group-resolution.service';
import { holdsMoney } from '../group-request/group-withdrawal.policy';
import { RequestLineRepo } from '../group-request/request-line.repo';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import { GroupLineCloser } from './group-line-closer.service';
import { lineCancelledDetail, needsEvidenceAtOnce } from './group-line-closure.policy';

/**
 * What the IT Admin says when they remove a person who left or was transferred: why, a note to keep (the reason of a closing for a
 * transfer), and for a grant being worked the work they undid; for a transfer, the confirmation of the check with the vendor.
 */
export interface LineClosureInput {
  cause: LineCancelCause;
  note?: string;
  evidence?: string;
}

/**
 * The IT Admin removes one person who left, or was transferred, from a request for a group (`US-03-04` AC-25, `QĐ-77f`, `US-05-17`): the line of that person ends as cancelled and nothing else of the request does. The role is judged here, not only by the guard
 * of the route; a transfer needs to be real (the person still works and sits in another department than the one the request was
 * sent from), its reason, and for a task of the grant that is open the confirmation that the vendor was checked. Only their task of the grant is cancelled, with its assignment so the seat is
 * free (a task being worked only with the evidence that the work was undone), and only their share of the commitment goes back to the
 * budget; the other people are decided, granted and withdrawn as before. The request follows its lines through
 * `GroupResolutionService`: it is priced again for the people who remain, the need step that nobody waits on any more closes, and when
 * no line is live any longer the request ends (cancelled when nothing was granted, failed or refused; the outcome of the most that was
 * done otherwise). Locked as the IT Admin who works the task locks: the task of the person, then the request, then the line. Nothing
 * closes by itself, and a refused closing changes nothing.
 */
@Injectable()
export class GroupLineClosureService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly lines: RequestLineRepo,
    private readonly grants: GroupGrantService,
    private readonly resolution: GroupResolutionService,
    private readonly audit: AuditApi,
    private readonly outcomes: RequestOutcomeService,
    private readonly closer: GroupLineCloser,
  ) {}

  /** Throws AccessRequestRoleRequiredError, AccessRequestNotFoundError and AccessRequestCancellationRefusedError. */
  async close(
    actor: AuthenticatedPrincipal,
    requestId: string,
    employeeId: string,
    input: LineClosureInput,
  ): Promise<AccessRequestRecord> {
    if (!actor.roles.includes('IT_ADMIN')) throw new AccessRequestRoleRequiredError('IT_ADMIN');

    return this.runner.run(async (tx) => {
      await this.closer.lockTask(tx, requestId, employeeId);
      const request = await this.requests.lockById(tx, requestId);
      if (!request || request.type !== 'GROUP_GRANT') throw new AccessRequestNotFoundError();
      const [line] = await this.lines.lock(tx, requestId, [employeeId]);
      if (!line) throw new AccessRequestNotFoundError();

      await this.closer.requireClosable(tx, request, line, input.cause);
      if (needsEvidenceAtOnce(input.cause, line.state, input.evidence)) {
        throw new AccessRequestCancellationRefusedError('EVIDENCE_REQUIRED');
      }

      const now = new Date();
      const task = await this.closer.cancelTask(tx, actor, request, {
        lineState: line.state,
        employeeId,
        cause: input.cause,
        evidence: input.evidence,
        now,
      });
      await this.lines.move(tx, requestId, employeeId, {
        state: 'CANCELLED',
        endedAt: now,
        endedByEmployeeId: actor.employeeId,
        endReason: input.note?.trim() || null,
        cancelCause: input.cause,
      });
      // What was held for the person goes back, and nobody else's share does (`US-05-17` AC-10).
      const released = holdsMoney(line.state);
      if (released) await this.grants.release(tx, requestId, employeeId, 'REQUEST_CANCELLED', now);

      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.LINE_CANCELLED',
          'ACCESS_REQUEST',
          request.id,
          lineCancelledDetail(
            request,
            { employeeId, from: line.state, cause: input.cause, actorEmployeeId: actor.employeeId },
            task,
            released,
          ),
        ),
      );
      await this.outcomes.ended(tx, request, [employeeId], now);
      await this.resolution.resolve(tx, actor, requestId, now);

      const record = await this.requests.findById(requestId, tx);
      if (!record) throw new Error(`The request ${requestId} was not found after a line was cancelled.`);

      return record;
    });
  }
}
