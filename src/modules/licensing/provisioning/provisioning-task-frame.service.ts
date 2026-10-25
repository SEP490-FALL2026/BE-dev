import { Injectable } from '@nestjs/common';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { OrganizationService } from '../../organization/organization.service';
import { ProvisioningTaskNotFoundError } from '../licensing.errors';
import type { SelfExecutionMode } from '../licensing.types';
import { licensingAuditEvent } from '../mappers/licensing-audit-event';
import { selfExecution } from './provisioning.policy';
import type { ProvisioningTaskRecord } from './provisioning-task.record';
import { ProvisioningTaskRepo } from './provisioning-task.repo';

/** What a write of one of the actions decided: the audit action and the after-snapshot, or nothing changed. */
export type TaskWrite = false | { action: string; after: Record<string, string | number | boolean | null> };

export interface TaskWorkContext {
  tx: DbTx;
  task: ProvisioningTaskRecord;
  organizationId: string;
  now: Date;
}

/**
 * The shared frame of what a person does to a task, whichever action it is: the task locked, the rule of the action on its
 * state, the rule for an IT Admin who is the beneficiary (`QĐ-77m`), then the write and its audit event in the same
 * transaction. The audit event carries the state before, the person in charge by default and whether the IT Admin served
 * themselves. A write that returns false changed nothing and records nothing.
 */
@Injectable()
export class ProvisioningTaskFrame {
  constructor(
    private readonly repo: ProvisioningTaskRepo,
    private readonly organization: OrganizationService,
    private readonly identity: IdentityAccessService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws ProvisioningTaskNotFoundError, what `check` throws, ProvisioningAnotherItAdminNeededError and what `write` throws. */
  async work(
    actor: AuthenticatedPrincipal,
    id: string,
    action: {
      check: (task: ProvisioningTaskRecord) => void;
      write: (context: TaskWorkContext) => Promise<TaskWrite>;
    },
  ): Promise<ProvisioningTaskRecord> {
    const organization = await this.requireOrganization();
    const now = new Date();

    return this.runner.run(async (tx) => {
      const task = await this.repo.lock(tx, id);
      if (!task) throw new ProvisioningTaskNotFoundError();
      action.check(task);
      const mode = await this.selfExecutionMode(actor, task.assignment.employeeId);
      const done = await action.write({ tx, task, organizationId: organization.id, now });
      if (done === false) return task;

      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          organization.id,
          `PROVISIONING_TASK.${done.action}`,
          'ProvisioningTask',
          task.id,
          {
            status: task.status,
            claimedBy: task.claimedByAppUserId,
            attempts: task.attempts,
            defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
          },
          {
            ...done.after,
            defaultResponsibleEmployeeId: task.defaultResponsibleEmployeeId,
            selfExecuted: mode === 'ALLOW_SELF_EXECUTED',
          },
        ),
      );

      return (await this.repo.find(task.id, tx)) ?? task;
    });
  }

  /**
   * The rule for an IT Admin who works for a person who is themselves (`QĐ-77m`): not while another usable IT Admin can, and
   * marked as self-executed when none can. Throws ProvisioningAnotherItAdminNeededError.
   */
  async selfExecutionMode(actor: AuthenticatedPrincipal, beneficiaryEmployeeId: string): Promise<SelfExecutionMode> {
    const isSelf = actor.employeeId === beneficiaryEmployeeId;

    return selfExecution({
      actorEmployeeId: actor.employeeId,
      beneficiaryEmployeeId,
      otherUsableItAdmins: isSelf ? await this.identity.countUsableItAdminsExcept(actor.employeeId) : 0,
    });
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A provisioning task was changed before installation');

    return organization;
  }
}
