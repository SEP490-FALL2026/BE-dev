import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  AccessRequestNotFoundError,
  AccessRequestWithdrawalRefusedError,
} from '../access-request/access-request.errors';
import { canViewRequest, viewFactsOf } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { checkWithdrawal } from '../access-request/withdrawal.policy';
import { SpendStatusService } from '../spend/spend-status.service';
import { GroupLineWithdrawer } from './group-line-withdrawer.service';
import { GroupWithdrawalAftermath } from './group-withdrawal-aftermath.service';
import { checkLineWithdrawal, type Withdrawn } from './group-withdrawal.policy';
import { isEnded, type LineRecord } from '../access-request/group-request.types';
import { RequestLineRepo } from './request-line.repo';

/**
 * Withdrawing one person of a request for a group, or all the people that are left (`US-05-08`, `US-06-14` AC-14, `US-05-17` AC-10).
 * The rules are those of withdrawing a request, judged on each line: before the spend there is no money to give back; once approved
 * the share of the person goes back to the budget and nothing of the others does; a task nobody has worked is cancelled with its
 * assignment (never failed); a task being worked refuses; a seat that is real is for a return; a failed grant lets the line wait for the
 * IT Admin to close it as cancelled. The locks are taken as the IT Admin takes them: the task of the person, then the request, then the
 * lines in the order the people were named.
 */
@Injectable()
export class GroupWithdrawalService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly lines: RequestLineRepo,
    private readonly licensing: LicensingApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly spendStatus: SpendStatusService,
    private readonly withdrawer: GroupLineWithdrawer,
    private readonly aftermath: GroupWithdrawalAftermath,
  ) {}

  /** Throws AccessRequestNotFoundError and AccessRequestWithdrawalRefusedError. */
  async withdrawLine(
    actor: AuthenticatedPrincipal,
    requestId: string,
    employeeId: string,
    input: { reason?: string },
  ): Promise<AccessRequestRecord> {
    const reason = input.reason?.trim() || null;

    return this.runner.run(async (tx) => {
      await this.licensing.lockGrantOfRequest(tx, requestId, employeeId);
      const request = await this.lockedGroup(tx, actor, requestId);
      const [line] = await this.lines.lock(tx, requestId, [employeeId]);
      if (!line) throw new AccessRequestNotFoundError();

      const refusal = checkLineWithdrawal({
        actorEmployeeId: actor.employeeId,
        requesterEmployeeId: request.requesterEmployeeId,
        actorHeadsDepartment: await this.heads(actor, request),
        lineState: line.state,
        spendStage: (await this.spendStatus.of(request))?.stage ?? null,
        reason,
      });
      if (refusal === 'GRANT_COMPLETED') await this.refuseCompleted(tx, request.id, employeeId);
      if (refusal) throw new AccessRequestWithdrawalRefusedError(refusal);

      const now = new Date();
      const done = await this.withdrawer.withdrawOne(tx, actor, request, line, { reason, now });
      await this.aftermath.after(tx, actor, request, [{ line, done }], {
        reason,
        release: 'PARTICIPANT_WITHDRAWN',
        now,
      });

      return this.reread(tx, requestId);
    });
  }

  /** Withdraws every person who has not ended, in one transaction; one whose task is being worked refuses the whole. */
  async withdrawAll(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: { reason?: string },
  ): Promise<AccessRequestRecord> {
    const reason = input.reason?.trim() || null;

    return this.runner.run(async (tx) => {
      const first = await this.requests.findById(requestId, tx);
      for (const line of first?.lines ?? []) {
        if (!isEnded(line.state)) await this.licensing.lockGrantOfRequest(tx, requestId, line.employeeId);
      }
      const request = await this.lockedGroup(tx, actor, requestId);
      const lines = await this.lines.lock(tx, requestId);

      const refusal = checkWithdrawal({
        actorEmployeeId: actor.employeeId,
        requesterEmployeeId: request.requesterEmployeeId,
        actorHeadsDepartment: await this.heads(actor, request),
        state: request.state,
        spendStage: (await this.spendStatus.of(request))?.stage ?? null,
        reason,
      });
      if (refusal) throw new AccessRequestWithdrawalRefusedError(refusal);

      const open = lines.filter((line) => !isEnded(line.state) && line.state !== 'AWAITING_IT_CLOSE');
      if (open.length === 0) {
        throw new AccessRequestWithdrawalRefusedError(
          lines.some((line) => line.state === 'AWAITING_IT_CLOSE') ? 'WITHDRAWAL_PENDING' : 'ALREADY_ENDED',
        );
      }
      const now = new Date();
      const done: { line: LineRecord; done: Withdrawn }[] = [];
      for (const line of open) {
        done.push({ line, done: await this.withdrawer.withdrawOne(tx, actor, request, line, { reason, now }) });
      }
      await this.aftermath.after(tx, actor, request, done, { reason, release: 'REQUEST_WITHDRAWN', now });

      return this.reread(tx, requestId);
    });
  }

  /** The request locked, as a request for a group the caller has a part in, or the head of its department. */
  private async lockedGroup(tx: DbTx, actor: AuthenticatedPrincipal, requestId: string): Promise<AccessRequestRecord> {
    const request = await this.requests.lockById(tx, requestId);
    if (
      !request ||
      request.type !== 'GROUP_GRANT' ||
      !((await this.heads(actor, request)) || canViewRequest(actor, viewFactsOf(request)))
    ) {
      throw new AccessRequestNotFoundError();
    }

    return request;
  }

  private async heads(actor: AuthenticatedPrincipal, request: AccessRequestRecord): Promise<boolean> {
    const headed = await this.organizationReads.getHeadedDepartment(actor.employeeId);

    return headed?.departmentId === request.departmentId;
  }

  /** The seat is real: the way on is the return of the seat the grant made, which the person names by this id (`US-05-13`). */
  private async refuseCompleted(tx: DbTx, requestId: string, employeeId: string): Promise<never> {
    const assignmentId = await this.licensing.completedGrantOfRequest(tx, requestId, employeeId);
    throw new AccessRequestWithdrawalRefusedError('GRANT_COMPLETED', assignmentId ? { assignmentId } : null);
  }

  private async reread(tx: DbTx, requestId: string): Promise<AccessRequestRecord> {
    const record = await this.requests.findById(requestId, tx);
    if (!record) throw new Error(`The request ${requestId} was not found after it was withdrawn.`);

    return record;
  }
}
