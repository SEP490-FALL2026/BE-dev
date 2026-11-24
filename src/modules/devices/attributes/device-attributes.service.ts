import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { judgeDeviceActor } from '../devices-custody.policy';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
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
 * awaiting return require an acting IT Admin of the holder department.
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
   * Throws DeviceUpdateEmptyError, DeviceNotFoundError, DeviceNotEditableError, DeviceNotInChargeError,
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

  private async requireDeviceActor(tx: DbTx, deviceId: string, actorEmployeeId: string, now: Date): Promise<boolean> {
    const context = await this.repo.findCustodyContext(tx, deviceId);
    if (!context.hasOpenReturnTask && !context.openRegistrationHolderId) return false;
    const today = await this.organizationReads.businessToday(now, tx);
    const holderId = context.openRegistrationHolderId;
    const holderDepartmentId = context.hasOpenReturnTask
      ? context.openReturnTaskDepartmentId
      : holderId
        ? ((await this.organizationReads.workDepartmentsOf([holderId], today, tx)).get(holderId) ?? null)
        : null;
    if (!holderDepartmentId) {
      const verdict = judgeDeviceActor({
        holderDepartmentId: null,
        recipientDepartmentId: null,
        actingByDepartment: new Map(),
        actor: actorEmployeeId,
        unplacedRequired: true,
      });
      if (!verdict.allowed) throw new DeviceNotInChargeError();

      return verdict.bySubstitute;
    }
    const actingByDepartment = await this.organizationReads.itAdminsActingFor(
      [holderDepartmentId],
      (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
      tx,
    );
    const verdict = judgeDeviceActor({
      holderDepartmentId,
      recipientDepartmentId: null,
      actingByDepartment,
      actor: actorEmployeeId,
    });
    if (!verdict.allowed) throw new DeviceNotInChargeError();

    return verdict.bySubstitute;
  }

  /** The fields the correction changes, as the machine has them: the audit says what each was and what it became. */
  private snapshot(device: DeviceRow, changes: AttributeChange): { [key: string]: string | null } {
    return Object.fromEntries(Object.keys(changes).map((field) => [field, device[field as keyof AttributeChange]]));
  }
}
