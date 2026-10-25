import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import type { RevocationContext, RevocationHook, RevocationReasonFacts, RevocationTaskFacts } from '../licensing.types';
import { licensingAuditEvent } from '../mappers/licensing-audit-event';
import { RegisteredRevocationHook } from '../provisioning/registered-revocation-hook.service';
import { gateOf } from './handover-confirmer.policy';
import { HandoverCaseFacts } from './handover-case-facts.service';
import { HandoverConfirmerResolver } from './handover-confirmer.resolver';
import { HandoverConfirmationPendingError } from './handover.errors';
import { HandoverRepo } from './handover.repo';
import { HandoverService } from './handover.service';

/** The name the handover takes in the registry of the hooks of a revocation, so it does not replace the hook of a return. */
const HOOK_NAME = 'HANDOVER_CONFIRMATION';

/**
 * What a revocation asks of the handover (`US-03-09` AC-3, AC-5, AC-6, `US-07-05` AC-13, AC-16, `US-07-09` AC-17): the duty is opened
 * with the task, the task is not taken or completed while the duty waits and its deadline has not ended, and work that goes on after
 * the deadline without the confirmation is flagged. The confirmation itself is never a result of the revocation and the revocation
 * never makes or removes one: every statement here runs in the transaction of the task, and a task closed as failed leaves the duty
 * as it was. It registers itself with licensing when the module starts, so licensing never imports it.
 */
@Injectable()
export class HandoverRevocationHook implements RevocationHook, OnModuleInit {
  constructor(
    private readonly registry: RegisteredRevocationHook,
    private readonly handovers: HandoverService,
    private readonly repo: HandoverRepo,
    private readonly facts: HandoverCaseFacts,
    private readonly resolver: HandoverConfirmerResolver,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this, HOOK_NAME);
  }

  onOpened(
    tx: DbTx,
    task: RevocationTaskFacts,
    reasons: readonly RevocationReasonFacts[],
    context: RevocationContext,
    actor: AuthenticatedPrincipal,
    now: Date,
  ): Promise<void> {
    return this.handovers.openFromTask(tx, actor, task, reasons, context, now);
  }

  /** Throws HandoverConfirmationPendingError while the seat has a duty that waits and whose deadline has not ended. */
  async beforeWork(tx: DbTx, task: RevocationTaskFacts, now: Date): Promise<void> {
    const duty = await this.repo.lockOpenOf(tx, task.assignmentId);
    if (!duty) return;

    const today = await this.facts.today(now, tx);
    if (gateOf({ confirmed: false, cancelled: false, dueOn: duty.dueOn }, today) !== 'HELD') return;

    const resolved = (await this.resolver.resolve([duty], today, tx)).get(duty.id);
    throw new HandoverConfirmationPendingError(
      duty.id,
      duty.dueOn,
      duty.confirmerRole,
      resolved?.confirmer.waiting ?? null,
    );
  }

  /** The work went on after the deadline of a duty nobody confirmed: the duty says so, once. */
  async afterWork(tx: DbTx, task: RevocationTaskFacts, now: Date, actor: AuthenticatedPrincipal): Promise<void> {
    const duty = await this.repo.lockOpenOf(tx, task.assignmentId);
    if (!duty) return;

    const today = await this.facts.today(now, tx);
    if (gateOf({ confirmed: false, cancelled: false, dueOn: duty.dueOn }, today) !== 'FLAGGED') return;
    if (!(await this.repo.markProceeded(tx, duty.id, now))) return;

    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        duty.organizationId,
        'HANDOVER_DUTY.FLAGGED_UNCONFIRMED',
        'HandoverDuty',
        duty.id,
        null,
        {
          assignmentId: duty.assignmentId,
          employeeId: duty.employeeId,
          revocationTaskId: task.id,
          taskStatus: task.status,
          dueOn: duty.dueOn,
          role: duty.confirmerRole,
        },
      ),
    );
  }

  afterClosedFailed(): Promise<void> {
    // A revocation that failed leaves the confirmation as it was and the seat held (`US-03-09` AC-4, `US-07-09` AC-19).
    return Promise.resolve();
  }
}
