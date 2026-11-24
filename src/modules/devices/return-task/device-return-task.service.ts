import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { devicesEvent } from '../devices-audit-event.mapper';
import { RegistryRepo } from '../registry/registry.repo';
import { DeviceReturnTaskNotifier } from './device-return-task-notifier.service';
import { shouldClearOverdueNotice } from './device-return-task.policy';
import { DeviceReturnTaskRepo } from './device-return-task.repo';
import type { CancelReturnTasksInput, MoveReturnTaskDueInput, OpenReturnTasksInput } from './device-return-task.types';

/**
 * Manages the lifecycle of offboarding device return tasks (creation on departure recording, due-date updates,
 * and cancellation). Always locks in standard device tier order (`managed_devices` -> `device_registrations` ->
 * `device_return_tasks` in ascending id order).
 *
 * Offboarding cancellation exception: when cancelling a departure after the access block took effect, the caller
 * settles seat revocations on account-bound subscriptions before invoking `cancelOfCase`. That ordering cannot
 * deadlock with machine/key flows because device-key subscriptions and account-bound subscriptions are strictly
 * disjoint, and machine/key transactions never lock account-bound subscriptions, provisioning tasks, or seat
 * assignments.
 */
@Injectable()
export class DeviceReturnTaskService {
  constructor(
    private readonly registry: RegistryRepo,
    private readonly repo: DeviceReturnTaskRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly notifier: DeviceReturnTaskNotifier,
  ) {}

  async openForDeparture(tx: DbTx, input: OpenReturnTasksInput): Promise<{ taskIds: string[] }> {
    const registrations = await this.registry.lockOpenRegistrationsOfHolder(tx, input.employeeId);
    if (registrations.length === 0) return { taskIds: [] };
    const existing = await this.repo.findExistingRegistrationIds(
      tx,
      registrations.map((reg) => reg.id),
    );
    const createdIds: string[] = [];
    for (const registration of registrations) {
      if (existing.has(registration.id)) continue;
      const task = await this.repo.insertOpen(tx, {
        organizationId: registration.organizationId,
        deviceId: registration.deviceId,
        registrationId: registration.id,
        employeeId: input.employeeId,
        offboardingCaseId: input.caseId,
        departmentId: input.departmentId,
        dueOn: input.dueOn,
      });
      await this.audit.record(
        tx,
        devicesEvent(
          { kind: 'SYSTEM', correlationId: input.caseId },
          registration.organizationId,
          'DEVICE_RETURN_TASK.OPENED',
          'DeviceReturnTask',
          task.id,
          null,
          {
            deviceId: task.deviceId,
            registrationId: task.registrationId,
            employeeId: task.employeeId,
            offboardingCaseId: task.offboardingCaseId,
            departmentId: task.departmentId,
            dueOn: task.dueOn,
          },
        ),
      );
      const device = await this.registry.findDevice(registration.deviceId, tx);
      await this.notifier.waitingIfUnassigned(tx, {
        organizationId: registration.organizationId,
        task,
        assetCode: device?.assetCode ?? '',
      });
      createdIds.push(task.id);
    }

    return { taskIds: createdIds };
  }

  async moveDue(tx: DbTx, input: MoveReturnTaskDueInput): Promise<{ updatedIds: string[] }> {
    const tasks = await this.repo.lockOpenByCaseId(tx, input.caseId);
    if (tasks.length === 0) return { updatedIds: [] };
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const clearOverdueNotice = shouldClearOverdueNotice({ newDueOn: input.dueOn, today });
    const updatedIds: string[] = [];
    for (const task of tasks) {
      const dueChanged = task.dueOn !== input.dueOn;
      const noticeCleared = clearOverdueNotice && task.overdueNoticedOn !== null;
      if (!dueChanged && !noticeCleared) continue;
      await this.repo.updateDueOn(tx, task.id, { dueOn: input.dueOn, clearOverdueNotice });
      await this.audit.record(
        tx,
        devicesEvent(
          { kind: 'SYSTEM', correlationId: input.caseId },
          task.organizationId,
          'DEVICE_RETURN_TASK.DUE_CHANGED',
          'DeviceReturnTask',
          task.id,
          { dueOn: task.dueOn, overdueNoticedOn: task.overdueNoticedOn },
          { dueOn: input.dueOn, overdueNoticedOn: clearOverdueNotice ? null : task.overdueNoticedOn },
        ),
      );
      updatedIds.push(task.id);
    }

    return { updatedIds };
  }

  async cancelOfCase(tx: DbTx, input: CancelReturnTasksInput): Promise<{ cancelledIds: string[] }> {
    const tasks = await this.repo.lockOpenByCaseId(tx, input.caseId);
    if (tasks.length === 0) return { cancelledIds: [] };
    const cancelledIds: string[] = [];
    for (const task of tasks) {
      await this.repo.markCancelled(tx, task.id, input.at);
      await this.audit.record(
        tx,
        devicesEvent(
          { kind: 'SYSTEM', correlationId: input.caseId },
          task.organizationId,
          'DEVICE_RETURN_TASK.CANCELLED',
          'DeviceReturnTask',
          task.id,
          { state: 'OPEN' },
          { state: 'CANCELLED', handledAt: input.at.toISOString() },
        ),
      );
      cancelledIds.push(task.id);
    }

    return { cancelledIds };
  }
}
