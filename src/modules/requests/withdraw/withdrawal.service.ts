import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { GroupWithdrawalService } from '../group-request/group-withdrawal.service';
import { SpendStatusService } from '../spend/spend-status.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import {
  AccessRequestNotFoundError,
  AccessRequestWithdrawalRefusedError,
} from '../access-request/access-request.errors';
import { canViewRequest, viewFactsOf } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestEndService } from '../access-request/request-end.service';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import { checkWithdrawal } from './withdrawal.policy';

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
    private readonly end: RequestEndService,
    private readonly licensing: LicensingApi,
    private readonly organization: OrganizationApi,
    private readonly spendStatus: SpendStatusService,
    private readonly audit: AuditApi,
    private readonly groups: GroupWithdrawalService,
    private readonly outcomes: RequestOutcomeService,
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
      // The task of the grant is locked before the request, as the IT Admin who works the task locks them.
      await this.licensing.lockGrantOfRequest(tx, requestId);
      const request = await this.repo.lockById(tx, requestId);
      const now = new Date();
      const today = await this.organization.businessToday(now, tx);
      const headed = await this.organization.getHeadedDepartment(actor.employeeId, today);
      const heads = headed?.departmentId === request?.departmentId;
      if (!request || !(heads || canViewRequest(actor, viewFactsOf(request)))) {
        throw new AccessRequestNotFoundError();
      }

      const refusal = checkWithdrawal({
        actorEmployeeId: actor.employeeId,
        requesterEmployeeId: request.requesterEmployeeId,
        actorHeadsDepartment: heads,
        state: request.state,
        spendStage: (await this.spendStatus.of(request))?.stage ?? null,
        reason,
      });
      if (refusal === 'GRANT_COMPLETED') {
        // The seat is real: the way on is the return of the seat the grant made, which the person names by this id (`US-05-13`).
        const assignmentId = await this.licensing.completedGrantOfRequest(tx, request.id);
        throw new AccessRequestWithdrawalRefusedError('GRANT_COMPLETED', assignmentId ? { assignmentId } : null);
      }
      if (refusal) throw new AccessRequestWithdrawalRefusedError(refusal);

      const before = request.state;
      if (before === 'EXECUTING') {
        const grant = await this.licensing.cancelGrantOfRequest(tx, actor, {
          organizationId: request.organizationId,
          requestId: request.id,
          now,
        });
        if (grant.status === 'RUNNING') throw new AccessRequestWithdrawalRefusedError('GRANT_RUNNING');
        if (grant.status === 'COMPLETED') {
          // The way on is the return of the seat the grant made, which the person names by this id (`US-05-13`).
          throw new AccessRequestWithdrawalRefusedError('GRANT_COMPLETED', { assignmentId: grant.assignmentId });
        }
        if (grant.status === 'ENDED') throw new AccessRequestWithdrawalRefusedError('ALREADY_ENDED');
        if (grant.status === 'FAILED') {
          // The grant failed: the IT Admin closes the task as cancelled, and only then does the request end and the money go back.
          await this.repo.setWithdrawal(
            tx,
            request.id,
            { requestedAt: now, requestedByEmployeeId: actor.employeeId, reason, withdrawnAt: null },
            'AWAITING_IT_CLOSE',
          );
          await this.audit.record(
            tx,
            accessRequestAuditEvent(
              actor,
              request.organizationId,
              'ACCESS_REQUEST.WITHDRAWAL_REQUESTED',
              'ACCESS_REQUEST',
              request.id,
              { requestId: request.id, from: before, to: 'AWAITING_IT_CLOSE', taskId: grant.taskId },
            ),
          );

          return this.reread(tx, request.id);
        }
      }

      await this.end.close(tx, actor, request, 'REQUEST_WITHDRAWN', now);
      await this.repo.setWithdrawal(
        tx,
        request.id,
        { requestedAt: now, requestedByEmployeeId: actor.employeeId, reason, withdrawnAt: now },
        'WITHDRAWN',
      );
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.WITHDRAWN',
          'ACCESS_REQUEST',
          request.id,
          {
            requestId: request.id,
            from: before,
            to: 'WITHDRAWN',
            byRequester: actor.employeeId === request.requesterEmployeeId,
            withdrawnByEmployeeId: actor.employeeId,
            reason,
          },
        ),
      );
      await this.outcomes.ended(tx, request, request.beneficiaryEmployeeIds, now);

      return this.reread(tx, request.id);
    });
  }

  private async reread(tx: Parameters<AccessRequestRepo['lockById']>[0], id: string): Promise<AccessRequestRecord> {
    const record = await this.repo.findById(id, tx);
    if (!record) throw new Error(`The request ${id} was not found after it was withdrawn.`);

    return record;
  }
}
