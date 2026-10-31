import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { GroupWithdrawalService } from '../group-request/group-withdrawal.service';
import { WithdrawalPreconditions } from './withdrawal-preconditions.service';
import { WithdrawalWriter } from './withdrawal-writer.service';

/**
 * The requester withdraws a request that is still waiting, or whose grant has not been carried out (`US-05-08`); the head of
 * the department does too, with a reason, in the stages the head has to act on (`US-06-14` AC-14). One transaction, the
 * request locked: the open steps (the need step, the assessment, Finance's review and the spend step) are closed, the questions
 * to Finance that wait are closed, the request leaves the batch it was sent in, what was held for it goes back to the budget and
 * the grant is cancelled; a task nobody has worked is cancelled with its assignment so the seat is free. A task being worked
 * refuses the withdrawal; a task that is done sends the person to a return; a task that failed lets the request wait, as
 * `AWAITING_IT_CLOSE`, for the IT Admin to close it as cancelled. A refused withdrawal changes nothing.
 *
 * Everything that follows the end of the request (telling the people who held a step, Finance and the IT Admin) is for
 * `g5-request-status-notifications`, which reads the audit events written here.
 */
@Injectable()
export class WithdrawalService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: AccessRequestRepo,
    private readonly groups: GroupWithdrawalService,
    private readonly preconditions: WithdrawalPreconditions,
    private readonly writer: WithdrawalWriter,
  ) {}

  /** Throws AccessRequestNotFoundError and AccessRequestWithdrawalRefusedError. */
  async withdraw(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: { reason?: string },
  ): Promise<AccessRequestRecord> {
    const reason = input.reason?.trim() || null;
    // The people of a request for a group are withdrawn line by line, under the locks of their own tasks (`US-05-17`).
    if ((await this.repo.findById(requestId))?.type === 'GROUP_GRANT')
      return this.groups.withdrawAll(actor, requestId, input);

    return this.runner.run(async (tx) => {
      const { request, now } = await this.preconditions.require(tx, actor, requestId, reason);
      const why = { reason, now };
      if (
        request.state === 'EXECUTING' &&
        (await this.writer.cancelGrant(tx, actor, request, why)) === 'WAITING_FOR_IT'
      ) {
        return this.reread(tx, request.id);
      }
      await this.writer.finish(tx, actor, request, why);

      return this.reread(tx, request.id);
    });
  }

  private async reread(tx: DbTx, id: string): Promise<AccessRequestRecord> {
    const record = await this.repo.findById(id, tx);
    if (!record) throw new Error(`The request ${id} was not found after it was withdrawn.`);

    return record;
  }
}
