import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import type { SeatTarget } from '../../../catalog/public/catalog.types';
import { AssignmentService } from '../../assignment/assignment.service';
import {
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
    const target = await this.lockTarget(tx, plan, input.subscriptionId);
    const holder =
      claimed.seat === 'SERVICE' && serviceIdentifier !== null
        ? await this.holders.service(tx, actor, {
            requested: { employeeId: claimed.employeeId, account: claimed.serviceAccount },
            named: input.responsibleEmployeeId,
            accountIdentifier: serviceIdentifier,
            today,
          })
        : await this.holders.personal(tx, actor, {
            requestId: input.requestId,
            employeeId: answer.employeeId,
            accountIdentifier: input.accountIdentifier,
            today,
          });

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
