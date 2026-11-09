import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import { GrantRequestGateHook, type GrantRequestGate } from '../../licensing/public/licensing.extension-points';
import type { GrantOutcome, GrantOutcomeFacts, GrantRequestAnswer } from '../../licensing/public/licensing.types';
import { GroupGrantService } from '../group-request/group-grant.service';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { grantAnswerFor } from './grant.policy';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import { SeatReleaseService } from './seat-release.service';

/**
 * What the grant of a seat asks of the module of requests (`GrantRequestGate`, bound to licensing's `GrantRequestGateHook` when the
 * module starts). The request is locked inside the transaction of the grant and moved to EXECUTING there, which is what lets it
 * be granted once; the outcome of the task moves it to COMPLETED or FAILED in the transaction that ends the task. The
 * system, not a person, makes these moves: the person is the IT Admin of the task, whose own audit event names them. A
 * request whose requester withdrew while the grant had failed waits (`AWAITING_IT_CLOSE`) for the IT Admin to cancel the
 * task, which ends it as withdrawn (`US-05-08` AC-9).
 */
@Injectable()
export class AccessRequestGrantGate implements GrantRequestGate, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [GrantRequestGateHook] as const;

  constructor(
    private readonly repo: AccessRequestRepo,
    private readonly audit: AuditApi,
    private readonly budgets: BudgetsApi,
    private readonly group: GroupGrantService,
    private readonly outcomes: RequestOutcomeService,
    private readonly seats: SeatReleaseService,
    private readonly hook: GrantRequestGateHook,
  ) {}

  onModuleInit(): void {
    this.hook.bind(this);
  }

  async check(requestId: string, employeeId?: string): Promise<GrantRequestAnswer> {
    const request = await this.repo.findById(requestId);

    return request ? grantAnswerFor(request, employeeId) : { status: 'NOT_FOUND' };
  }

  async claimForGrant(tx: DbTx, requestId: string, employeeId?: string): Promise<GrantRequestAnswer> {
    const request = await this.repo.lockById(tx, requestId);
    if (!request) return { status: 'NOT_FOUND' };
    const answer = grantAnswerFor(request, employeeId);
    if (answer.status !== 'GRANTABLE') return answer;
    // A request for a group is carried out for one person at a time: the line of the person is what is claimed.
    if (request.type === 'GROUP_GRANT') {
      await this.group.claim(tx, request, answer.employeeId);

      return answer;
    }

    await this.repo.setState(tx, request.id, 'EXECUTING');
    await this.record(tx, request.organizationId, 'ACCESS_REQUEST.GRANT_STARTED', request.id, {
      requestId: request.id,
      from: request.state,
      to: 'EXECUTING',
    });

    return answer;
  }

  async reportOutcome(
    tx: DbTx,
    requestId: string,
    outcome: GrantOutcome,
    employeeId?: string,
    facts?: GrantOutcomeFacts,
  ): Promise<void> {
    const request = await this.repo.lockById(tx, requestId);
    if (request?.type === 'GROUP_GRANT') return this.reportOfGroup(tx, request, outcome, employeeId, facts);
    // A task whose request is not being carried out (an older grant, or a request of another kind) changes nothing here.
    if (!request || request.state !== 'EXECUTING') return;

    const now = new Date();
    await this.repo.setGrantOutcome(tx, request.id, outcome, now);
    await this.record(
      tx,
      request.organizationId,
      outcome === 'COMPLETED' ? 'ACCESS_REQUEST.GRANT_COMPLETED' : 'ACCESS_REQUEST.GRANT_FAILED',
      request.id,
      {
        requestId: request.id,
        from: 'EXECUTING',
        to: outcome,
        // Whether the seat came from the stock of the pool: what the cost avoided is read by (`BR-MF1-09c`).
        ...(facts ? { fromPool: facts.fromPool } : {}),
      },
    );
    // A grant the IT Admin closed as failed spends nothing: what was held goes back to the budget in the same transaction
    // (US-06-06 AC-3). A grant that is only retrying is not reported here, so its commitment stays held (AC-7).
    if (outcome === 'FAILED') {
      await this.budgets.releaseForRequest(tx, { requestId: request.id, reason: 'GRANT_FAILED', now });
    }
    // A K2 seat granted after its commitment began gives back the days before the grant, in the same transaction (`M-10`).
    if (outcome === 'COMPLETED' && facts) await this.seats.afterGrant(tx, request.id, facts, now);
    // The seat is real, or the request ended without one: the contexts that follow what became of it hear it here.
    if (outcome === 'COMPLETED') await this.outcomes.granted(tx, request, request.beneficiaryEmployeeIds, now);
    else await this.outcomes.ended(tx, request, request.beneficiaryEmployeeIds, now);
  }

  /** One person of a group: the line says how it ended, and a seat granted after the commitment began gives back its days before (`M-10`). */
  private async reportOfGroup(
    tx: DbTx,
    request: AccessRequestRecord,
    outcome: GrantOutcome,
    employeeId: string | undefined,
    facts: GrantOutcomeFacts | undefined,
  ): Promise<void> {
    if (employeeId === undefined) return;
    await this.group.report(tx, request, outcome, employeeId);
    if (outcome === 'COMPLETED' && facts) await this.seats.afterGrant(tx, request.id, facts, new Date());
  }

  async isWithdrawing(tx: DbTx, requestId: string, employeeId?: string): Promise<boolean> {
    const request = await this.repo.findById(requestId, tx);
    if (request?.type === 'GROUP_GRANT') {
      return employeeId !== undefined && (await this.group.isWithdrawing(tx, request, employeeId));
    }

    return request?.state === 'AWAITING_IT_CLOSE';
  }

  async reportCancelled(tx: DbTx, requestId: string, employeeId?: string): Promise<boolean> {
    const request = await this.repo.lockById(tx, requestId);
    if (request?.type === 'GROUP_GRANT') {
      return employeeId !== undefined && (await this.group.reportCancelled(tx, request, employeeId));
    }
    if (!request || request.state !== 'AWAITING_IT_CLOSE' || !request.withdrawal) return false;
    const now = new Date();

    await this.repo.setWithdrawal(tx, request.id, { ...request.withdrawal, withdrawnAt: now }, 'WITHDRAWN');
    await this.record(tx, request.organizationId, 'ACCESS_REQUEST.WITHDRAWN', request.id, {
      requestId: request.id,
      from: 'AWAITING_IT_CLOSE',
      to: 'WITHDRAWN',
      withdrawnByEmployeeId: request.withdrawal.requestedByEmployeeId,
    });
    // The grant is cancelled and spends nothing: what was held for the request goes back (US-05-08 AC-9).
    await this.budgets.releaseForRequest(tx, { requestId: request.id, reason: 'REQUEST_WITHDRAWN', now });
    await this.outcomes.ended(tx, request, request.beneficiaryEmployeeIds, now);

    return true;
  }

  private record(
    tx: DbTx,
    organizationId: string,
    action: string,
    requestId: string,
    after: { [key: string]: string | boolean | null },
  ): Promise<void> {
    return this.audit.record(tx, {
      organizationId,
      actorKind: 'SYSTEM',
      action,
      resourceType: 'ACCESS_REQUEST',
      resourceId: requestId,
      before: null,
      after,
      correlationId: requestId,
    });
  }
}
