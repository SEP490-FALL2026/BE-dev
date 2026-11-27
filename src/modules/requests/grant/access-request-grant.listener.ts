import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { GrantRequestGateHook, type GrantRequestGate } from '../../licensing/public/licensing.extension-points';
import type {
  GrantOutcome,
  GrantOutcomeFacts,
  GrantRequestAnswer,
  ProvisioningKind,
} from '../../licensing/public/licensing.types';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { GroupGrantService } from '../group-request/group-grant.service';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import { RenewalApplyService } from '../renewal-apply/renewal-apply.service';
import { GrantSettlementService } from './grant-settlement.service';
import { grantAnswerFor } from './grant.policy';
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
    private readonly settlement: GrantSettlementService,
    private readonly group: GroupGrantService,
    private readonly outcomes: RequestOutcomeService,
    private readonly seats: SeatReleaseService,
    private readonly hook: GrantRequestGateHook,
    private readonly renewals: RenewalApplyService,
  ) {}

  /**
   * The IT Admin completed the task that extends a right (`BR-MF1-08d`): the renewal it answers for is applied. A request that is not a
   * renewal waiting for it (withdrawn, or already applied) changes nothing.
   */
  async reportExtended(tx: DbTx, actor: AuthenticatedPrincipal, requestId: string, now: Date): Promise<void> {
    const request = await this.repo.lockById(tx, requestId);
    if (!request || request.type !== 'RENEWAL' || request.state !== 'AWAITING_EXECUTION') return;

    await this.renewals.apply(tx, actor, request, now);
  }

  /**
   * The IT Admin closed the task that extends a right as failed (`BR-MF1-08d`): the renewal fails as a grant that failed does, what was held
   * for it goes back and the right keeps its old end. A request that is not a renewal waiting for it changes nothing.
   */
  async reportExtensionFailed(tx: DbTx, actor: AuthenticatedPrincipal, requestId: string, now: Date): Promise<void> {
    const request = await this.repo.lockById(tx, requestId);
    if (!request || request.type !== 'RENEWAL' || request.state !== 'AWAITING_EXECUTION') return;

    await this.renewals.extensionFailed(tx, actor, request, now);
    await this.outcomes.ended(tx, request, request.beneficiaryEmployeeIds, now);
  }

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

  reportRightReplaced(
    tx: DbTx,
    input: {
      assignmentId: string;
      provisioningType: ProvisioningKind;
      endedOn: BusinessDate;
      now: Date;
      newRequestId?: string;
    },
  ): Promise<void> {
    return this.seats.afterRightReplaced(tx, input);
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
        ...(facts ? { fromPool: facts.fromPool } : {}),
      },
    );
    // Failed grants release commitment; completed K4/pool grants settle lot charges / avoided cost.
    if (outcome === 'FAILED') {
      await this.settlement.release(tx, { requestId: request.id, reason: 'GRANT_FAILED', now });
    }
    if (outcome === 'COMPLETED' && facts) {
      await this.seats.afterGrant(tx, request.id, facts, now);
    }
    await this.settlement.settleOutcomeEffects(tx, request, outcome, employeeId, facts, now);
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
    const now = new Date();
    if (outcome === 'COMPLETED' && facts) {
      await this.seats.afterGrant(tx, request.id, facts, now);
    }
    await this.settlement.settleOutcomeEffects(tx, request, outcome, employeeId, facts, now);
  }

  /** Active beneficiary count (`m`) and charged excess count per `REQUEST` lot (`F11`). */
  reservedForRequestLots(
    lotRequests: readonly { lotId: string; requestId: string }[],
    tx?: DbTx,
  ): Promise<Map<string, { beneficiaries: number; chargedExcess: number }>> {
    return this.settlement.reservedForRequestLots(lotRequests, tx);
  }

  hasLotCharges(lotId: string, tx?: DbTx): Promise<boolean> {
    return this.settlement.hasLotCharges(lotId, tx);
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
    await this.settlement.release(tx, { requestId: request.id, reason: 'REQUEST_WITHDRAWN', now });
    await this.outcomes.ended(tx, request, request.beneficiaryEmployeeIds, now);

    return true;
  }

  async checkSeatPurchaseItems(
    tx: DbTx,
    items: readonly { requestId: string; beneficiaryEmployeeId: string }[],
    expectedPlanId: string,
  ): Promise<Set<string>> {
    const requestIds = [...new Set(items.map((item) => item.requestId))];
    const requests = await this.repo.findByIds(requestIds, tx);
    const byId = new Map(requests.map((r) => [r.id, r]));
    const valid = new Set<string>();
    for (const item of items) {
      if (isSeatPurchaseItemEligible(byId.get(item.requestId), item.beneficiaryEmployeeId, expectedPlanId)) {
        valid.add(`${item.requestId}:${item.beneficiaryEmployeeId}`);
      }
    }

    return valid;
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

function isSeatPurchaseItemEligible(
  request: Awaited<ReturnType<AccessRequestRepo['findByIds']>>[number] | undefined,
  beneficiaryEmployeeId: string,
  expectedPlanId: string,
): boolean {
  if (!request || request.planId !== expectedPlanId || request.type === 'RENEWAL') return false;
  if (request.type === 'GROUP_GRANT') {
    const line = request.lines?.find((l) => l.employeeId === beneficiaryEmployeeId);
    return line !== undefined && (line.state === 'APPROVED' || line.state === 'EXECUTING');
  }
  const openState = request.state === 'AWAITING_EXECUTION' || request.state === 'EXECUTING';
  const matchesPerson =
    request.beneficiaryEmployeeIds.includes(beneficiaryEmployeeId) ||
    request.serviceAccount?.responsibleEmployeeId === beneficiaryEmployeeId;

  return openState && matchesPerson;
}
