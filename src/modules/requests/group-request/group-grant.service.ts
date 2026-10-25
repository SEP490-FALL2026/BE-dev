import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { BudgetsService } from '../../budgets/budgets.service';
import type { GrantOutcome } from '../../licensing/licensing.types';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { GroupResolutionService } from './group-resolution.service';
import { shareToRelease } from './line-allocation.policy';
import { LineAmountRepo } from './line-amount.repo';
import { RequestLineRepo } from './request-line.repo';

/**
 * What the grant of a seat asks of a request for a group, for one person at a time (`US-05-17` AC-6, AC-7): the line of the person is
 * the thing that is claimed, completed, failed or cancelled, and the request follows its lines. A grant that fails for one person fails
 * that line alone and gives back that person's share of the commitment; the others are not cancelled or held up. The system, not a
 * person, makes these moves: the IT Admin of the task is named by the audit event of the task itself. The request is locked by the
 * caller (the gate), after the task, in the order the withdrawal takes them.
 */
@Injectable()
export class GroupGrantService {
  constructor(
    private readonly lines: RequestLineRepo,
    private readonly amounts: LineAmountRepo,
    private readonly resolution: GroupResolutionService,
    private readonly budgets: BudgetsService,
    private readonly audit: AuditService,
  ) {}

  /** The person's line, approved, becomes the one being carried out; the request is being carried out from the first. */
  async claim(tx: DbTx, request: AccessRequestRecord, employeeId: string): Promise<void> {
    const now = new Date();
    await this.lines.lock(tx, request.id, [employeeId]);
    await this.lines.move(tx, request.id, employeeId, { state: 'EXECUTING' });
    await this.record(tx, request, 'ACCESS_REQUEST.LINE_GRANT_STARTED', employeeId, {
      from: 'APPROVED',
      to: 'EXECUTING',
    });
    await this.resolution.resolve(tx, null, request.id, now);
  }

  /** The task of the person ended: the seat is real, or the IT Admin closed it as failed and the person's share goes back. */
  async report(tx: DbTx, request: AccessRequestRecord, outcome: GrantOutcome, employeeId: string): Promise<void> {
    const [line] = await this.lines.lock(tx, request.id, [employeeId]);
    // A task whose line is not being carried out changes nothing here.
    if (!line || line.state !== 'EXECUTING') return;
    const now = new Date();

    await this.lines.move(tx, request.id, employeeId, { state: outcome, endedAt: now });
    await this.record(
      tx,
      request,
      outcome === 'COMPLETED' ? 'ACCESS_REQUEST.LINE_GRANT_COMPLETED' : 'ACCESS_REQUEST.LINE_GRANT_FAILED',
      employeeId,
      { from: 'EXECUTING', to: outcome },
    );
    // A grant the IT Admin closed as failed spends nothing: the share of that person goes back, and nobody else's does (`AC-6`).
    if (outcome === 'FAILED') await this.release(tx, request.id, employeeId, 'GRANT_FAILED', now);
    await this.resolution.resolve(tx, null, request.id, now);
  }

  /** Whether the line of the person waits for the IT Admin to close the task of their grant as cancelled. */
  async isWithdrawing(tx: DbTx, request: AccessRequestRecord, employeeId: string): Promise<boolean> {
    const [line] = await this.lines.read(tx, request.id, [employeeId]);

    return line?.state === 'AWAITING_IT_CLOSE';
  }

  /** The IT Admin cancelled the failed task of a person who was withdrawn: the line ends as withdrawn and the share goes back. */
  async reportCancelled(tx: DbTx, request: AccessRequestRecord, employeeId: string): Promise<boolean> {
    const [line] = await this.lines.lock(tx, request.id, [employeeId]);
    if (!line || line.state !== 'AWAITING_IT_CLOSE') return false;
    const now = new Date();

    await this.lines.move(tx, request.id, employeeId, { state: 'WITHDRAWN', endedAt: now });
    await this.record(tx, request, 'ACCESS_REQUEST.LINE_WITHDRAWN', employeeId, {
      from: 'AWAITING_IT_CLOSE',
      to: 'WITHDRAWN',
      withdrawnByEmployeeId: line.endedByEmployeeId,
    });
    // The grant is cancelled and spends nothing: what was held for the person goes back (`US-05-08` AC-9).
    await this.release(tx, request.id, employeeId, 'PARTICIPANT_WITHDRAWN', now);
    await this.resolution.resolve(tx, null, request.id, now);

    return true;
  }

  /** Gives back what the person holds of the commitment, and says so on their shares. */
  async release(
    tx: DbTx,
    requestId: string,
    employeeId: string,
    reason: 'GRANT_FAILED' | 'PARTICIPANT_WITHDRAWN' | 'REQUEST_CANCELLED',
    now: Date,
  ): Promise<void> {
    const shares = shareToRelease(await this.amounts.of(requestId, employeeId, tx));
    if (shares.length === 0) return;

    await this.budgets.releaseForRequest(tx, {
      requestId,
      reason,
      amounts: shares.map((share) => ({ year: share.year, amountMinor: share.amountMinor })),
      now,
    });
    await this.amounts.markReleased(tx, requestId, employeeId, now);
  }

  private record(
    tx: DbTx,
    request: AccessRequestRecord,
    action: string,
    employeeId: string,
    after: { [key: string]: string | null },
  ): Promise<void> {
    return this.audit.record(tx, {
      organizationId: request.organizationId,
      actorKind: 'SYSTEM',
      action,
      resourceType: 'ACCESS_REQUEST',
      resourceId: request.id,
      before: null,
      after: {
        requestId: request.id,
        beneficiaryEmployeeId: employeeId,
        requesterEmployeeId: request.requesterEmployeeId,
        ...after,
      },
      correlationId: request.id,
    });
  }
}
