import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { judgeDeviceActor } from '../devices-custody.policy';
import { DeviceNotInChargeError } from '../public/devices.errors';
import {
  DeviceCollectorAlreadyInstalledError,
  DeviceHolderNotWorkingError,
  DeviceRegistrationEndedError,
  DeviceRegistrationNotFoundError,
} from './registry.errors';
import { judgeHolder } from './registry.policy';
import { RegistryRepo } from './registry.repo';

/**
 * Enables collector installation on an existing open device registration (one-way transition from false to true).
 *
 * Lock order: holder employee FOR SHARE (tier 1), machine FOR UPDATE (tier 2b), then registration FOR UPDATE.
 */
@Injectable()
export class CollectorInstallationService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Marks an open registration as having a collector installed and returns its device id. */
  async enable(actor: AuthenticatedPrincipal, registrationId: string, now: Date = new Date()): Promise<string> {
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const initial = await this.repo.findRegistration(registrationId, tx);
      if (!initial) throw new DeviceRegistrationNotFoundError();
      await this.organizationReads.lockEmployeeForShare(tx, initial.holderEmployeeId);

      const registration = await this.repo.lockRegistrationChain(tx, registrationId);
      if (!registration) throw new DeviceRegistrationNotFoundError();
      if (registration.endedAt) throw new DeviceRegistrationEndedError();
      if (registration.collectorInstalled) throw new DeviceCollectorAlreadyInstalledError();

      const holder = await this.organizationReads.getEmployee(registration.holderEmployeeId, tx);
      if (judgeHolder(holder) !== 'OK') throw new DeviceHolderNotWorkingError();

      const today = await this.organizationReads.businessToday(now, tx);
      const bySubstitute = await this.requireActingItAdmin(
        tx,
        registration.deviceId,
        registration.holderEmployeeId,
        actor.employeeId,
        today,
      );

      await this.repo.enableCollector(tx, registration.id);
      await this.audit.record(
        tx,
        devicesEvent(
          byUser(actor),
          organization.id,
          'DEVICE_REGISTRATION.COLLECTOR_ENABLED',
          'DeviceRegistration',
          registration.id,
          null,
          {
            deviceId: registration.deviceId,
            collectorInstalled: true,
            ...(bySubstitute ? { bySubstitute: true } : {}),
          },
        ),
      );

      return registration.deviceId;
    });
  }

  private async requireActingItAdmin(
    tx: Parameters<RegistryRepo['lockRegistrationChain']>[0],
    deviceId: string,
    holderEmployeeId: string,
    actorEmployeeId: string,
    today: string,
  ): Promise<boolean> {
    const departmentId =
      (await this.organizationReads.workDepartmentsOf([holderEmployeeId], today, tx)).get(holderEmployeeId) ?? null;
    if (!departmentId) {
      const resolved = await this.organizationReads.itAdminsActingForUnplacedWork(
        [{ workKind: 'DEVICE', workId: deviceId, employeeId: holderEmployeeId }],
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      );
      const unplacedDesignee = resolved.get(unplacedWorkKey('DEVICE', deviceId)) ?? null;
      const verdict = judgeDeviceActor({
        holderDepartmentId: null,
        recipientDepartmentId: null,
        actingByDepartment: new Map(),
        actor: actorEmployeeId,
        unplacedRequired: true,
        unplacedDesignee,
      });
      if (!verdict.allowed) throw new DeviceNotInChargeError();

      return verdict.bySubstitute;
    }

    const actingByDepartment = await this.organizationReads.itAdminsActingFor(
      [departmentId],
      (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
      tx,
    );
    const verdict = judgeDeviceActor({
      holderDepartmentId: departmentId,
      recipientDepartmentId: null,
      actingByDepartment,
      actor: actorEmployeeId,
    });
    if (!verdict.allowed) throw new DeviceNotInChargeError();

    return verdict.bySubstitute;
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was used before installation');

    return organization;
  }
}
