import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { licensingAuditEvent } from '../../licensing-audit-event.mapper';
import { RevocationListeners } from '../../public/licensing.extension-points';
import {
  NO_LONGER_APPLIES,
  type WithdrawnRevocation,
  type WithdrawRevocationInput,
} from '../../public/licensing.types';
import { ProvisioningTaskReasonRepo, type ReasonRecord } from '../provisioning-task-reason.repo';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';
import { toRevocationFacts, type ProvisioningTaskRecord } from '../provisioning-task.types';
import { effectiveTiming, reasonFactsOf } from '../revocation-open.policy';
import { isEnded, withdrawalOutcome } from './revocation-withdrawal.policy';

/**
 * A source takes back its own reason for a revocation (`BR-MF5-04`, `US-07-05` AC-22; for MF-5, the IT Admin who returns the ghost seat
 * recommendation): in the transaction of that source, under the lock of the task (the order of whoever works a revocation: the task
 * first). The reason is marked withdrawn and read nowhere after it; the task goes on with the reasons that stand, with the timing read
 * from them again, or is cancelled as no longer applying and leaves its assignment as it was. The listeners are told. Asking twice, or for
 * a task that ended, changes nothing.
 */
@Injectable()
export class RevocationWithdrawalService {
  constructor(
    private readonly tasks: ProvisioningTaskRepo,
    private readonly reasons: ProvisioningTaskReasonRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly revocation: RevocationListeners,
  ) {}

  async withdraw(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: WithdrawRevocationInput,
  ): Promise<WithdrawnRevocation> {
    const task = await this.tasks.lockLiveRevocation(tx, input.assignmentId);
    if (!task) return { taskId: null, outcome: 'NOT_FOUND' };
    if (isEnded(task.status)) return { taskId: task.id, outcome: 'ALREADY_ENDED' };

    const reason = await this.reasons.find(tx, task.id, input.source, input.referenceId);
    if (!reason) return { taskId: task.id, outcome: 'NOT_FOUND' };

    const now = new Date();
    await this.reasons.withdraw(tx, reason.id, { appUserId: actor.appUserId, cause: input.cause, now });
    const remaining = await this.reasons.listOf([task.id], tx);
    const outcome = withdrawalOutcome({
      status: task.status,
      remaining: remaining.length,
      claimedBy: task.claimedByAppUserId,
      cancelInProgressClaimedBy: input.cancelInProgressClaimedBy,
    });
    const cancelled = outcome === 'CANCELLED';
    if (cancelled) await this.tasks.markCancelled(tx, task.id, actor.appUserId, NO_LONGER_APPLIES, now);
    else await this.tasks.markTiming(tx, task.id, effectiveTiming(remaining));

    await this.record(tx, actor, { task, reason, input, remaining: remaining.length, outcome });
    await this.revocation.emit(tx, {
      moment: 'REASON_WITHDRAWN',
      task: { ...toRevocationFacts(task), status: cancelled ? 'CANCELLED' : task.status },
      withdrawn: reasonFactsOf(reason),
      remaining: remaining.map(reasonFactsOf),
      cancelled,
      now,
      actor,
    });

    return { taskId: task.id, outcome };
  }

  /** The audit events of a withdrawal: the reason taken back and, when it ended the task, the cancellation. */
  private async record(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    done: {
      task: ProvisioningTaskRecord;
      reason: ReasonRecord;
      input: WithdrawRevocationInput;
      remaining: number;
      outcome: WithdrawnRevocation['outcome'];
    },
  ): Promise<void> {
    const { task, reason, input, remaining, outcome } = done;
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('A revocation reason was withdrawn before installation');
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        organization.id,
        'PROVISIONING_TASK.REASON_WITHDRAWN',
        'ProvisioningTask',
        task.id,
        { status: task.status },
        {
          assignmentId: task.assignmentId,
          source: reason.source,
          referenceKind: reason.referenceKind,
          referenceId: reason.referenceId,
          cause: input.cause,
          remainingReasons: remaining,
          outcome,
        },
      ),
    );
    if (outcome !== 'CANCELLED') return;
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        organization.id,
        'PROVISIONING_TASK.CANCELLED',
        'ProvisioningTask',
        task.id,
        { status: task.status },
        { status: 'CANCELLED', taskKind: 'REVOKE', closeReason: NO_LONGER_APPLIES, assignmentStillOpen: true },
      ),
    );
  }
}
