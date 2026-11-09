import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { BlockReason, BudgetOutcome } from '../spend/budget-check.policy';
import { BudgetCheckRepo, type CheckRecord } from '../spend/budget-check.repo';
import { SpendNotHeadError, SpendReserveRefusedError } from '../spend/spend.errors';
import { SpendRoutingService, type RoutingOutcome } from '../spend/spend-routing.service';
import { SpendStepRepo } from '../spend/spend-step.repo';
import { ReserveConfirmationRepo } from './reserve-confirmation.repo';
import { awaitsReserveConfirmation, checkConfirmer } from './reserve-confirmation.policy';

/** What a confirmation of the reserve did: the request after the check made again for the day of the confirmation. */
export interface ReserveConfirmationResult {
  requestId: string;
  result: 'SPEND_STEP_OPENED' | 'BLOCKED';
  budgetOutcome: BudgetOutcome;
  blockedReasons: BlockReason[];
  /** False when the check made again finds the request within the base, which needs no confirmation (nothing is written for it). */
  confirmationKept: boolean;
}

type Routed = Extract<RoutingOutcome, { status: 'ROUTED' }>;

/**
 * The head confirms, with one line of reason, that a request uses the reserve (`BR-MF1-06h`, `US-06-16` AC-1), alone or in the act of
 * sending the batch. The check is made again for the day of the confirmation (`QĐ-109e`) and decides: it still uses the reserve, and the spend
 * step is opened and the confirmation kept with it, the SLA of the step counted from now; it is within the base now, and the step is opened
 * with no confirmation; it is blocked now, and nothing is opened or kept. The confirmation belongs to the step it opened, so it stays when the
 * head changes, and a request sent back and sent on again is checked again and needs a new one.
 */
@Injectable()
export class ReserveConfirmationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly checks: BudgetCheckRepo,
    private readonly steps: SpendStepRepo,
    private readonly confirmations: ReserveConfirmationRepo,
    private readonly routing: SpendRoutingService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Throws AccessRequestNotFoundError, SpendNotHeadError (the caller does not head the department of the request) and
   * SpendReserveRefusedError (the request does not wait for the confirmation, or the head is a party to it).
   */
  async confirm(actor: AuthenticatedPrincipal, requestId: string, reason: string): Promise<ReserveConfirmationResult> {
    const today = await this.organizationReads.businessToday();
    const headed = (await this.organizationReads.getHeadedDepartment(actor.employeeId, today))?.departmentId ?? null;

    return this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request) throw new AccessRequestNotFoundError();
      const refusal = checkConfirmer({
        actorEmployeeId: actor.employeeId,
        headedDepartmentId: headed,
        requestDepartmentId: request.departmentId,
        requesterEmployeeId: request.requesterEmployeeId,
        beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
      });
      if (refusal === 'NOT_HEAD') throw new SpendNotHeadError();
      if (refusal) throw new SpendReserveRefusedError('RESERVE_CONFIRMER_IS_BENEFICIARY');

      const newest = await this.checks.latest(request.id, tx);
      const waiting = awaitsReserveConfirmation({
        state: request.state,
        newestCheckOutcome: newest?.outcome ?? null,
        hasOpenSpendStep: (await this.steps.findOpen(request.id, 'SPEND_APPROVAL', tx)) !== null,
      });
      if (!waiting) throw new SpendReserveRefusedError('RESERVE_NOT_PENDING');

      const now = new Date();
      const routed = await this.routing.route(tx, actor, request, 'RESERVE_CONFIRMATION', now);
      // A request that cannot be priced or converted now is not at fault of the head: it stays in the queue, as nothing was confirmed.
      if (routed.status === 'NOT_CHECKABLE') throw new SpendReserveRefusedError('RESERVE_NOT_PENDING');

      return this.resultOf(tx, actor, request, { routed, reason, now });
    });
  }

  /**
   * The confirmation the head gave in the act of sending a batch, for a request whose check just said it uses the reserve (the check was
   * made in the same transaction, so it is not made again): opens the spend step, keeps the confirmation with it and moves the request.
   */
  async confirmOnCheck(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    check: CheckRecord,
    by: { reason: string; now: Date },
  ): Promise<void> {
    const { state, step } = await this.routing.openSpend(tx, request, by.now);
    await this.requests.setState(tx, request.id, state);
    await this.confirmations.insert(tx, {
      organizationId: request.organizationId,
      requestId: request.id,
      checkId: check.id,
      spendStepId: step.id,
      reason: by.reason,
      confirmedByEmployeeId: actor.employeeId,
      confirmedAt: by.now,
    });
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.RESERVE_CONFIRMED',
        'ACCESS_REQUEST',
        request.id,
        {
          requestId: request.id,
          checkId: check.id,
          stepId: step.id,
          reason: by.reason,
          overBaseBy: check.overBaseByMinor?.toString() ?? null,
          state,
        },
      ),
    );
  }

  private async resultOf(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    by: { routed: Routed; reason: string; now: Date },
  ): Promise<ReserveConfirmationResult> {
    const { routed } = by;
    const base = { requestId: request.id, budgetOutcome: routed.outcome, blockedReasons: routed.check.blockReasons };
    if (routed.outcome === 'BLOCKED') return { ...base, result: 'BLOCKED', confirmationKept: false };
    if (routed.outcome === 'WITHIN_BASE') return { ...base, result: 'SPEND_STEP_OPENED', confirmationKept: false };

    await this.confirmOnCheck(tx, actor, request, routed.check, { reason: by.reason, now: by.now });

    return { ...base, result: 'SPEND_STEP_OPENED', confirmationKept: true };
  }
}
