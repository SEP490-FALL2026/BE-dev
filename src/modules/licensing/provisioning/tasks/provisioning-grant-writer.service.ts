import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import type { SeatTarget } from '../../../catalog/public/catalog.types';
import { AssignmentService } from '../../assignment/assignment.service';
import {
  AssignmentConflictError,
  GrantRequestRefusedError,
  ProvisioningSubscriptionError,
  SeatQuantityUnknownError,
  SeatTargetNotFoundError,
} from '../../public/licensing.errors';
import { GrantRequestGateHook } from '../../public/licensing.extension-points';
import { licensingAuditEvent } from '../../licensing-audit-event.mapper';
import { ProvisioningTaskFrame } from '../provisioning-task-frame.service';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';
import type { ProvisioningTaskRecord } from '../provisioning-task.types';
import type { GrantInput, ProvisioningGrantPlanner } from './provisioning-grant-planner.service';
import { claimMatchesAnswer, grantTaskAudit } from './provisioning-grant.policy';
import { effectiveEndOf } from '../../../../core/term-limit';
import type { GrantRequestAnswer } from '../../public/licensing.types';
import { ProvisioningHolderService } from './provisioning-holder.service';
import { SharedPoolService } from '../../shared-pool/shared-pool.service';
import type { PoolStock } from '../../shared-pool/shared-pool.policy';

type Planned = Awaited<ReturnType<ProvisioningGrantPlanner['plan']>>;

/**
 * Writes the grant of the seat of a request in its own transaction (`US-07-01`, `QĐ-89a`): the request is locked and moved to "being
 * carried out" (a second grant of it finds it no longer grantable), the seat target is locked, the holder is made, the assignment is written
 * and so is the manual task in the queue of the IT Admin in charge, with its audit event.
 */
@Injectable()
export class ProvisioningGrantWriter {
  constructor(
    private readonly repo: ProvisioningTaskRepo,
    private readonly frame: ProvisioningTaskFrame,
    private readonly holders: ProvisioningHolderService,
    private readonly assignments: AssignmentService,
    private readonly catalog: CatalogApi,
    private readonly audit: AuditApi,
    private readonly gate: GrantRequestGateHook,
    private readonly sharedPool: SharedPoolService,
  ) {}

