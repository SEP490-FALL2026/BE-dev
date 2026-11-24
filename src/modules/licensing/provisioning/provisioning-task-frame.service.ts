import { Injectable } from '@nestjs/common';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import { ProvisioningTaskNotFoundError } from '../public/licensing.errors';
import type { SelfExecutionMode } from '../public/licensing.types';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { assertActingItAdmin, assertItAdmin, selfExecution } from './provisioning.policy';
import { ProvisioningNotInChargeError } from './provisioning.errors';
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
const CLOSING_TASK_ACTIONS = new Set(['COMPLETED', 'REVOCATION_COMPLETED', 'CLOSED_FAILED', 'CANCELLED']);

@Injectable()
export class ProvisioningTaskFrame {
  constructor(
    private readonly repo: ProvisioningTaskRepo,
    private readonly organization: OrganizationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly notifications: NotificationsApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws ProvisioningItAdminRequiredError, ProvisioningTaskNotFoundError, ProvisioningNotInChargeError, what `check` throws and what `write` throws. */
  async work(
    actor: AuthenticatedPrincipal,
    id: string,
    action: {
      /** Takes what stands above the task in the order of locks (the employee), from the task read without a lock, before the task is locked. */
      beforeLock?: (tx: DbTx, task: ProvisioningTaskRecord) => Promise<void>;
      check: (task: ProvisioningTaskRecord) => void;
      write: (context: TaskWorkContext) => Promise<TaskWrite>;
    },
  ): Promise<ProvisioningTaskRecord> {
    assertItAdmin(actor);
    const organization = await this.requireOrganization();
    const now = new Date();

    return this.runner.run(async (tx) => {
      if (action.beforeLock) {
        const probe = await this.repo.find(id, tx);
        if (probe) await action.beforeLock(tx, probe);
      }
      const task = await this.repo.lock(tx, id);
      if (!task) throw new ProvisioningTaskNotFoundError();
      const { bySubstitute } = await this.requireActingItAdmin(tx, actor, {
        beneficiaryEmployeeId: task.assignment.employeeId,
        taskId: task.id,
        now,
      });
      action.check(task);
      const mode = await this.selfExecutionMode(actor, task.assignment.employeeId);
      const done = await action.write({ tx, task, organizationId: organization.id, now });
      if (done === false) return task;
      await this.finalizeWork(tx, actor, organization.id, task, done, { mode, bySubstitute, now });

      return (await this.repo.find(task.id, tx)) ?? task;
    });
  }

  private async finalizeWork(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    task: ProvisioningTaskRecord,
    done: Exclude<TaskWrite, false>,
    meta: { mode: SelfExecutionMode; bySubstitute: boolean; now: Date },
  ): Promise<void> {
    if (CLOSING_TASK_ACTIONS.has(done.action)) {
      await this.organization.endUnplacedWorkDesignations(tx, {
        workKind: 'PROVISIONING_TASK',
        workId: task.id,
        endedByAppUserId: actor.appUserId,
        endedAt: meta.now,
      });
    }
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        organizationId,
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
          selfExecuted: meta.mode === 'ALLOW_SELF_EXECUTED',
          ...(meta.bySubstitute ? { bySubstitute: true } : {}),
        },
      ),
    );
    if (meta.mode === 'ALLOW_SELF_EXECUTED') {
      await this.tellSuperAdmin(tx, organizationId, task.id, actor.employeeId);
    }
  }

  /**
   * Resolves the work department (or uses the known `departmentId`) and verifies that `actor` is an acting IT Admin
   * for it in `tx`, returning `{ bySubstitute }` from the same read. Throws ProvisioningNotInChargeError.
   */
  async requireActingItAdmin(
    tx: DbTx | undefined,
    actor: AuthenticatedPrincipal,
    target: { beneficiaryEmployeeId: string; departmentId?: string; taskId?: string; now?: Date },
  ): Promise<{ bySubstitute: boolean }> {
    let deptId = target.departmentId;
    if (deptId === undefined) {
      const today = await this.organizationReads.businessToday(target.now ?? new Date(), tx);
      deptId = (await this.organizationReads.workDepartmentsOf([target.beneficiaryEmployeeId], today, tx)).get(
        target.beneficiaryEmployeeId,
      );
    }
    if (deptId === undefined) {
      if (!target.taskId) throw new ProvisioningNotInChargeError();
      const resolved = await this.organizationReads.itAdminsActingForUnplacedWork(
        [{ workKind: 'PROVISIONING_TASK', workId: target.taskId, employeeId: target.beneficiaryEmployeeId }],
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      );
      const designee = resolved.get(unplacedWorkKey('PROVISIONING_TASK', target.taskId)) ?? null;
      if (designee !== actor.employeeId) throw new ProvisioningNotInChargeError();

      return { bySubstitute: true };
    }
    const acting = (
      await this.organizationReads.itAdminsActingFor(
        [deptId],
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      )
    ).get(deptId);

    return assertActingItAdmin(actor.employeeId, acting);
  }

  /**
   * Self-execution mode when the IT Admin works for a person who is themselves: allowed for any acting
   * IT Admin and marked as self-executed.
   */
  selfExecutionMode(actor: AuthenticatedPrincipal, beneficiaryEmployeeId: string): Promise<SelfExecutionMode> {
    return Promise.resolve(
      selfExecution({
        actorEmployeeId: actor.employeeId,
        beneficiaryEmployeeId,
      }),
    );
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
      subject: { type: 'PROVISIONING_TASK', id: taskId },
      params: { taskId, employeeId: itAdminEmployeeId },
      eventKey: `IT_ADMIN_SELF_EXECUTED:${taskId}`,
    });
  }

  /** Returns the current organization id, or throws if the installation has not completed. */
  async requireOrganizationId(tx?: DbTx): Promise<string> {
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('A provisioning task was changed before installation');

    return organization.id;
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A provisioning task was changed before installation');

    return organization;
  }
}
