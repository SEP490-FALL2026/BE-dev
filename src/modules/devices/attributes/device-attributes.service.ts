import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { requireDepartmentActor, requireLifecycleActor } from '../lifecycle/lifecycle.mapper';
import { DeviceNotFoundError } from '../public/devices.errors';
import { DeviceSerialNumberTakenError, DeviceStaleError } from './device-attributes.errors';
import { type AttributeChange, assertEditable, assertSomethingGiven, changesOf } from './device-attributes.policy';
import { DeviceAttributesRepo, type DeviceRow } from './device-attributes.repo';

/** The machine as a correction answers it. */
export type DeviceAttributesView = Omit<DeviceRow, 'retiredAt' | 'voidedAt'>;

const viewOf = (device: DeviceRow): DeviceAttributesView => ({
  id: device.id,
  assetCode: device.assetCode,
  hostname: device.hostname,
  os: device.os,
  serialNumber: device.serialNumber,
  deviceType: device.deviceType,
  updatedAt: device.updatedAt,
});

/**
 * Corrects what a person entered wrong on a machine: its name, system, serial number and kind. The asset code is never touched.
 *
 * Lock order: ONE row lock, the machine in `managed_devices` `FOR UPDATE` (tier 2b); reads custody context, department,
 * and acting IT Admins inside the same transaction. In-stock devices allow any IT Admin; assigned devices or devices
 * awaiting return require an acting IT Admin of the holder department, or, when the holder has no department yet, the
 * IT Admin the Super Admin appointed for that device (or for its open return task).
 */
@Injectable()
export class DeviceAttributesService {
  constructor(
    private readonly repo: DeviceAttributesRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly identity: IdentityAccessApi,
  ) {}

  /**
   * Throws DeviceUpdateEmptyError, DeviceNotFoundError, DeviceNotEditableError, DeviceNotInChargeError, EmployeeNotStartedError,
   * DeviceStaleError and DeviceSerialNumberTakenError.
   */
  async change(
    actor: AuthenticatedPrincipal,
    id: string,
    input: AttributeChange & { expectedUpdatedAt: Date },
    now: Date = new Date(),
  ): Promise<DeviceAttributesView> {
    assertSomethingGiven(input);
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A machine was corrected before installation');

    try {
      return await this.runner.run(async (tx) => {
        const device = await this.repo.lock(tx, id);
        if (!device) throw new DeviceNotFoundError();
        assertEditable(device);
        const bySubstitute = await this.requireDeviceActor(tx, id, actor.employeeId, now);
        if (device.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
          throw new DeviceStaleError(device.updatedAt);
        const changes = changesOf(device, input);
        if (Object.keys(changes).length === 0) return viewOf(device);

        const updated = await this.repo.update(tx, id, changes);
        await this.audit.record(
          tx,
          devicesEvent(
            byUser(actor),
            organization.id,
            'DEVICE.UPDATED',
            'ManagedDevice',
            id,
            this.snapshot(device, changes),
            { ...this.snapshot(updated, changes), ...(bySubstitute ? { bySubstitute: true } : {}) },
          ),
        );

        return viewOf(updated);
      });
    } catch (error) {
      if (isUniqueViolation(error, 'normalized_serial_number')) throw new DeviceSerialNumberTakenError();
      throw error;
    }
  }

  /**
   * Who may correct this machine: nobody is asked while it sits in stock; otherwise the same rule as the other commands on
   * a machine that has a person: a return task decides while the machine awaits return (the departing person is never
   * the actor), the holder decides otherwise; a person with no department yet is not started (EMPLOYEE.NOT_STARTED) or
   * is served by the IT Admin appointed for the work.
   */
  private async requireDeviceActor(tx: DbTx, deviceId: string, actorEmployeeId: string, now: Date): Promise<boolean> {
    const context = await this.repo.findCustodyContext(tx, deviceId);
    if (!context.hasOpenReturnTask && !context.openRegistrationHolderId) return false;
    const today = await this.organizationReads.businessToday(now, tx);
    const deps = { organizationReads: this.organizationReads, identity: this.identity };
    if (context.hasOpenReturnTask) {
      return requireDepartmentActor(tx, deps, {
        actorEmployeeId,
        departmentId: context.openReturnTaskDepartmentId,
        today,
        returnTaskId: context.openReturnTaskId,
        returnTaskEmployeeId: context.openReturnTaskEmployeeId,
      });
    }

    return requireLifecycleActor(tx, deps, {
      actorEmployeeId,
      today,
      deviceId,
      oldHolderEmployeeId: context.openRegistrationHolderId,
      recipientEmployeeId: null,
    });
  }

  /** The fields the correction changes, as the machine has them: the audit says what each was and what it became. */
  private snapshot(device: DeviceRow, changes: AttributeChange): { [key: string]: string | null } {
    return Object.fromEntries(Object.keys(changes).map((field) => [field, device[field as keyof AttributeChange]]));
  }
}