  async write(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: GrantInput,
    planned: Planned,
  ): Promise<ProvisioningTaskRecord> {
    const { answer, plan, serviceIdentifier, organization, today, inCharge, maxAttempts } = planned;
    // The request is locked and moved to "being carried out" here, in the transaction of the grant: a second grant of
    // the same request finds it no longer grantable, and a request that changed since the read above is refused.
    const claimed = await this.gate.get().claimForGrant(tx, input.requestId, input.beneficiaryEmployeeId);
    if (claimed.status !== 'GRANTABLE') throw new GrantRequestRefusedError(claimed.status);
    if (!claimMatchesAnswer(claimed, answer)) throw new GrantRequestRefusedError('NOT_APPROVED');
    const subscriptionId = await this.subscriptionOf(tx, plan, input.subscriptionId, today);
    const target = await this.lockTarget(tx, plan, subscriptionId);
    // Judged under the locks of the grant, so the count of the free seats cannot change before the seat is written (`BR-MF1-09a`).
    const { decision: purchase, stock } = await this.sharedPool.judgePurchase(tx, {
      planId: plan.planId,
      provisioningType: plan.provisioningType,
      today,
      purchase: input.purchase,
    });
    await this.takeSeat(tx, actor, { plan, target, purchased: purchase.purchased, stock });
    const holder = await this.holderOf(tx, actor, { input, answer, claimed, serviceIdentifier, today });
    const assignment = await this.assignments.createFromRequest(tx, actor, {
      organizationId: organization.id,
      requestId: input.requestId,
      departmentId: answer.seat === 'SERVICE' ? answer.serviceAccount.departmentId : answer.departmentId,
      target,
      holder,
      effectiveFrom: today,
      expectedEndDate: this.endOfSeat(claimed, today),
    });

    const task = await this.repo.insert(tx, {
      organizationId: organization.id,
      assignmentId: assignment.id,
      channel: 'MANUAL',
      requestId: input.requestId,
      defaultResponsibleEmployeeId: inCharge?.itAdminEmployeeId ?? null,
      createdByAppUserId: actor.appUserId,
      maxAttempts,
      ...(purchase.purchased && {
        purchase: { kind: purchase.kind, reason: purchase.reason, purchasedAt: new Date() },
      }),
    });
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        organization.id,
        'PROVISIONING_TASK.CREATED',
        'ProvisioningTask',
        task.id,
        null,
        grantTaskAudit(input.requestId, assignment.id, task, holder.selfExecuted),
      ),
    );
    // An IT Admin who answers for the account themselves because no other can is told to the Super Admin (`SoD-5`).
    if (holder.selfExecuted === true) await this.frame.tellSuperAdmin(tx, organization.id, task.id, actor.employeeId);

    return task;
  }

  /**
   * The subscription the seat is taken from: the one the IT Admin names, else the one the shared pool of the plan gives (the primary
   * subscription, the one with a free seat first). Read before the subscription is locked; the lock that follows holds it for the grant.
   * Throws SeatTargetNotFoundError when the plan has no subscription a seat can be taken from today.
   */
  private async subscriptionOf(
    tx: DbTx,
    plan: SeatTarget,
    named: string | undefined,
    today: string,
  ): Promise<string | undefined> {
    if (named !== undefined || plan.provisioningType === 'K5') return named;
    const chosen = await this.sharedPool.chooseSubscription(tx, {
      planId: plan.planId,
      provisioningType: plan.provisioningType,
      today,
    });
    if (chosen === null) throw new SeatTargetNotFoundError('SUBSCRIPTION');

    return chosen;
  }

  /**
   * Makes room for the seat of this grant on the locked subscription. A K1 grant buys its own seat: the quantity rises by one, with no gate
   * on the department that owns the subscription (`S1-04`). A K2 or K4 grant with a purchase tops the pool up by one seat, since a grant is
   * for one person. A K2 or K4 grant with none must find a free seat in its subscription, else the answer says how many are free in the
   * plan's other subscriptions. Throws AssignmentConflictError.
   */
  private async takeSeat(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    facts: { plan: SeatTarget; target: SeatTarget; purchased: boolean; stock: PoolStock | null },
  ): Promise<void> {
    const { plan, target, purchased, stock } = facts;
    if (target.subscriptionId === null) return;
    if (plan.provisioningType === 'K1' || purchased) {
      await this.catalog.addPoolSeat(tx, actor, target.subscriptionId);

      return;
    }
    // Read under the lock of the subscription, so the count is the one the database trigger will see: refusing here keeps the transaction usable.
    if (stock !== null && stock.freeBySubscription.get(target.subscriptionId) === 0) {
      throw new AssignmentConflictError('SEAT_CAPACITY', 0, stock.free);
    }
  }

  /** The person or the service account the seat is for: a service account has the identifier and the responsible person the IT Admin gave. */
  private holderOf(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    facts: {
      input: GrantInput;
      answer: Planned['answer'];
      claimed: Extract<GrantRequestAnswer, { status: 'GRANTABLE' }>;
      serviceIdentifier: string | null;
      today: string;
    },
  ) {
    const { input, answer, claimed, serviceIdentifier, today } = facts;

    return claimed.seat === 'SERVICE' && serviceIdentifier !== null
      ? this.holders.service(tx, actor, {
          requested: { employeeId: claimed.employeeId, account: claimed.serviceAccount },
          named: input.responsibleEmployeeId,
          accountIdentifier: serviceIdentifier,
          today,
        })
      : this.holders.personal(tx, actor, {
          requestId: input.requestId,
          employeeId: answer.employeeId,
          accountIdentifier: input.accountIdentifier,
          today,
        });
  }

  /**
   * The day the seat ends: the day the request carries (the IT Admin names none, `Q-03` c1), else the end of its term for a request that
   * costs money, never cut at the end of the calendar year (`QĐ-98`, `QĐ-104a`); free internal software and a service account have none.
   */
  private endOfSeat(claimed: Extract<GrantRequestAnswer, { status: 'GRANTABLE' }>, today: string): string | null {
    if (claimed.expectedEndDate !== null) return claimed.expectedEndDate;
    if (!claimed.termBound) return null;

    return effectiveEndOf({ start: today, months: claimed.termMonths });
  }

  /** K5: the plan itself (no seat); K1 and K2: the subscription, which must be of the plan and have a quantity. */
  private async lockTarget(tx: DbTx, plan: SeatTarget, subscriptionId: string | undefined): Promise<SeatTarget> {
    const target = await this.catalog.lockSeatTarget(tx, subscriptionId ? { subscriptionId } : { planId: plan.planId });
    if (!target) throw new SeatTargetNotFoundError(subscriptionId ? 'SUBSCRIPTION' : 'PLAN');
    if (target.planId !== plan.planId) throw new ProvisioningSubscriptionError('PLAN_MISMATCH');
    this.assignments.assertSeatTargetUsable(target);
    if (target.kind === 'SUBSCRIPTION' && target.purchasedQuantity === null) throw new SeatQuantityUnknownError();

    return target;
  }
}
