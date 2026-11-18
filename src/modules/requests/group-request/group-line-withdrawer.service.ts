import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { AccessRequestWithdrawalRefusedError } from '../access-request/access-request.errors';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { LineRecord } from '../access-request/group-request.types';
import { holdsMoney, type Withdrawn } from './group-withdrawal.policy';
import { RequestLineRepo } from './request-line.repo';

/**
 * What becomes of one line in the state it is in when its person is withdrawn (`US-05-08`): a task nobody has worked is cancelled with
 * its assignment, one being worked refuses, a seat that is real is for a return, and a failed grant lets the line wait for the IT Admin to
 * close it. The refusals are thrown and undo whatever was done before.
 */
@Injectable()
export class GroupLineWithdrawer {
  constructor(
    private readonly lines: RequestLineRepo,
    private readonly licensing: LicensingApi,
  ) {}

  async withdrawOne(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    line: LineRecord,
    why: { reason: string | null; now: Date },
  ): Promise<Withdrawn> {
    const { reason, now } = why;
    if (line.state === 'EXECUTING') {
      const grant = await this.licensing.cancelGrantOfRequest(tx, actor, {
        organizationId: request.organizationId,
        requestId: request.id,
        employeeId: line.employeeId,
        now,
      });
      if (grant.status === 'RUNNING') {
        throw new AccessRequestWithdrawalRefusedError('GRANT_RUNNING', { employeeIds: [line.employeeId] });
      }
      if (grant.status === 'COMPLETED') {
        throw new AccessRequestWithdrawalRefusedError('GRANT_COMPLETED', { assignmentId: grant.assignmentId });
      }
      if (grant.status === 'ENDED') {
        throw new AccessRequestWithdrawalRefusedError('ALREADY_ENDED', { employeeIds: [line.employeeId] });
      }
      if (grant.status === 'FAILED') {
        // The grant failed: the IT Admin closes the task as cancelled, and only then does the line end and the money go back.
        await this.lines.move(tx, request.id, line.employeeId, {
          state: 'AWAITING_IT_CLOSE',
          endedByEmployeeId: actor.employeeId,
          endReason: reason,
          withdrawalRequestedAt: now,
        });

        return { kind: 'WAITING_FOR_IT', taskId: grant.taskId };
      }
    }

    await this.lines.move(tx, request.id, line.employeeId, {
      state: 'WITHDRAWN',
      endedAt: now,
      endedByEmployeeId: actor.employeeId,
      endReason: reason,
      withdrawalRequestedAt: now,
    });

    return { kind: 'ENDED', released: holdsMoney(line.state) };
  }
}
