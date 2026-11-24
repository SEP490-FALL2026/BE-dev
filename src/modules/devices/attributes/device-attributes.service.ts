import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
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
 * Corrects what a person entered wrong on a machine: its name, system, serial number and kind (MAY-13). The asset code is never touched.
 *
 * Lock order: ONE lock, the row of `managed_devices` `FOR UPDATE` (tier 2b of `docs/rules/database-business.md`); nothing else is locked,
 * so this never waits on a registration, a job to take the machine back or an activation. The caller names the version it read and a stale
 * one is refused. A correction that changes nothing writes and audits nothing.
 */
@Injectable()
export class DeviceAttributesService {
  constructor(
    private readonly repo: DeviceAttributesRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Throws DeviceUpdateEmptyError, DeviceNotFoundError, DeviceNotEditableError, DeviceStaleError and DeviceSerialNumberTakenError.
   */
  async change(
    actor: AuthenticatedPrincipal,
    id: string,
    input: AttributeChange & { expectedUpdatedAt: Date },
  ): Promise<DeviceAttributesView> {
    assertSomethingGiven(input);
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A machine was corrected before installation');

    try {
      return await this.runner.run(async (tx) => {
        const device = await this.repo.lock(tx, id);
        if (!device) throw new DeviceNotFoundError();
        assertEditable(device);
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
            this.snapshot(updated, changes),
          ),
        );

        return viewOf(updated);
      });
    } catch (error) {
      if (isUniqueViolation(error, 'normalized_serial_number')) throw new DeviceSerialNumberTakenError();
      throw error;
    }
  }

  /** The fields the correction changes, as the machine has them: the audit says what each was and what it became. */
  private snapshot(device: DeviceRow, changes: AttributeChange): { [key: string]: string | null } {
    return Object.fromEntries(Object.keys(changes).map((field) => [field, device[field as keyof AttributeChange]]));
  }
}
