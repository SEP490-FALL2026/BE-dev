import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import type { OpenRevocationInput, RevocationSource } from '../public/licensing.types';
import { RevocationListeners } from '../public/licensing.extension-points';
import { ProvisioningTaskFrame } from './provisioning-task-frame.service';
import { toRevocationFacts, type ProvisioningTaskRecord } from './provisioning-task.types';
import { ProvisioningTaskReasonRepo } from './provisioning-task-reason.repo';
import { ProvisioningTaskRepo } from './provisioning-task.repo';
import { effectiveTiming, reasonFactsOf, revocationOpenedAudit, type RevocationTiming } from './revocation-open.policy';

/**
 * What opening a revocation writes beside the task (`US-07-05` AC-3, AC-11, AC-12, `SoD-5`): the reason, the audit event, the notice to the
 * Super Admin when an IT Admin asks for their own seat to go because no other IT Admin can, the timing the reasons that stand ask of the
 * task, the notice to the person who holds the seat when the source asked for it (`US-10-06` AC-2), and the listeners of the moment it opens.
 */
@Injectable()
export class RevocationRecorder {
  constructor(
    private readonly reasons: ProvisioningTaskReasonRepo,
    private readonly audit: AuditApi,
    private readonly frame: ProvisioningTaskFrame,
    private readonly revocation: RevocationListeners,
    private readonly tasks: ProvisioningTaskRepo,
    private readonly notifications: NotificationsApi,
  ) {}

  async record(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    opened: {
      organizationId: string;
      task: ProvisioningTaskRecord;
      reused: boolean;
      assignmentId: string;
      source: RevocationSource;
      input: OpenRevocationInput;
      selfExecuted: boolean;
      timing: RevocationTiming;
      /** The seat as the holder is told of it. */
      plan: { planId: string; applicationId: string };
      now: Date;
    },
  ): Promise<void> {
    const { task, input } = opened;
    const reason = await this.reasons.insert(tx, {
      taskId: task.id,
      source: opened.source,
      decidedByEmployeeId: input.decision.decidedByEmployeeId ?? null,
      decidedRole: input.decision.decidedRole.trim(),
      referenceKind: input.decision.referenceKind ?? null,
      referenceId: input.decision.referenceId ?? null,
      note: input.decision.note?.trim() || null,
      dueOn: opened.timing.dueOn,
      notBefore: opened.timing.notBefore,
    });
    // The audit event carries who decided and on what, never the note or the account.
    const recorded = revocationOpenedAudit({
      reused: opened.reused,
      task,
      assignmentId: opened.assignmentId,
      reason,
      selfExecuted: opened.selfExecuted,
    });
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        opened.organizationId,
        recorded.action,
        'ProvisioningTask',
        task.id,
        recorded.before,
        recorded.after,
      ),
    );
    // An IT Admin who asks for their own seat to go because no other IT Admin can is told to the Super Admin (`SoD-5`).
    if (opened.selfExecuted) await this.frame.tellSuperAdmin(tx, opened.organizationId, task.id, actor.employeeId);
    const standing = await this.reasons.listOf([task.id], tx);
    // A task that was completed is final: its timing is read from the reasons only while it can still be worked.
    if (task.status !== 'COMPLETED') await this.tasks.markTiming(tx, task.id, effectiveTiming(standing));
    if (input.notice?.holder) await this.tellHolder(tx, opened, reason.referenceId);
    await this.revocation.emit(tx, {
      moment: 'OPENED',
      task: toRevocationFacts(task),
      reasons: standing.map(reasonFactsOf),
      context: input.context ?? {},
      actor,
      now: opened.now,
    });
  }

  /**
   * The holder of the seat is told its revocation is coming and from which day (`US-10-06` AC-2). The same source and reference tells
   * once: a decision taken again after a return changes nothing the holder was not told.
   */
  private async tellHolder(
    tx: DbTx,
    opened: {
      organizationId: string;
      task: ProvisioningTaskRecord;
      source: RevocationSource;
      timing: RevocationTiming;
      plan: { planId: string; applicationId: string };
    },
    referenceId: string | null,
  ): Promise<void> {
    await this.notifications.notifyInApp(tx, {
      organizationId: opened.organizationId,
      recipientEmployeeId: opened.task.assignment.employeeId,
      code: 'REVOCATION_UPCOMING',
      subject: { type: 'PROVISIONING_TASK', id: opened.task.id },
      params: {
        taskId: opened.task.id,
        planId: opened.plan.planId,
        applicationId: opened.plan.applicationId,
        source: opened.source,
        notBefore: opened.timing.notBefore,
      },
      eventKey: `REVOCATION_UPCOMING:${opened.source}:${referenceId ?? opened.task.id}`,
    });
  }
}
