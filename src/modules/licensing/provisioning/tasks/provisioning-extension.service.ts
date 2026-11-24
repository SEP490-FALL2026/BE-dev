import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../../notifications/public/notifications.api';
import { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { licensingAuditEvent } from '../../licensing-audit-event.mapper';
import { maxAttempts as maxAttemptsFor } from '../failure.policy';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';

/**
 * Opens a manual extension task on an active seat whose renewal was approved.
 */
@Injectable()
export class ProvisioningExtensionService {
  constructor(
    private readonly tasks: ProvisioningTaskRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly parameters: OperatingParametersApi,
    private readonly audit: AuditApi,
    private readonly notifications: NotificationsApi,
  ) {}

  /** Opens the task on the seat; the caller has judged the seat under its lock (open, personal, not being revoked). */
  async open(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { assignmentId: string; holderEmployeeId: string; requestId: string; now: Date },
  ): Promise<{ taskId: string }> {
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('A right was extended before installation');
    const today = await this.organizationReads.businessToday(input.now, tx);
    const deptId = (await this.organizationReads.workDepartmentsOf([input.holderEmployeeId], today, tx)).get(
      input.holderEmployeeId,
    );
    const defaultResponsibleEmployeeId = deptId
      ? ((
          await this.organizationReads.itAdminsActingFor(
            [deptId],
            (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
            tx,
          )
        ).get(deptId)?.defaultAssignee ?? null)
      : null;
    // The most tries are fixed here, as for a grant: a parameter changed later reaches only the tasks made after it.
    const maxAttempts = maxAttemptsFor(Number(await this.parameters.getValue('PROVISIONING_RETRY_COUNT', tx)));
    const task = await this.tasks.insert(tx, {
      kind: 'EXTEND',
      organizationId: organization.id,
      assignmentId: input.assignmentId,
      channel: 'MANUAL',
      requestId: input.requestId,
      defaultResponsibleEmployeeId,
      createdByAppUserId: actor.appUserId,
      maxAttempts,
    });
    if (deptId === undefined) {
      await this.notifyIfNeverPlaced(tx, organization.id, task.id, input.holderEmployeeId);
    }
    await this.audit.record(
      tx,
      licensingAuditEvent(actor, organization.id, 'PROVISIONING_TASK.CREATED', 'ProvisioningTask', task.id, null, {
        kind: 'EXTEND',
        channel: 'MANUAL',
        assignmentId: input.assignmentId,
        requestId: input.requestId,
        defaultResponsibleEmployeeId,
      }),
    );

    return { taskId: task.id };
  }

  private async notifyIfNeverPlaced(
    tx: DbTx,
    organizationId: string,
    taskId: string,
    employeeId: string,
  ): Promise<void> {
    const unplaced = await this.organizationReads.unplacedAmong([employeeId], tx);
    if (!unplaced.has(employeeId)) return;
    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);
    if (superAdmin === null) return;

    await this.notifications.notifyInApp(tx, {
      organizationId,
      recipientEmployeeId: superAdmin,
      code: 'UNPLACED_WORK_WAITING',
      subject: null,
      params: { workKind: 'PROVISIONING_TASK', workId: taskId, employeeId },
      eventKey: `unplacedWork:PROVISIONING_TASK:${taskId}`,
    });
  }
}
