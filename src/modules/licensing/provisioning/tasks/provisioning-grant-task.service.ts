import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { licensingAuditEvent } from '../../licensing-audit-event.mapper';
import { ProvisioningTaskFrame } from '../provisioning-task-frame.service';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';
import type { ProvisioningTaskRecord } from '../provisioning-task.types';
import { grantPurchaseOf, grantTaskAudit } from './provisioning-grant.policy';

/**
 * Inserts the manual task of a grant, records its creation audit event, and immediately claims it for the IT Admin
 * who performed the grant, notifying the Super Admin when they executed it for their own service account.
 */
@Injectable()
export class ProvisioningGrantTaskService {
  constructor(
    private readonly repo: ProvisioningTaskRepo,
    private readonly frame: ProvisioningTaskFrame,
    private readonly audit: AuditApi,
  ) {}

  async insertAndClaim(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    facts: {
      organizationId: string;
      assignmentId: string;
      requestId: string;
      defaultResponsibleEmployeeId: string | null;
      maxAttempts: number;
      provisioningType: string;
      purchase: { purchased: false } | { purchased: true; kind: 'POOL_TOP_UP' | 'KEY_PURCHASE'; reason: string | null };
      carriesOn: boolean;
      selfExecuted: boolean | null;
      bySubstitute?: boolean;
    },
  ): Promise<ProvisioningTaskRecord> {
    const bought = grantPurchaseOf(facts.provisioningType, facts.purchase, new Date(), facts.carriesOn);
    const task = await this.repo.insert(tx, {
      organizationId: facts.organizationId,
      assignmentId: facts.assignmentId,
      channel: 'MANUAL',
      requestId: facts.requestId,
      defaultResponsibleEmployeeId: facts.defaultResponsibleEmployeeId,
      createdByAppUserId: actor.appUserId,
      maxAttempts: facts.maxAttempts,
      ...(bought && { purchase: bought }),
    });

    await this.audit.record(
      tx,
      licensingAuditEvent(actor, facts.organizationId, 'PROVISIONING_TASK.CREATED', 'ProvisioningTask', task.id, null, {
        ...grantTaskAudit(facts.requestId, facts.assignmentId, task, facts.selfExecuted),
        ...(facts.bySubstitute ? { bySubstitute: true } : {}),
      }),
    );
    const taken = await this.takeTask(tx, actor, {
      task,
      organizationId: facts.organizationId,
      selfExecuted: facts.selfExecuted,
      bySubstitute: facts.bySubstitute,
    });
    if (facts.selfExecuted === true) {
      await this.frame.tellSuperAdmin(tx, facts.organizationId, task.id, actor.employeeId);
    }

    return taken;
  }

  private async takeTask(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    facts: {
      task: ProvisioningTaskRecord;
      organizationId: string;
      selfExecuted: boolean | null;
      bySubstitute?: boolean;
    },
  ): Promise<ProvisioningTaskRecord> {
    const { task } = facts;
    await this.repo.markClaimed(tx, task.id, actor.appUserId, new Date());
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        facts.organizationId,
        'PROVISIONING_TASK.CLAIMED',
        'ProvisioningTask',
        task.id,
        {
          status: task.status,
          claimedBy: task.claimedByAppUserId,
          attempts: task.attempts,
          defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
        },
        {
          status: 'IN_PROGRESS',
          claimedBy: actor.appUserId,
          defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
          selfExecuted: facts.selfExecuted === true,
          ...(facts.bySubstitute ? { bySubstitute: true } : {}),
        },
      ),
    );

    return (await this.repo.find(task.id, tx)) ?? task;
  }
}
