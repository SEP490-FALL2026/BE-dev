import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AccessRequestCancellationRefusedError } from '../access-request/access-request.errors';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { LineCancelCause, LineState } from '../access-request/group-request.types';
import { checkLineClosure, checkLineTransferClosure } from './group-line-closure.policy';

/** The task of the person that was cancelled with the line, and the state it was in. */
export interface CancelledTask {
  taskId: string;
  taskStatus: string;
}

/**
 * What closing the line of a person who left or was transferred asks of the other modules (`US-03-04` AC-25, `QĐ-77f`): that the closing
 * is real (the person left, or still works and sits in another department than the one the request was sent from), and the task of the
 * grant of that person cancelled with its assignment so the seat is free.
 */
@Injectable()
export class GroupLineCloser {
  constructor(
    private readonly licensing: LicensingApi,
    private readonly organization: OrganizationApi,
  ) {}

  /** Locks the task of the grant of the person before the request is locked, as the IT Admin who works the task locks them. */
  lockTask(tx: DbTx, requestId: string, employeeId: string): Promise<void> {
    return this.licensing.lockGrantOfRequest(tx, requestId, employeeId);
  }

  /** Throws AccessRequestCancellationRefusedError when the person did not leave, or was not transferred, or the line is not live. */
  async requireClosable(
    tx: DbTx,
    request: AccessRequestRecord,
    line: { state: LineState; employeeId: string },
    cause: LineCancelCause,
  ): Promise<void> {
    const [person] = await this.organization.getEmployees([line.employeeId], tx);
    const refusal =
      cause === 'BENEFICIARY_LEFT'
        ? checkLineClosure({ lineState: line.state, beneficiaryLeft: person?.status === 'TERMINATED' })
        : checkLineTransferClosure({
            lineState: line.state,
            beneficiaryTransferred: await this.wasTransferred(tx, request, line.employeeId, person?.status),
          });
    if (refusal) throw new AccessRequestCancellationRefusedError(refusal);
  }

  /** Cancels the task of the person with its assignment when the line has one; null when there was none. */
  async cancelTask(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    closing: { lineState: LineState; employeeId: string; cause: LineCancelCause; evidence?: string; now: Date },
  ): Promise<CancelledTask | null> {
    // Only a line that is being carried out has a task, and it is the one of this person: the tasks of the others are not touched.
    if (closing.lineState !== 'EXECUTING') return null;

    const grant = await this.licensing.cancelGrantOfRequest(tx, actor, {
      organizationId: request.organizationId,
      requestId: request.id,
      employeeId: closing.employeeId,
      now: closing.now,
      cause: closing.cause,
      ...(closing.evidence === undefined ? {} : { evidence: closing.evidence }),
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
