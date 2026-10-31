import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import type { OpenRevocationInput, RevocationSource } from '../public/licensing.types';
import { RevocationListeners } from '../public/licensing.extension-points';
import { ProvisioningTaskFrame } from './provisioning-task-frame.service';
import { toRevocationFacts, type ProvisioningTaskRecord } from './provisioning-task.types';
import { ProvisioningTaskReasonRepo } from './provisioning-task-reason.repo';
import { reasonFactsOf, revocationOpenedAudit } from './revocation-open.policy';

/**
 * What opening a revocation writes beside the task (`US-07-05` AC-3, AC-11, AC-12, `SoD-5`): the reason, the audit event, the notice to the
 * Super Admin when an IT Admin asks for their own seat to go because no other IT Admin can, and the listeners of the moment it opens.
 */
@Injectable()
export class RevocationRecorder {
  constructor(
    private readonly reasons: ProvisioningTaskReasonRepo,
    private readonly audit: AuditApi,
    private readonly frame: ProvisioningTaskFrame,
    private readonly revocation: RevocationListeners,
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
    const reasons = (await this.reasons.listOf([task.id], tx)).map(reasonFactsOf);
    await this.revocation.emit(tx, {
      moment: 'OPENED',
      task: toRevocationFacts(task),
      reasons,
      context: input.context ?? {},
      actor,
      now: opened.now,
    });
  }
}
