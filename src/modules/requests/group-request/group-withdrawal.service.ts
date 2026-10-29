import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import {
  AccessRequestNotFoundError,
  AccessRequestWithdrawalRefusedError,
} from '../access-request/access-request.errors';
import { canViewRequest, viewFactsOf } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { checkWithdrawal } from '../withdraw/withdrawal.policy';
import { SpendStatusService } from '../spend/spend-status.service';
import { GroupGrantService } from './group-grant.service';
import { checkLineWithdrawal, holdsMoney } from './group-withdrawal.policy';
import { isEnded, type LineRecord } from './group-request.types';
import { GroupResolutionService } from './group-resolution.service';
import { shareToRelease } from './line-allocation.policy';
import { LineAmountRepo } from './line-amount.repo';
import { RequestLineRepo } from './request-line.repo';
import { RequestOutcomeService } from '../outcome/request-outcome.service';

/** What the withdrawal of one line did: it ended, or it waits for the IT Admin to close the task of a grant that had failed. */
type Withdrawn = { kind: 'ENDED'; released: boolean } | { kind: 'WAITING_FOR_IT'; taskId: string };

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
    private readonly amounts: LineAmountRepo,
    private readonly grant: GroupGrantService,
    private readonly resolution: GroupResolutionService,
    private readonly licensing: LicensingApi,
    private readonly organization: OrganizationApi,
    private readonly spendStatus: SpendStatusService,
    private readonly budgets: BudgetsApi,
    private readonly audit: AuditApi,
    private readonly outcomes: RequestOutcomeService,
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
      const done = await this.withdrawOne(tx, actor, request, line, reason, now);
      await this.afterWithdrawing(
        tx,
        actor,
        request,
        [{ line, done }],
        { reason, release: 'PARTICIPANT_WITHDRAWN' },
        now,
      );

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
        done.push({ line, done: await this.withdrawOne(tx, actor, request, line, reason, now) });
      }
      await this.afterWithdrawing(tx, actor, request, done, { reason, release: 'REQUEST_WITHDRAWN' }, now);

      return this.reread(tx, requestId);
    });
  }

  /** What becomes of the line in the state it is in; the refusals are thrown and undo whatever was done before. */
  private async withdrawOne(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    line: LineRecord,
    reason: string | null,
    now: Date,
  ): Promise<Withdrawn> {
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

  /** Gives back what the people hold, once for all of them, says what happened to each and lets the request follow its lines. */
  private async afterWithdrawing(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    withdrawn: readonly { line: LineRecord; done: Withdrawn }[],
    why: { reason: string | null; release: 'PARTICIPANT_WITHDRAWN' | 'REQUEST_WITHDRAWN' },
    now: Date,
  ): Promise<void> {
    const toRelease = withdrawn.filter((entry) => entry.done.kind === 'ENDED' && entry.done.released);
    const years = new Map<number, bigint>();
    for (const entry of toRelease) {
      const shares = shareToRelease(await this.amounts.of(request.id, entry.line.employeeId, tx));
      for (const share of shares) years.set(share.year, (years.get(share.year) ?? 0n) + share.amountMinor);
    }
    if (years.size > 0) {
      await this.budgets.releaseForRequest(tx, {
        requestId: request.id,
        reason: why.release,
        amounts: [...years].map(([year, amountMinor]) => ({ year, amountMinor })),
        now,
      });
      for (const entry of toRelease) await this.amounts.markReleased(tx, request.id, entry.line.employeeId, now);
    }

    for (const { line, done } of withdrawn) {
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          done.kind === 'ENDED' ? 'ACCESS_REQUEST.LINE_WITHDRAWN' : 'ACCESS_REQUEST.LINE_WITHDRAWAL_REQUESTED',
          'ACCESS_REQUEST',
          request.id,
          {
            requestId: request.id,
            beneficiaryEmployeeId: line.employeeId,
            from: line.state,
            to: done.kind === 'ENDED' ? 'WITHDRAWN' : 'AWAITING_IT_CLOSE',
            withdrawnByEmployeeId: actor.employeeId,
            reason: why.reason,
            requesterEmployeeId: request.requesterEmployeeId,
            byRequester: actor.employeeId === request.requesterEmployeeId,
            released: done.kind === 'ENDED' && done.released,
            ...(done.kind === 'WAITING_FOR_IT' ? { taskId: done.taskId } : {}),
          },
        ),
      );
      // The line of a person who was withdrawn ended for them without a grant; one that waits for the IT Admin has not ended yet (F43).
      if (done.kind === 'ENDED') await this.outcomes.ended(tx, request, [line.employeeId], now);
    }
    await this.resolution.resolve(tx, actor, request.id, now);
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
    const headed = await this.organization.getHeadedDepartment(actor.employeeId);

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
