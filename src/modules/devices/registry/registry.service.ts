import { Injectable } from '@nestjs/common';
import { TransactionRunner, readSqlState, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { RegistrationEndService } from './registration-end.service';
import {
  DeviceAlreadyRetiredError,
  DeviceAssetCodeTakenError,
  DeviceHandoverDateInvalidError,
  DeviceHolderNotFoundError,
  DeviceHolderNotWorkingError,
  DeviceHolderUnchangedError,
  DeviceRegistrationOverlapError,
} from './registry.errors';
import { isHandoverDateValid, judgeHolder, normalizeAssetCode } from './registry.policy';
import { RegistryRepo, type RegistrationRecord } from './registry.repo';
import { DeviceNotFoundError } from '../public/devices.errors';

export interface DeviceCreateInput {
  assetCode: string;
  hostname: string;
  os: string;
  holderEmployeeId: string;
  handedOverOn?: string | undefined;
}

/**
 * The register of company machines (`US-09-01`): a machine is registered to one person, the holder changes or the machine is
 * retired by the IT Admin, and a registration ends when it does (`RegistrationEndService`). Locks, always in this order: the
 * employee (shared), the machine, the registration.
 */
@Injectable()
export class RegistryService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly ending: RegistrationEndService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Registers a new machine to a holder. Throws DeviceHolderNotFoundError, DeviceHolderNotWorkingError,
   * DeviceHandoverDateInvalidError, DeviceAssetCodeTakenError and DeviceRegistrationOverlapError.
   */
  async create(actor: AuthenticatedPrincipal, input: DeviceCreateInput, now: Date = new Date()): Promise<string> {
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const holder = await this.lockHolder(tx, input.holderEmployeeId);
      const today = await this.organizationReads.businessToday(now, tx);
      const validFrom = input.handedOverOn ?? today;
      if (!isHandoverDateValid({ handedOverOn: validFrom, today, hireDate: holder.hireDate })) {
        throw new DeviceHandoverDateInvalidError();
      }
      const normalizedAssetCode = normalizeAssetCode(input.assetCode);
      if (await this.repo.deviceIdByAssetCode(tx, organization.id, normalizedAssetCode)) {
        throw new DeviceAssetCodeTakenError();
      }
      const device = await this.insertDevice(tx, {
        organizationId: organization.id,
        assetCode: input.assetCode,
        normalizedAssetCode,
        hostname: input.hostname,
        os: input.os,
        createdByAppUserId: actor.appUserId,
      });
      const registration = await this.insertRegistration(tx, actor, device.id, holder.id, validFrom, organization.id);
      await this.audit.record(
        tx,
        devicesEvent(byUser(actor), organization.id, 'DEVICE.REGISTERED', 'ManagedDevice', device.id, null, {
          assetCode: device.assetCode,
          hostname: device.hostname,
          holderEmployeeId: holder.id,
          registrationId: registration.id,
          validFrom,
        }),
      );

      return device.id;
    });
  }

  /**
   * Gives a machine to another person from today: the open registration ends and a new one begins. A machine nobody holds is
   * registered again. Throws DeviceNotFoundError, DeviceAlreadyRetiredError, DeviceHolderUnchangedError and the holder errors.
   */
  async changeHolder(
    actor: AuthenticatedPrincipal,
    deviceId: string,
    holderEmployeeId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const organization = await this.requireOrganization();
    await this.runner.run(async (tx) => {
      const holder = await this.lockHolder(tx, holderEmployeeId);
      const device = await this.repo.lockDevice(tx, deviceId);
      if (!device) throw new DeviceNotFoundError();
      if (device.retiredAt) throw new DeviceAlreadyRetiredError();
      const open = await this.repo.lockOpenRegistration(tx, deviceId);
      if (open?.holderEmployeeId === holder.id) throw new DeviceHolderUnchangedError();
      if (open) await this.ending.end(tx, open, { at: now, cause: 'HOLDER_CHANGED' }, byUser(actor));
      const today = await this.organizationReads.businessToday(now, tx);
      const registration = await this.insertRegistration(tx, actor, deviceId, holder.id, today, organization.id);
      await this.audit.record(
        tx,
        devicesEvent(
          byUser(actor),
          organization.id,
          'DEVICE.HOLDER_CHANGED',
          'ManagedDevice',
          deviceId,
          open ? { holderEmployeeId: open.holderEmployeeId } : null,
          {
            holderEmployeeId: holder.id,
            registrationId: registration.id,
            validFrom: today,
          },
        ),
      );
    });
  }

  /** Takes a machine out of use: its open registration ends and it is registered to nobody again. Throws DeviceNotFoundError and DeviceAlreadyRetiredError. */
  async retire(actor: AuthenticatedPrincipal, deviceId: string, reason: string, now: Date = new Date()): Promise<void> {
    const organization = await this.requireOrganization();
    await this.runner.run(async (tx) => {
      const device = await this.repo.lockDevice(tx, deviceId);
      if (!device) throw new DeviceNotFoundError();
      if (device.retiredAt) throw new DeviceAlreadyRetiredError();
      const open = await this.repo.lockOpenRegistration(tx, deviceId);
      if (open) await this.ending.end(tx, open, { at: now, cause: 'DEVICE_RETIRED' }, byUser(actor));
      await this.repo.retireDevice(tx, deviceId, now, reason);
      await this.audit.record(
        tx,
        devicesEvent(byUser(actor), organization.id, 'DEVICE.RETIRED', 'ManagedDevice', deviceId, null, {
          reason,
          endedRegistrationId: open?.id ?? null,
        }),
      );
    });
  }

  /** The holder is read under a shared lock so the person cannot leave while the machine is given to them. */
  private async lockHolder(tx: DbTx, employeeId: string) {
    if (!(await this.organizationReads.getEmployee(employeeId, tx))) throw new DeviceHolderNotFoundError();
    await this.organizationReads.lockEmployeeForShare(tx, employeeId);
    const holder = await this.organizationReads.getEmployee(employeeId, tx);
    const decision = judgeHolder(holder);
    if (decision === 'NOT_FOUND' || !holder) throw new DeviceHolderNotFoundError();
    if (decision === 'NOT_WORKING') throw new DeviceHolderNotWorkingError();

    return holder;
  }

  private async insertDevice(tx: DbTx, input: Parameters<RegistryRepo['insertDevice']>[1]) {
    try {
      return await this.repo.insertDevice(tx, input);
    } catch (error) {
      if (isUniqueViolation(error, 'normalized_asset_code')) throw new DeviceAssetCodeTakenError();
      throw error;
    }
  }

  /** A second registration over the same days is refused by the database; the answer is the same as one that overlaps by date. */
  private async insertRegistration(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    deviceId: string,
    holderEmployeeId: string,
    validFrom: string,
    organizationId: string,
  ): Promise<RegistrationRecord> {
    try {
      return await this.repo.insertRegistration(tx, {
        organizationId,
        deviceId,
        holderEmployeeId,
        validFrom,
        createdByAppUserId: actor.appUserId,
      });
    } catch (error) {
      if (readSqlState(error) === '23P01' || isUniqueViolation(error, 'device_registrations_one_open', 'device_id')) {
        throw new DeviceRegistrationOverlapError();
      }
      throw error;
    }
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was used before installation');

    return organization;
  }
}
