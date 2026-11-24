import { Injectable } from '@nestjs/common';
import { searchKey } from '../../../core/search-key';
import { TransactionRunner, readSqlState, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AssetDeviceType } from '../asset-code/asset-code.policy';
import { AssetCodeService } from '../asset-code/asset-code.service';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { judgeDeviceActor } from '../devices-custody.policy';
import { DeviceNotFoundError, DeviceNotInChargeError } from '../public/devices.errors';
import { RegistrationEndService } from './registration-end.service';
import {
  DeviceAlreadyRetiredError,
  DeviceAssetCodeTakenError,
  DeviceHandoverDateInvalidError,
  DeviceHandoverWithoutHolderError,
  DeviceHolderNotFoundError,
  DeviceHolderNotWorkingError,
  DevicePlanNotBundledError,
  DeviceRegistrationOverlapError,
  DeviceSerialTakenError,
} from './registry.errors';
import { isHandoverDateValid, judgeHolder, normalizeAssetCode } from './registry.policy';
import { RegistryRepo, type RegistrationRecord } from './registry.repo';

export interface DeviceCreateInput {
  deviceType: AssetDeviceType;
  hostname: string;
  os: string;
  serialNumber?: string | undefined;
  bundledPlanIds?: string[] | undefined;
  holderEmployeeId?: string | undefined;
  handedOverOn?: string | undefined;
  collectorInstalled?: boolean | undefined;
}

/**
 * The register of company machines: a machine may start in stock or be registered to one holder, and a registration
 * ends when the holder changes or the machine is retired.
 *
 * Lock order on creation: asset-code counter (tier 0c), employee FOR SHARE (tier 1), then machine and registration.
 * Lock order on holder change or retirement: employee FOR SHARE (tier 1), machine (tier 2b), then registration.
 */
@Injectable()
export class RegistryService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly ending: RegistrationEndService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly assetCodes: AssetCodeService,
    private readonly identity: IdentityAccessApi,
  ) {}

  /**
   * Registers a new machine, in stock or handed over to a holder. Throws DeviceHandoverWithoutHolderError,
   * DevicePlanNotBundledError, DeviceNotInChargeError, DeviceHolderNotFoundError, DeviceHolderNotWorkingError,
   * DeviceHandoverDateInvalidError, DeviceAssetCodeTakenError, DeviceAssetCodeExhaustedError, DeviceSerialTakenError,
   * and DeviceRegistrationOverlapError.
   */
  async create(actor: AuthenticatedPrincipal, input: DeviceCreateInput, now: Date = new Date()): Promise<string> {
    if (!input.holderEmployeeId && (input.handedOverOn !== undefined || input.collectorInstalled !== undefined)) {
      throw new DeviceHandoverWithoutHolderError();
    }
    if (input.bundledPlanIds && input.bundledPlanIds.length > 0) {
      throw new DevicePlanNotBundledError();
    }
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const today = await this.organizationReads.businessToday(now, tx);
      const assetCode = await this.assetCodes.next(tx, input.deviceType, today);
      const serialNumber = input.serialNumber ?? null;
      const handover = input.holderEmployeeId
        ? await this.prepareInitialHandover(tx, actor.employeeId, input.holderEmployeeId, {
            handedOverOn: input.handedOverOn,
            today,
          })
        : null;
      const device = await this.insertDevice(tx, {
        organizationId: organization.id,
        assetCode,
        normalizedAssetCode: normalizeAssetCode(assetCode),
        assetCodeOrigin: 'GENERATED',
        deviceType: input.deviceType,
        serialNumber,
        normalizedSerialNumber: serialNumber ? searchKey(serialNumber) : null,
        hostname: input.hostname,
        os: input.os,
        createdByAppUserId: actor.appUserId,
      });
      const collectorInstalled = input.collectorInstalled ?? false;
      const registration = handover
        ? await this.insertRegistration(tx, actor, device.id, handover.holderId, handover.validFrom, {
            organizationId: organization.id,
            collectorInstalled,
          })
        : null;
      await this.audit.record(
        tx,
        devicesEvent(byUser(actor), organization.id, 'DEVICE.REGISTERED', 'ManagedDevice', device.id, null, {
          assetCode: device.assetCode,
          deviceType: input.deviceType,
          hostname: device.hostname,
          serialNumber,
          bundledPlanIds: input.bundledPlanIds ?? [],
          ...(handover && registration
            ? {
                holderEmployeeId: handover.holderId,
                registrationId: registration.id,
                validFrom: handover.validFrom,
                collectorInstalled,
              }
            : {}),
          ...(handover?.bySubstitute ? { bySubstitute: true } : {}),
        }),
      );

      return device.id;
    });
  }

  private async prepareInitialHandover(
    tx: DbTx,
    actorEmployeeId: string,
    holderEmployeeId: string,
    dates: { handedOverOn?: string | undefined; today: string },
  ): Promise<{ holderId: string; validFrom: string; bySubstitute: boolean }> {
    const holder = await this.lockHolder(tx, holderEmployeeId);
    const validFrom = dates.handedOverOn ?? dates.today;
    if (!isHandoverDateValid({ handedOverOn: validFrom, today: dates.today, hireDate: holder.hireDate })) {
      throw new DeviceHandoverDateInvalidError();
    }
    const departmentId =
      (await this.organizationReads.workDepartmentsOf([holder.id], dates.today, tx)).get(holder.id) ?? null;
    if (!departmentId) {
      judgeDeviceActor({
        holderDepartmentId: null,
        recipientDepartmentId: null,
        actingByDepartment: new Map(),
        actor: actorEmployeeId,
        unplacedRequired: true,
      });
      throw new DeviceNotInChargeError();
    }
    const actingByDepartment = await this.organizationReads.itAdminsActingFor(
      [departmentId],
      (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
      tx,
    );
    const verdict = judgeDeviceActor({
      holderDepartmentId: null,
      recipientDepartmentId: departmentId,
      actingByDepartment,
      actor: actorEmployeeId,
    });
    if (!verdict.allowed) throw new DeviceNotInChargeError();

    return { holderId: holder.id, validFrom, bySubstitute: verdict.bySubstitute };
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
      if (isUniqueViolation(error, 'normalized_serial_number')) throw new DeviceSerialTakenError();
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
    options: { organizationId: string; collectorInstalled: boolean },
  ): Promise<RegistrationRecord> {
    try {
      return await this.repo.insertRegistration(tx, {
        organizationId: options.organizationId,
        deviceId,
        holderEmployeeId,
        validFrom,
        collectorInstalled: options.collectorInstalled,
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
