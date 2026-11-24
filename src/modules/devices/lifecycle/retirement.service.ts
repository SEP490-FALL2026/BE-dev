import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { DeviceNotFoundError } from '../public/devices.errors';
import { RegistrationEndService } from '../registry/registration-end.service';
import { DeviceAlreadyRetiredError } from '../registry/registry.errors';
import { RegistryRepo } from '../registry/registry.repo';
import { DeviceVoidedError } from './lifecycle.errors';
import { requireLifecycleActor } from './lifecycle.mapper';

/**
 * Retires a machine from active use, ending any open registration and enforcing acting IT coverage when held.
 *
 * Lock order: machine FOR UPDATE (tier 2b), then open registration FOR UPDATE.
 */
@Injectable()
export class RetirementService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly ending: RegistrationEndService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Takes a machine out of use, ending its open registration if held and recording the reason. */
  async retire(actor: AuthenticatedPrincipal, deviceId: string, reason: string, now: Date = new Date()): Promise<void> {
    const organization = await this.requireOrganization();

    await this.runner.run(async (tx) => {
      const device = await this.repo.lockDevice(tx, deviceId);
      if (!device) throw new DeviceNotFoundError();
      if (device.voidedAt) throw new DeviceVoidedError();
      if (device.retiredAt) throw new DeviceAlreadyRetiredError();
      const open = await this.repo.lockOpenRegistration(tx, deviceId);

      const today = await this.organizationReads.businessToday(now, tx);
      const bySubstitute = open
        ? await requireLifecycleActor(
            tx,
            { organizationReads: this.organizationReads, identity: this.identity },
            {
              actorEmployeeId: actor.employeeId,
              today,
              oldHolderEmployeeId: open.holderEmployeeId,
              recipientEmployeeId: null,
            },
          )
        : false;

      if (open) await this.ending.end(tx, open, { at: now, cause: 'DEVICE_RETIRED' }, byUser(actor));
      await this.repo.retireDevice(tx, deviceId, now, reason);
      await this.audit.record(
        tx,
        devicesEvent(byUser(actor), organization.id, 'DEVICE.RETIRED', 'ManagedDevice', deviceId, null, {
          reason,
          endedRegistrationId: open?.id ?? null,
          ...(bySubstitute ? { bySubstitute: true } : {}),
        }),
      );
    });
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was used before installation');

    return organization;
  }
}
