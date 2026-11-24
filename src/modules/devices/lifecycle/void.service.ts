import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { LicensingDeviceActivationApi } from '../../licensing/public/licensing-device-activation.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { custodyOf } from '../devices-custody.policy';
import { DeviceNotFoundError } from '../public/devices.errors';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';
import { RegistryRepo } from '../registry/registry.repo';
import { DeviceVoidedError, DeviceVoidRefusedError } from './lifecycle.errors';
import { judgeVoid } from './lifecycle.policy';

/**
 * Voids an untouched, mistakenly entered machine record after verifying it has no custody, signature, credential, or
 * keyed activation history.
 *
 * Lock order: machine FOR UPDATE (tier 2b), open registration FOR UPDATE, then bundled activation close locks.
 */
@Injectable()
export class VoidService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly activations: LicensingDeviceActivationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Marks an untouched machine record as voided and closes any initial bundled activations. */
  async voidDevice(
    actor: AuthenticatedPrincipal,
    deviceId: string,
    reason: string,
    now: Date = new Date(),
  ): Promise<void> {
    const organization = await this.requireOrganization();

    await this.runner.run(async (tx) => {
      const device = await this.repo.lockDevice(tx, deviceId);
      if (!device) throw new DeviceNotFoundError();
      const open = await this.repo.lockOpenRegistration(tx, deviceId);
      const hasOpenReturnTask = await this.repo.hasOpenReturnTask(tx, deviceId);
      const history = await this.repo.readVoidHistory(tx, deviceId);
      const hasKeyActivationHistory = await this.activations.hasKeyActivationHistory(deviceId, tx);
      const custody = custodyOf({
        voidedAt: device.voidedAt,
        retiredAt: device.retiredAt,
        hasOpenReturnTask,
        hasOpenRegistration: open !== null,
      });

      this.assertMayVoid({
        custody,
        hasOpenReturnTask,
        hasOpenRegistration: open !== null,
        hasSignatureRecord: history.hasSignatureRecord,
        hasCredential: history.hasCredential,
        hasKeyActivationHistory,
      });

      const today = await this.organizationReads.businessToday(now, tx);
      await this.activations.closeAllOfDevice(tx, {
        deviceId,
        cause: 'DEVICE_VOIDED',
        decisions: [],
        on: today,
        at: now,
        by: {
          kind: 'USER',
          appUserId: actor.appUserId,
          employeeId: actor.employeeId,
          sessionId: actor.sessionId,
        },
      });
      await this.repo.voidDevice(tx, deviceId, {
        voidedAt: now,
        voidReason: reason,
        voidedByAppUserId: actor.appUserId,
      });
      await this.audit.record(
        tx,
        devicesEvent(byUser(actor), organization.id, 'DEVICE.VOIDED', 'ManagedDevice', deviceId, null, { reason }),
      );
    });
  }

  private assertMayVoid(facts: Parameters<typeof judgeVoid>[0]): void {
    const verdict = judgeVoid(facts);
    if (verdict === 'OK') return;
    if (verdict === 'VOIDED') throw new DeviceVoidedError();
    if (verdict === 'ALREADY_RETIRED') throw new DeviceAlreadyRetiredError();
    throw new DeviceVoidRefusedError(verdict);
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was used before installation');

    return organization;
  }
}
