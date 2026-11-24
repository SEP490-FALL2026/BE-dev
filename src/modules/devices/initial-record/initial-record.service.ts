import { Injectable } from '@nestjs/common';
import { searchKey } from '../../../core/search-key';
import { readSqlState, TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { AuditValue } from '../../audit/public/audit.types';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingSeatBaselineApi } from '../../licensing/public/licensing-seat-baseline.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import { type AssetDeviceType, isLegacyCodeAcceptable } from '../asset-code/asset-code.policy';
import { AssetCodeService } from '../asset-code/asset-code.service';
import { byUser, devicesEvent } from '../devices-audit-event.mapper';
import { judgeDeviceActor } from '../devices-custody.policy';
import { DeviceNotInChargeError } from '../public/devices.errors';
import {
  DeviceAssetCodeTakenError,
  DeviceHandoverDateInvalidError,
  DeviceHandoverWithoutHolderError,
  DeviceHolderNotFoundError,
  DeviceHolderNotWorkingError,
  DeviceRegistrationOverlapError,
  DeviceSerialTakenError,
} from '../registry/registry.errors';
import { isHandoverDateValid, judgeHolder, normalizeAssetCode } from '../registry/registry.policy';
import { RegistryRepo, type RegistrationRecord } from '../registry/registry.repo';
import { InitialRecordActivationService } from './initial-record-activation.service';
import { DeviceAssetCodeInvalidError, DeviceInitializationClosedError } from './initial-record.errors';

export interface DeviceInitialRecordInput {
  deviceType: AssetDeviceType;
  hostname: string;
  os: string;
  serialNumber?: string | undefined;
  assetCode?: string | undefined;
  bundledPlanIds?: string[] | undefined;
  keyActivations?: Array<{ licenseKeyId: string }> | undefined;
  holderEmployeeId?: string | undefined;
  handedOverOn?: string | undefined;
  collectorInstalled?: boolean | undefined;
}

/**
 * Records pre-existing company machines while the seat-baseline initialization phase is open (`W2-13`).
 *
 * Lock order: seat baseline row FOR SHARE (tier 0b) -> asset-code counter (tier 0c, when generated) ->
 * holder employee FOR SHARE (tier 1) -> machine/registration inserts (tier 2b) -> purchase/key locks (tier 6/6b/8).
 */
@Injectable()
export class InitialRecordService {
  constructor(
    private readonly repo: RegistryRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly assetCodes: AssetCodeService,
    private readonly identity: IdentityAccessApi,
    private readonly seatBaseline: LicensingSeatBaselineApi,
    private readonly activations: InitialRecordActivationService,
  ) {}

  /** Registers an initial device record during open initialization and returns the created machine id. */
  async create(
    actor: AuthenticatedPrincipal,
    input: DeviceInitialRecordInput,
    now: Date = new Date(),
  ): Promise<string> {
    this.validatePreconditions(input);
    const bundledPlanIds = [...new Set(input.bundledPlanIds ?? [])].sort();
    const licenseKeyIds = [...new Set((input.keyActivations ?? []).map((item) => item.licenseKeyId))].sort();
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      if (!(await this.seatBaseline.holdInitializationOpen(tx))) throw new DeviceInitializationClosedError();

      const today = await this.organizationReads.businessToday(now, tx);
      const { assetCode, assetCodeOrigin } = await this.resolveAssetCode(tx, input, today);
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
        assetCodeOrigin,
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

      const keyActivationIds = await this.activations.openInitial(tx, actor, organization.id, device.id, {
        bundledPlanIds,
        licenseKeyIds,
        on: today,
        at: now,
        bySubstitute: handover?.bySubstitute ?? false,
      });

      await this.recordInitialAudit(tx, actor, organization.id, device, {
        assetCodeOrigin,
        deviceType: input.deviceType,
        serialNumber,
        bundledPlanIds,
        keyActivationIds,
        collectorInstalled,
        handover,
        registration,
      });

      return device.id;
    });
  }

  private validatePreconditions(input: DeviceInitialRecordInput): void {
    if (!input.holderEmployeeId && (input.handedOverOn !== undefined || input.collectorInstalled !== undefined)) {
      throw new DeviceHandoverWithoutHolderError();
    }
    if (input.assetCode !== undefined && !isLegacyCodeAcceptable(input.assetCode)) {
      throw new DeviceAssetCodeInvalidError();
    }
  }

  private async resolveAssetCode(
    tx: DbTx,
    input: DeviceInitialRecordInput,
    today: string,
  ): Promise<{ assetCode: string; assetCodeOrigin: 'GENERATED' | 'LEGACY' }> {
    if (input.assetCode !== undefined) {
      return { assetCode: input.assetCode, assetCodeOrigin: 'LEGACY' };
    }

    return {
      assetCode: await this.assetCodes.next(tx, input.deviceType, today),
      assetCodeOrigin: 'GENERATED',
    };
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
      if ((await this.organizationReads.notStartedAmong([holder.id], dates.today, tx)).has(holder.id)) {
        throw new EmployeeNotStartedError(holder.id);
      }
      const verdict = judgeDeviceActor({
        holderDepartmentId: null,
        recipientDepartmentId: null,
        actingByDepartment: new Map(),
        actor: actorEmployeeId,
        unplacedRequired: true,
        unplacedDesignee: null,
      });
      if (!verdict.allowed) throw new DeviceNotInChargeError();

      return { holderId: holder.id, validFrom, bySubstitute: verdict.bySubstitute };
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

  private async recordInitialAudit(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    device: { id: string; assetCode: string; hostname: string },
    details: {
      assetCodeOrigin: 'GENERATED' | 'LEGACY';
      deviceType: AssetDeviceType;
      serialNumber: string | null;
      bundledPlanIds: readonly string[];
      keyActivationIds: readonly string[];
      collectorInstalled: boolean;
      handover: { holderId: string; validFrom: string; bySubstitute: boolean } | null;
      registration: RegistrationRecord | null;
    },
  ): Promise<void> {
    const after: { [key: string]: AuditValue } = {
      assetCode: device.assetCode,
      assetCodeOrigin: details.assetCodeOrigin,
      deviceType: details.deviceType,
      hostname: device.hostname,
      serialNumber: details.serialNumber,
      bundledPlanIds: [...details.bundledPlanIds],
      keyActivationIds: [...details.keyActivationIds],
    };
    if (details.handover && details.registration) {
      after.holderEmployeeId = details.handover.holderId;
      after.registrationId = details.registration.id;
      after.validFrom = details.handover.validFrom;
      after.collectorInstalled = details.collectorInstalled;
    }
    if (details.handover?.bySubstitute) after.bySubstitute = true;
    await this.audit.record(
      tx,
      devicesEvent(byUser(actor), organizationId, 'DEVICE.INITIAL_RECORDED', 'ManagedDevice', device.id, null, after),
    );
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The register of machines was used before installation');

    return organization;
  }
}
