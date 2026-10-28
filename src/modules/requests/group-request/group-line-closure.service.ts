import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { LicensingService } from '../../licensing/licensing.service';
import { OrganizationService } from '../../organization/organization.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import {
  AccessRequestCancellationRefusedError,
  AccessRequestNotFoundError,
  AccessRequestRoleRequiredError,
} from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { GroupGrantService } from './group-grant.service';
import { RequestOutcomeListeners } from '../access-request/request-outcome-listeners';
import { checkLineClosure, checkLineTransferClosure } from './group-line-closure.policy';
import { GroupResolutionService } from './group-resolution.service';
import type { LineCancelCause, LineState } from './group-request.types';
import { holdsMoney } from './group-withdrawal.policy';
import { RequestLineRepo } from './request-line.repo';

/**
 * What the IT Admin says when they remove a person who left or was transferred: why, a note to keep (the reason of a closing for a
 * transfer), and for a grant being worked the work they undid; for a transfer, the confirmation of the check with the vendor.
 */
export interface LineClosureInput {
  cause: LineCancelCause;
  note?: string;
  evidence?: string;
}

/** The task of the person that was cancelled with the line, and the state it was in. */
interface CancelledTask {
  taskId: string;
  taskStatus: string;
}

/**
 * The IT Admin removes one person who left, or was transferred, from a request for a group (`US-03-04` AC-25, `QĐ-77f`, `US-05-17`,
 * F29): the line of that person ends as cancelled and nothing else of the request does. The role is judged here, not only by the guard
 * of the route (F13); a transfer needs to be real (the person still works and sits in another department than the one the request was
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
    private readonly licensing: LicensingService,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly outcomes: RequestOutcomeListeners,
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
      await this.licensing.lockGrantOfRequest(tx, requestId, employeeId);
      const request = await this.requests.lockById(tx, requestId);
      if (!request || request.type !== 'GROUP_GRANT') throw new AccessRequestNotFoundError();
      const [line] = await this.lines.lock(tx, requestId, [employeeId]);
      if (!line) throw new AccessRequestNotFoundError();

      const [person] = await this.organization.getEmployees([employeeId], tx);
      const refusal =
        input.cause === 'BENEFICIARY_LEFT'
          ? checkLineClosure({ lineState: line.state, beneficiaryLeft: person?.status === 'TERMINATED' })
          : checkLineTransferClosure({
              lineState: line.state,
              beneficiaryTransferred: await this.wasTransferred(tx, request, employeeId, person?.status),
            });
      if (refusal) throw new AccessRequestCancellationRefusedError(refusal);
      // A task of the grant that is open, in any state, is cancelled for a transfer only on the confirmation of the check with the
      // vendor: an early answer that is the rule licensing applies to the task (`grantCancelAction`), never a weaker one.
      if (input.cause === 'BENEFICIARY_TRANSFERRED' && line.state === 'EXECUTING' && input.evidence === undefined) {
        throw new AccessRequestCancellationRefusedError('EVIDENCE_REQUIRED');
      }

      const now = new Date();
      const task = await this.cancelTask(tx, actor, request, line.state, employeeId, input, now);
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
          {
            requestId: request.id,
            beneficiaryEmployeeId: employeeId,
            from: line.state,
            to: 'CANCELLED',
            reasonKind: input.cause,
            cancelledByEmployeeId: actor.employeeId,
            requesterEmployeeId: request.requesterEmployeeId,
            taskId: task?.taskId ?? null,
            taskStatusBefore: task?.taskStatus ?? null,
            released,
          },
        ),
      );
      await this.outcomes.ended(tx, request, [employeeId], now);
      await this.resolution.resolve(tx, actor, requestId, now);

      const record = await this.requests.findById(requestId, tx);
      if (!record) throw new Error(`The request ${requestId} was not found after a line was cancelled.`);

      return record;
    });
  }

  /** Cancels the task of the person with its assignment when the line has one; null when there was none. */
  private async cancelTask(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    lineState: LineState,
    employeeId: string,
    input: LineClosureInput,
    now: Date,
  ): Promise<CancelledTask | null> {
    // Only a line that is being carried out has a task, and it is the one of this person: the tasks of the others are not touched.
    if (lineState !== 'EXECUTING') return null;

    const grant = await this.licensing.cancelGrantOfRequest(tx, actor, {
      organizationId: request.organizationId,
      requestId: request.id,
      employeeId,
      now,
      cause: input.cause,
      ...(input.evidence === undefined ? {} : { evidence: input.evidence }),
    });
    if (grant.status === 'EVIDENCE_REQUIRED') throw new AccessRequestCancellationRefusedError('EVIDENCE_REQUIRED');
    if (grant.status === 'CANCELLED') return { taskId: grant.taskId, taskStatus: grant.taskStatus };
    if (grant.status === 'NO_TASK') return null;
    // The task and the request are both locked, so a task that is done or ended under a line being carried out cannot be seen.
    throw new AccessRequestCancellationRefusedError('ALREADY_ENDED');
  }

  /** Whether the person still works and sits in a department other than the one the request was sent from. */
  private async wasTransferred(
    tx: DbTx,
    request: AccessRequestRecord,
    employeeId: string,
    status: string | undefined,
  ): Promise<boolean> {
    if (status !== 'ACTIVE') return false;
    const today = await this.organization.businessToday(new Date(), tx);
    const placement = await this.organization.getEmployeePlacement(employeeId, today, tx);

    return placement !== null && placement.departmentId !== request.departmentId;
  }
}
