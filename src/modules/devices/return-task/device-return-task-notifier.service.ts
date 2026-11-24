import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import type { ReturnTaskRecord } from './device-return-task.types';

const SUBJECT_TYPE = 'DEVICE_RETURN_TASK';

/**
 * Sends in-app notifications for offboarding device return tasks: `DEVICE_RETURN_WAITING` to the Super Admin
 * when a newly opened task has no eligible acting IT Admin, and daily `DEVICE_RETURN_OVERDUE` reminders to acting
 * IT Admins (excluding the departing employee) and the Super Admin.
 */
@Injectable()
export class DeviceReturnTaskNotifier {
  constructor(
    private readonly notifications: NotificationsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  async waitingIfUnassigned(
    tx: DbTx,
    input: { organizationId: string; task: ReturnTaskRecord; assetCode: string },
  ): Promise<boolean> {
    const actors = await this.resolveActors(tx, input.task);
    if (actors.length > 0) return false;
    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);
    if (!superAdmin) return false;

    await this.notifications.notifyInApp(tx, {
      organizationId: input.organizationId,
      recipientEmployeeId: superAdmin,
      code: 'DEVICE_RETURN_WAITING',
      subject: { type: SUBJECT_TYPE, id: input.task.id },
      params: {
        taskId: input.task.id,
        deviceId: input.task.deviceId,
        assetCode: input.assetCode,
        employeeId: input.task.employeeId,
        departmentId: input.task.departmentId,
        dueOn: input.task.dueOn,
      },
      eventKey: `deviceReturnWaiting:${input.task.id}`,
    });

    return true;
  }

  async overdue(
    tx: DbTx,
    input: { organizationId: string; task: ReturnTaskRecord; assetCode: string; today: BusinessDate },
  ): Promise<void> {
    const actors = await this.resolveActors(tx, input.task);
    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);
    const recipients = [...new Set([...actors, ...(superAdmin ? [superAdmin] : [])])];

    for (const recipientEmployeeId of recipients) {
      await this.notifications.notifyInApp(tx, {
        organizationId: input.organizationId,
        recipientEmployeeId,
        code: 'DEVICE_RETURN_OVERDUE',
        subject: { type: SUBJECT_TYPE, id: input.task.id },
        params: {
          taskId: input.task.id,
          deviceId: input.task.deviceId,
          assetCode: input.assetCode,
          employeeId: input.task.employeeId,
          dueOn: input.task.dueOn,
        },
        eventKey: `deviceReturnOverdue:${input.task.id}:${recipientEmployeeId}:${input.today}`,
      });
    }
  }

  private async resolveActors(tx: DbTx, task: ReturnTaskRecord): Promise<string[]> {
    if (task.departmentId === null) {
      const resolved = await this.organizationReads.itAdminsActingForUnplacedWork(
        [{ workKind: 'DEVICE_RETURN_TASK', workId: task.id, employeeId: task.employeeId }],
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      );
      const designee = resolved.get(unplacedWorkKey('DEVICE_RETURN_TASK', task.id)) ?? null;

      return designee !== null && designee !== task.employeeId ? [designee] : [];
    }
    const actingByDept = await this.organizationReads.itAdminsActingFor(
      [task.departmentId],
      (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
      tx,
    );

    return (actingByDept.get(task.departmentId)?.actors ?? []).filter((id) => id !== task.employeeId);
  }
}
