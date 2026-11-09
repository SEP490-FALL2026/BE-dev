import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestWithdrawalRefusedError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { grantCancelRefusal, withdrawalAuditOf } from '../access-request/withdrawal.policy';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import { RequestEndService } from '../request-end/request-end.service';

/**
 * Writes the withdrawal of a request that was judged withdrawable (`US-05-08`): the grant is cancelled (a task nobody has worked is
 * cancelled with its assignment so the seat is free; a failed one lets the request wait for the IT Admin), or the request ends: its open
 * steps and questions close, it leaves its batch, what was held goes back, and the people it was for are told it ended.
 */
@Injectable()
export class WithdrawalWriter {
  constructor(
    private readonly repo: AccessRequestRepo,
    private readonly end: RequestEndService,
    private readonly licensing: LicensingApi,
    private readonly audit: AuditApi,
    private readonly outcomes: RequestOutcomeService,
  ) {}

  /**
   * What the withdrawal does to the grant of a request being carried out: a refusal is thrown and changes nothing; a grant that failed
   * lets the request wait, as `AWAITING_IT_CLOSE`, for the IT Admin to close it as cancelled (answered `WAITING_FOR_IT`).
   */
  async cancelGrant(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    why: { reason: string | null; now: Date },
  ): Promise<'WAITING_FOR_IT' | 'GO_ON'> {
    const grant = await this.licensing.cancelGrantOfRequest(tx, actor, {
      organizationId: request.organizationId,
      requestId: request.id,
      now: why.now,
    });
    const refused = grantCancelRefusal(grant);
    if (refused) throw new AccessRequestWithdrawalRefusedError(refused.reason, refused.details);
    if (grant.status !== 'FAILED') return 'GO_ON';

    // The grant failed: the IT Admin closes the task as cancelled, and only then does the request end and the money go back.
    await this.repo.setWithdrawal(
      tx,
      request.id,
      { requestedAt: why.now, requestedByEmployeeId: actor.employeeId, reason: why.reason, withdrawnAt: null },
      'AWAITING_IT_CLOSE',
    );
    const recorded = withdrawalAuditOf(
      request,
      { from: request.state, actorEmployeeId: actor.employeeId, reason: why.reason },
      { taskId: grant.taskId },
    );
    await this.record(tx, actor, request, recorded);

    return 'WAITING_FOR_IT';
  }

  /** The request ends as withdrawn, and the people it was for are told it ended without a grant. */
  async finish(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    why: { reason: string | null; now: Date },
  ): Promise<void> {
    await this.end.close(tx, actor, request, 'REQUEST_WITHDRAWN', why.now);
    await this.repo.setWithdrawal(
      tx,
      request.id,
      { requestedAt: why.now, requestedByEmployeeId: actor.employeeId, reason: why.reason, withdrawnAt: why.now },
      'WITHDRAWN',
    );
    const recorded = withdrawalAuditOf(
      request,
      { from: request.state, actorEmployeeId: actor.employeeId, reason: why.reason },
      null,
    );
    await this.record(tx, actor, request, recorded);
    await this.outcomes.ended(tx, request, request.beneficiaryEmployeeIds, why.now);
  }

  private async record(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    recorded: ReturnType<typeof withdrawalAuditOf>,
  ): Promise<void> {
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        recorded.action,
        'ACCESS_REQUEST',
        request.id,
        recorded.detail,
      ),
    );
  }
}
