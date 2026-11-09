import { Injectable } from '@nestjs/common';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ProvisioningTaskNotFoundError } from '../public/licensing.errors';
import type { SelfExecutionMode } from '../public/licensing.types';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { assertItAdmin, selfExecution } from './provisioning.policy';
import type { ProvisioningTaskRecord } from './provisioning-task.types';
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
 * The shared frame of what a person does to a task, whichever action it is: the role of the person (only an IT Admin, judged
 * here and not only by the guard of the route), the task locked, the rule of the action on its state, the rule for an IT
 * Admin who is the beneficiary (`QĐ-77m`), then the write and its audit event in the same transaction. The audit event carries
 * the state before, the person in charge by default and whether the IT Admin served themselves; the Super Admin is told once for
 * a task an IT Admin served themselves (`SoD-5`). A write that returns false changed nothing and records nothing.
 */
@Injectable()
export class ProvisioningTaskFrame {
  constructor(
    private readonly repo: ProvisioningTaskRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly notifications: NotificationsApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws ProvisioningItAdminRequiredError, ProvisioningTaskNotFoundError, what `check` throws, ProvisioningAnotherItAdminNeededError and what `write` throws. */
  async work(
    actor: AuthenticatedPrincipal,
    id: string,
    action: {
      check: (task: ProvisioningTaskRecord) => void;
      write: (context: TaskWorkContext) => Promise<TaskWrite>;
    },
  ): Promise<ProvisioningTaskRecord> {
    assertItAdmin(actor);
    const organization = await this.requireOrganization();
    const now = new Date();

    return this.runner.run(async (tx) => {
      const task = await this.repo.lock(tx, id);
      if (!task) throw new ProvisioningTaskNotFoundError();
      action.check(task);
      const mode = await this.selfExecutionMode(actor, task.assignment.employeeId, tx);
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
      if (mode === 'ALLOW_SELF_EXECUTED') {
        await this.tellSuperAdmin(tx, organization.id, task.id, actor.employeeId);
      }

      return (await this.repo.find(task.id, tx)) ?? task;
    });
  }

  /**
   * The rule for an IT Admin who works for a person who is themselves (`QĐ-77m`): not while another usable IT Admin can, and
   * marked as self-executed when none can. The other IT Admins are counted in the transaction of the act (`tx`), so one who is
   * locked at the same moment is not counted (F24). Throws ProvisioningAnotherItAdminNeededError.
   */
  async selfExecutionMode(
    actor: AuthenticatedPrincipal,
    beneficiaryEmployeeId: string,
    tx?: DbTx,
  ): Promise<SelfExecutionMode> {
    const isSelf = actor.employeeId === beneficiaryEmployeeId;

    return selfExecution({
      actorEmployeeId: actor.employeeId,
      beneficiaryEmployeeId,
      otherUsableItAdmins: isSelf ? await this.identity.countUsableItAdminsExcept(actor.employeeId, tx) : 0,
    });
  }

  /**
   * Tells the Super Admin, in the transaction of the act, that an IT Admin served themselves because no other could (`SoD-5`,
   * `QĐ-77m`): once for the task, whatever the number of acts on it. Nobody is told when no Super Admin can act.
   */
  async tellSuperAdmin(tx: DbTx, organizationId: string, taskId: string, itAdminEmployeeId: string): Promise<void> {
    const recipient = await this.identity.findUsableSuperAdminEmployeeId(tx);
    if (recipient === null) return;

    await this.notifications.notifyInApp(tx, {
      organizationId,
      recipientEmployeeId: recipient,
      code: 'IT_ADMIN_SELF_EXECUTED',
      subject: { type: 'ProvisioningTask', id: taskId },
      params: { taskId, employeeId: itAdminEmployeeId },
      eventKey: `IT_ADMIN_SELF_EXECUTED:${taskId}`,
    });
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A provisioning task was changed before installation');

    return organization;
  }
}
