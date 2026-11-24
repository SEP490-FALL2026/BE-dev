import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import { isSystemActor, type RevocationSource, type SystemActor } from '../public/licensing.types';
import { maxAttempts as maxAttemptsFor } from './failure.policy';
import type { ProvisioningTaskRecord } from './provisioning-task.types';
import { ProvisioningTaskRepo } from './provisioning-task.repo';

/** The task a seat did not have yet: manual, queued for the IT Admin in charge of the holder's department today. */
@Injectable()
export class RevocationTaskFactory {
  constructor(
    private readonly tasks: ProvisioningTaskRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly parameters: OperatingParametersApi,
    private readonly notifications: NotificationsApi,
  ) {}

  async create(
    tx: DbTx,
    actor: AuthenticatedPrincipal | SystemActor,
    input: {
      organizationId: string;
      assignment: { id: string; employeeId: string };
      source: RevocationSource;
      now: Date;
    },
  ): Promise<ProvisioningTaskRecord> {
    const today = await this.organizationReads.businessToday(input.now, tx);
    const deptId = (await this.organizationReads.workDepartmentsOf([input.assignment.employeeId], today, tx)).get(
      input.assignment.employeeId,
    );
    if (deptId === undefined) {
      if (
        (await this.organizationReads.notStartedAmong([input.assignment.employeeId], today, tx)).has(
          input.assignment.employeeId,
        )
      ) {
        throw new EmployeeNotStartedError(input.assignment.employeeId);
      }
    }
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

    const task = await this.tasks.insertRevocation(tx, {
      organizationId: input.organizationId,
      assignmentId: input.assignment.id,
      source: input.source,
      defaultResponsibleEmployeeId,
      creator: isSystemActor(actor) ? { system: true } : { appUserId: actor.appUserId },
      maxAttempts,
    });
    if (deptId === undefined) {
      await this.notifyIfNeverPlaced(tx, input.organizationId, task.id, input.assignment.employeeId);
    }

    return task;
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
